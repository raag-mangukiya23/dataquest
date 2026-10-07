"""Send deadline reminders that are due today. Run once a day (cron, a scheduled job on Render, etc.).

python scripts/send_reminders.py              # REMINDER_PROVIDER=console logs the messages
REMINDER_PROVIDER=twilio python scripts/send_reminders.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("LOG_LEVEL", "INFO")

from app.core.clock import today  # noqa: E402
from app.db.session import get_sessionmaker  # noqa: E402
from app.services.notify import send_due  # noqa: E402


def main() -> int:
    with get_sessionmaker()() as db:
        counts = send_due(db, today())
        db.commit()
    print(json.dumps(counts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
