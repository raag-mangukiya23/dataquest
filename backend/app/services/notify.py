"""Deadline reminder delivery. The outbox (reminders table) is filled by the API; this sends what is due.

Providers: "console" (logs the message; for demos and development) and "twilio" (SMS and WhatsApp).
Rules in India: bulk SMS needs DLT registration (sender ID and message templates) with a telecom operator,
and business-initiated WhatsApp messages need a pre-approved template. Register both before going live.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Protocol

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import engagement as em
from app.models import identity as im

log = logging.getLogger("prism.notify")
TWILIO_API = "https://api.twilio.com/2010-04-01"


class Provider(Protocol):
    name: str

    def send(self, channel: str, to: str, body: str) -> None: ...


class ConsoleProvider:
    name = "console"

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    def send(self, channel: str, to: str, body: str) -> None:
        masked = to[:3] + "*" * max(0, len(to) - 6) + to[-3:]
        log.info("reminder via %s to %s: %s", channel, masked, body)
        self.sent.append((channel, to, body))


class TwilioProvider:
    name = "twilio"

    def __init__(
        self, sid: str, token: str, from_sms: str | None, from_whatsapp: str | None, client=None
    ) -> None:
        self.sid, self.token = sid, token
        self.from_sms, self.from_whatsapp = from_sms, from_whatsapp
        self.client = client or httpx.Client(timeout=10)

    def send(self, channel: str, to: str, body: str) -> None:
        if channel == "whatsapp":
            if not self.from_whatsapp:
                raise ValueError("TWILIO_FROM_WHATSAPP not set")
            sender, to = f"whatsapp:{self.from_whatsapp}", f"whatsapp:{to}"
        else:
            if not self.from_sms:
                raise ValueError("TWILIO_FROM_SMS not set")
            sender = self.from_sms
        r = self.client.post(
            f"{TWILIO_API}/Accounts/{self.sid}/Messages.json",
            data={"To": to, "From": sender, "Body": body},
            auth=(self.sid, self.token),
        )
        r.raise_for_status()


def provider_from_settings() -> Provider:
    s = get_settings()
    if s.reminder_provider == "twilio":
        if not (s.twilio_account_sid and s.twilio_auth_token):
            raise RuntimeError("REMINDER_PROVIDER=twilio needs TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN")
        return TwilioProvider(
            s.twilio_account_sid, s.twilio_auth_token, s.twilio_from_sms, s.twilio_from_whatsapp
        )
    return ConsoleProvider()


def message(r: em.Reminder, today: date) -> str:
    days = (r.due - today).days
    when = "today" if days == 0 else "tomorrow" if days == 1 else f"in {days} days"
    return (
        f"PRISM reminder: {r.title} on {r.due.strftime('%d %b %Y')} ({when}). "
        "Confirm the date on the official website. Reply STOP to stop reminders."
    )[:320]


def send_due(db: Session, today: date, provider: Provider | None = None) -> dict[str, int]:
    """Send every pending reminder whose send date has come. Past deadlines are cancelled, not sent."""
    provider = provider or provider_from_settings()
    counts = {"sent": 0, "failed": 0, "cancelled": 0}
    due = db.scalars(
        select(em.Reminder).where(em.Reminder.status == "pending", em.Reminder.send_on <= today)
    ).all()
    for r in due:
        if r.due < today:
            r.status, r.error = "cancelled", "deadline already passed"
            counts["cancelled"] += 1
            continue
        u = db.get(im.User, r.user_id)
        to = (
            (u.phone if r.channel in ("sms", "whatsapp") else u.email) if u and u.deleted_at is None else None
        )
        if not to:
            r.status, r.error = "failed", "no phone or email on the account"
            counts["failed"] += 1
            continue
        try:
            provider.send(r.channel, to, message(r, today))
            r.status, r.sent_at = "sent", datetime.now(UTC)
            counts["sent"] += 1
        except (httpx.HTTPError, ValueError) as e:
            r.status, r.error = "failed", f"{provider.name}: {type(e).__name__}"[:200]
            counts["failed"] += 1
    return counts
