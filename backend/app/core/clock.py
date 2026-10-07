"""Single source of 'today' so deadlines, freshness and roadmaps agree (and DEMO_TODAY can freeze it)."""

from datetime import date

from app.core.config import get_settings


def today() -> date:
    return get_settings().demo_today or date.today()
