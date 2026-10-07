"""Market data without a live API connection on the demo network.

  # 1. Anywhere with open internet (phone hotspot, home): fetch posting counts into a CSV. No database needed.
  ADZUNA_APP_ID=... ADZUNA_APP_KEY=... python scripts/market.py fetch --out data/market/postings.csv

  # 2. On the demo machine (college wifi is fine): import the CSV into a new dataset version.
  python scripts/market.py import data/market/postings.csv

The same CSV can be filled by hand from any job portal's search counts; see app/etl/market_csv.py
for the columns. Set source_name and source_url per row so every figure keeps its provenance.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("LOG_LEVEL", "WARNING")

from app.core.clock import today  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.etl.adapters.adzuna import AdzunaAdapter, plan_queries  # noqa: E402
from app.etl.market_csv import API_SOURCE, DEFAULT_PATH, import_market_csv  # noqa: E402

COLUMNS = [
    "career_slug",
    "region_code",
    "fetched_on",
    "posting_count",
    "mean_salary",
    "keywords",
    "source_name",
]


def fetch(out: Path, budget: int) -> int:
    s = get_settings()
    feed = AdzunaAdapter(s.adzuna_app_id, s.adzuna_app_key)
    if not feed.enabled:
        print("Set ADZUNA_APP_ID and ADZUNA_APP_KEY (free at https://developer.adzuna.com).")
        return 2
    careers = json.loads((ROOT / "data/seed/careers.json").read_text())["careers"]
    regions = json.loads((ROOT / "data/seed/regions.json").read_text())["regions"]
    cities = [(r["code"], r["name"]) for r in regions if r["code"].startswith("IN-")]
    queries = plan_queries(
        [(c["slug"], c["search_keywords"]) for c in careers], cities, budget, today().toordinal()
    )
    result = feed.fetch(queries, today(), budget)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for pc in result.counts:
            q = pc.query
            w.writerow(
                [
                    q.career_slug,
                    q.region_code,
                    pc.fetched_on,
                    pc.count,
                    pc.mean_salary or "",
                    q.keywords,
                    API_SOURCE,
                ]
            )
    print(f"wrote {len(result.counts)} rows to {out} ({result.calls} API calls)")
    for e in result.errors[:10]:
        print("  warning:", e)
    return 0 if result.counts else 1


def do_import(path: Path) -> int:
    from app.db.session import get_sessionmaker
    from app.services.catalog_db import invalidate

    with get_sessionmaker()() as db:
        res = import_market_csv(db, today(), path)
        if res["status"] == "completed":
            db.commit()
            invalidate()
        else:
            db.rollback()
    print(res["status"], res.get("label", ""), json.dumps(res["counts"]))
    for wmsg in res["warnings"][:20]:
        print("  warning:", wmsg)
    return 0 if res["status"] in ("completed", "skipped") else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--out", type=Path, default=DEFAULT_PATH)
    f.add_argument("--budget", type=int, default=get_settings().adzuna_daily_budget)
    i = sub.add_parser("import")
    i.add_argument("path", type=Path, nargs="?", default=DEFAULT_PATH)
    args = ap.parse_args()
    return fetch(args.out, args.budget) if args.cmd == "fetch" else do_import(args.path)


if __name__ == "__main__":
    raise SystemExit(main())
