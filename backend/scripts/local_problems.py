"""Import local problems collected by partner schools (Atal Tinkering Labs) and organisations.

  python scripts/local_problems.py data/partners/local_problems_template.csv

See app/etl/local_csv.py for the columns. Rows are stored as 'unverified' until reviewed.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("LOG_LEVEL", "WARNING")

from app.core.clock import today  # noqa: E402
from app.db.session import get_sessionmaker  # noqa: E402
from app.etl.local_csv import import_local_csv  # noqa: E402
from app.services.catalog_db import invalidate  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    with get_sessionmaker()() as db:
        res = import_local_csv(db, Path(sys.argv[1]), today())
        db.commit() if res["imported"] else db.rollback()
    invalidate()
    print(json.dumps(res, indent=1))
    return 0 if res["imported"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
