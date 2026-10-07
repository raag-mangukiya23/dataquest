"""Offline market refresh: import job-posting counts from a CSV instead of calling an API.

Why: some networks (college wifi, exam halls) block outbound calls to api.adzuna.com. The fetch can run
anywhere with open internet (`python scripts/fetch_market.py` on a phone hotspot) and the CSV is then
imported here, or a team member can fill the CSV by hand from a job portal's search counts.

CSV columns (header required; extra columns are ignored):
    career_slug, region_code, fetched_on (YYYY-MM-DD), posting_count, mean_salary (optional),
    keywords, source_name (optional), source_url (optional)

region_code "IN" means all of India: stored as a snapshot only (it is not a region in the catalog).

Each import creates a NEW dataset version (copying the active version's salary bands and market signals,
then adding the new signals) and activates it. Old runs keep pointing at the version they used, so they stay
reproducible and are flagged as outdated.
"""

from __future__ import annotations

import csv
import hashlib
import uuid
from collections.abc import Iterable, Sequence
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.etl.adapters.adzuna import DOCS_URL, NATIONAL, PostingCount, PostingQuery, to_signals
from app.models import catalog as cm

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "data" / "market" / "postings.csv"
REQUIRED = ("career_slug", "region_code", "fetched_on", "posting_count", "keywords")
MAX_AGE_DAYS = 180
API_SOURCE = "Adzuna job-search API"
DEFAULT_SOURCE = f"{API_SOURCE} (CSV export)"
ADZUNA_SOURCES = {API_SOURCE, DEFAULT_SOURCE}


def _snapshot_id(career_id: str, region: str, day: date) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"posting:{career_id}:{region}:{day.isoformat()}"))


def read_rows(path: Path) -> tuple[list[dict], list[str]]:
    if not path.exists():
        return [], [f"{path} not found"]
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            return [], [f"missing columns: {', '.join(missing)}"]
        return [dict(r) for r in reader], []


def parse_rows(
    rows: Iterable[dict], slugs: set[str], regions: set[str], today: date
) -> tuple[list[tuple[PostingCount, str, str | None]], list[str]]:
    """Returns (count, source_name, source_url) triples and warnings. Bad rows are skipped, never guessed."""
    out: list[tuple[PostingCount, str, str | None]] = []
    warnings: list[str] = []
    for i, r in enumerate(rows, start=2):
        slug, region = (r.get("career_slug") or "").strip(), (r.get("region_code") or "").strip()
        if slug not in slugs:
            warnings.append(f"line {i}: unknown career '{slug}', skipped")
            continue
        if region != NATIONAL and region not in regions:
            warnings.append(f"line {i}: unknown region '{region}', skipped")
            continue
        try:
            day = date.fromisoformat((r.get("fetched_on") or "").strip())
            count = int(float(r["posting_count"]))
            salary = float(r["mean_salary"]) if (r.get("mean_salary") or "").strip() else None
        except (ValueError, KeyError):
            warnings.append(f"line {i}: bad date or number, skipped")
            continue
        if count < 0 or day > today:
            warnings.append(f"line {i}: negative count or future date, skipped")
            continue
        if (today - day).days > MAX_AGE_DAYS:
            warnings.append(f"line {i}: data from {day} is older than {MAX_AGE_DAYS} days, skipped")
            continue
        url = (r.get("source_url") or "").strip() or None
        if url is not None and not url.startswith("https://"):
            warnings.append(f"line {i}: source_url must be https; dropped the URL")
            url = None
        out.append(
            (
                PostingCount(
                    PostingQuery(slug, (r.get("keywords") or slug).strip()[:120], region, None),
                    count,
                    salary,
                    day,
                ),
                (r.get("source_name") or "").strip()[:200] or DEFAULT_SOURCE,
                url,
            )
        )
    return out, warnings


def store_counts(
    db: Session, rows: Sequence[tuple[PostingCount, str, str | None]], today: date, label_hint: str
) -> dict:
    """Write snapshots, derive signals, and publish them as a new dataset version."""
    careers = {c.slug: c for c in db.scalars(select(cm.Career))}
    regions = {r.code: r for r in db.scalars(select(cm.Region))}
    active = db.scalar(select(cm.DatasetVersion).where(cm.DatasetVersion.is_active.is_(True)))
    if active is None:
        return {
            "status": "failed",
            "counts": {},
            "warnings": ["no active dataset version; run scripts/seed.py"],
        }
    if not rows:
        return {"status": "failed", "counts": {}, "warnings": ["no usable rows"]}

    for pc, _, _ in rows:
        cid = careers[pc.query.career_slug].id
        db.merge(
            cm.PostingSnapshot(
                id=_snapshot_id(cid, pc.query.region_code, pc.fetched_on),
                career_id=cid,
                region_code=pc.query.region_code,
                fetched_on=pc.fetched_on,
                posting_count=pc.count,
                mean_salary=pc.mean_salary,
                query=pc.query.keywords,
            )
        )
    db.flush()

    # Velocity: compare with the snapshot closest to 30 days earlier (21-45 day window).
    latest = max(pc.fetched_on for pc, _, _ in rows)
    lo, hi = latest - timedelta(days=45), latest - timedelta(days=21)
    by_id = {c.id: c.slug for c in careers.values()}
    previous: dict[tuple[str, str], tuple[int, int]] = {}
    for s in db.scalars(select(cm.PostingSnapshot).where(cm.PostingSnapshot.fetched_on.between(lo, hi))):
        key = (by_id.get(s.career_id, ""), s.region_code)
        gap = abs((latest - s.fetched_on).days - 30)
        if key not in previous or gap < previous[key][1]:
            previous[key] = (s.posting_count, gap)
    fresh = [pc for pc, _, _ in rows if pc.fetched_on == latest and pc.query.region_code != NATIONAL]
    meta = {(pc.query.career_slug, pc.query.region_code): (src, url) for pc, src, url in rows}
    drafts = to_signals(fresh, {k: v[0] for k, v in previous.items()})

    digest = hashlib.sha256(
        "|".join(f"{d.career_slug},{d.region_code},{d.posting_count},{d.as_of}" for d in drafts).encode()
    ).hexdigest()
    label = f"{active.label.split('+')[0]}+{label_hint}-{latest.isoformat()}-{digest[:6]}"
    if db.scalar(select(cm.DatasetVersion).where(cm.DatasetVersion.label == label)):
        return {"status": "skipped", "counts": {}, "warnings": [f"already imported as {label}"]}
    version = cm.DatasetVersion(
        label=label[:60], source=label_hint[:20], content_hash=digest, is_active=False, counts={}
    )
    db.add(version)
    db.flush()

    copied = 0
    for model in (cm.SalaryBand, cm.MarketSignal):
        for old in db.scalars(select(model).where(model.dataset_version_id == active.id)):
            cols = {c.key: getattr(old, c.key) for c in model.__table__.columns if c.key not in ("id",)}
            cols["dataset_version_id"] = version.id
            db.add(model(**cols))
            copied += 1

    period = latest.strftime("%Y-%m")
    disruption = {
        (s.career_id, s.region_id): s.disruption_risk
        for s in db.scalars(select(cm.MarketSignal).where(cm.MarketSignal.dataset_version_id == active.id))
    }
    added = 0
    for d in drafts:
        career, region = careers[d.career_slug], regions[d.region_code]
        src, url = meta[(d.career_slug, d.region_code)]
        verified = url is not None or src in ADZUNA_SOURCES
        velocity_note = (
            "" if d.job_velocity is not None else "; no snapshot ~30 days earlier, velocity set to 0"
        )
        db.add(
            cm.MarketSignal(
                career_id=career.id,
                region_id=region.id,
                period=period,
                demand_index=d.demand_index,
                job_velocity=d.job_velocity or 0.0,
                disruption_risk=disruption.get((career.id, region.id), career.automation_risk),
                source_name=src,
                source_url=url or (DOCS_URL if src in ADZUNA_SOURCES else None),
                as_of=d.as_of,
                confidence=0.7 if verified else 0.5,
                is_estimate=False,
                verification="verified" if verified else "secondary",
                verified_on=today,
                evidence=(
                    f"{d.posting_count} ads for '{d.keywords}' in {region.name} on {d.as_of.isoformat()}; "
                    f"demand = rank among {sum(1 for x in drafts if x.region_code == d.region_code)} careers"
                    f"{velocity_note}"
                )[:600],
                dataset_version_id=version.id,
            )
        )
        added += 1

    version.counts = {"market_signals_added": added, "rows_copied": copied}
    db.query(cm.DatasetVersion).update({cm.DatasetVersion.is_active: False}, synchronize_session=False)
    version.is_active = True
    db.flush()
    return {
        "status": "completed",
        "label": version.label,
        "counts": {
            "posting_snapshots": {"inserted": len(rows), "updated": 0, "skipped": 0},
            "market_signals": {"inserted": added, "updated": 0, "skipped": len(fresh) - added},
        },
        "warnings": [] if fresh else [f"no city-level rows on {latest}; only national snapshots stored"],
    }


def import_market_csv(db: Session, today: date, path: Path | None = None) -> dict:
    rows, errors = read_rows(path or DEFAULT_PATH)
    if errors:
        return {"status": "failed", "counts": {}, "warnings": errors}
    slugs = set(db.scalars(select(cm.Career.slug)))
    regions = set(db.scalars(select(cm.Region.code)))
    parsed, warnings = parse_rows(rows, slugs, regions, today)
    res = store_counts(db, parsed, today, "csv")
    res["warnings"] = warnings + res["warnings"]
    return res
