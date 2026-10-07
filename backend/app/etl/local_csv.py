"""Import real local problems collected by partner schools (Atal Tinkering Labs, NGOs, district offices).

CSV columns (header required; lists are separated by semicolons):
    key, title, problem_statement, region_code, district, pincodes, steam_tags, career_slugs, skills,
    partner_type, starter_project, source_name, source_url (optional), as_of (YYYY-MM-DD)

Rows arrive 'unverified' and marked as estimates until a counsellor or admin reviews them; the API shows that
status next to every opportunity. Re-importing the same key updates the row.
"""

from __future__ import annotations

import csv
import re
from datetime import date
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.etl.loader import _upsert
from app.models import catalog as cm

REQUIRED = (
    "key",
    "title",
    "problem_statement",
    "region_code",
    "district",
    "pincodes",
    "steam_tags",
    "career_slugs",
    "skills",
    "partner_type",
    "starter_project",
    "source_name",
    "as_of",
)
STEAM = {"S", "T", "E", "A", "M"}


def _list(v: str | None) -> list[str]:
    return [x.strip() for x in (v or "").split(";") if x.strip()]


def import_local_csv(db: Session, path: Path, today: date) -> dict:
    if not path.exists():
        return {"status": "failed", "imported": 0, "warnings": [f"{path} not found"]}
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            return {"status": "failed", "imported": 0, "warnings": [f"missing columns: {', '.join(missing)}"]}
        rows = list(reader)
    regions = {r.code: r for r in db.scalars(select(cm.Region))}
    careers = {c.slug: c for c in db.scalars(select(cm.Career))}
    warnings: list[str] = []
    imported = 0
    for i, r in enumerate(rows, start=2):
        key = (r["key"] or "").strip()
        if not re.fullmatch(r"[a-z0-9-]{3,60}", key):
            warnings.append(f"line {i}: key must be 3-60 lowercase letters, digits or dashes")
            continue
        region = regions.get((r["region_code"] or "").strip())
        pins = _list(r["pincodes"])
        tags = [t.upper() for t in _list(r["steam_tags"])]
        slugs = _list(r["career_slugs"])
        unknown = [s for s in slugs if s not in careers]
        try:
            as_of = date.fromisoformat((r["as_of"] or "").strip())
        except ValueError:
            as_of = None
        problems = [
            "unknown region" if region is None else "",
            "pincodes must be 6 digits"
            if not pins or not all(re.fullmatch(r"\d{6}", p) for p in pins)
            else "",
            "steam_tags must be from S;T;E;A;M" if not tags or set(tags) - STEAM else "",
            f"unknown careers: {', '.join(unknown)}" if unknown or not slugs else "",
            "as_of must be a past date (YYYY-MM-DD)" if as_of is None or as_of > today else "",
            "title, problem_statement and starter_project are required"
            if not all((r[k] or "").strip() for k in ("title", "problem_statement", "starter_project"))
            else "",
        ]
        if any(problems):
            warnings.append(f"line {i} ({key}): " + "; ".join(p for p in problems if p))
            continue
        url = (r.get("source_url") or "").strip() or None
        row = _upsert(
            db,
            cm.LocalOpportunity,
            "key",
            key,
            {
                "region_id": region.id,
                "title": r["title"].strip()[:200],
                "problem_statement": r["problem_statement"].strip()[:600],
                "district": r["district"].strip()[:80],
                "pincodes": pins,
                "steam_tags": tags,
                "skills": _list(r["skills"])[:8],
                "partner_type": r["partner_type"].strip()[:60],
                "starter_project": r["starter_project"].strip()[:400],
                "source_name": r["source_name"].strip()[:200],
                "source_url": url if url and url.startswith("https://") else None,
                "as_of": as_of,
                "confidence": 0.6,
                "is_estimate": True,
                "verification": "unverified",
                "verified_on": None,
                "evidence": f"Submitted by {r['source_name'].strip()} on {as_of.isoformat()}; awaiting review"[
                    :600
                ],
            },
        )
        db.execute(
            delete(cm.LocalOpportunityCareer).where(cm.LocalOpportunityCareer.local_opportunity_id == row.id)
        )
        for s in dict.fromkeys(slugs):
            db.add(cm.LocalOpportunityCareer(local_opportunity_id=row.id, career_id=careers[s].id))
        imported += 1
    db.flush()
    return {"status": "completed" if imported else "failed", "imported": imported, "warnings": warnings}
