"""Single source of 'today' so deadlines, freshness and roadmaps agree. DEMO_TODAY freezes it, but only while
DEMO_MODE is on, so a leftover setting can never freeze dates in a real deployment."""

from datetime import date

from app.core.config import get_settings


def today() -> date:
    s = get_settings()
    return (s.demo_today if s.demo_mode else None) or date.today()
