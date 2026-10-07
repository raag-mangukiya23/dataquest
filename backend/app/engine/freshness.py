"""Data freshness and time-decay: pure functions, no I/O.

Each dataset has a cadence, meaning how often its publisher updates it (daily postings, monthly
payroll data, an annual fee notice). Freshness is judged against that cadence, not against
wall-clock "real time":

  age            = today - as_of (days)
  status         = fresh  if age <= cadence
                   aging  if age <= 2 * cadence
                   stale  otherwise
  decay weight   = 0.5 ** (age / half_life)            half-life defaults to the cadence
  blended value  = sum(w_i * conf_i * x_i) / sum(w_i * conf_i)
  CI half-width  = 0.04 + 0.12 * (1 - mean(w_i * conf_i))   wider when evidence is old or weak
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.schemas.common import Freshness

FRESHNESS_CONFIDENCE = {Freshness.FRESH: 1.0, Freshness.AGING: 0.9, Freshness.STALE: 0.75}


@dataclass(frozen=True)
class Observation:
    value: float
    as_of: date
    confidence: float = 1.0


@dataclass(frozen=True)
class Blend:
    value: float
    weight: float
    ci_low: float
    ci_high: float
    freshness: Freshness


def age_days(as_of: date, today: date) -> int:
    return max(0, (today - as_of).days)


def freshness_status(as_of: date, today: date, cadence_days: int) -> Freshness:
    if cadence_days <= 0:
        raise ValueError("cadence_days must be positive")
    age = age_days(as_of, today)
    if age <= cadence_days:
        return Freshness.FRESH
    if age <= 2 * cadence_days:
        return Freshness.AGING
    return Freshness.STALE


def decay_weight(as_of: date, today: date, half_life_days: int) -> float:
    if half_life_days <= 0:
        raise ValueError("half_life_days must be positive")
    return 0.5 ** (age_days(as_of, today) / half_life_days)


def blend(
    observations: Sequence[Observation],
    today: date,
    half_life_days: int,
    cadence_days: int,
    lo: float = 0.0,
    hi: float = 1.0,
) -> Blend | None:
    """Confidence- and recency-weighted mean of several observations of the same quantity."""
    if not observations:
        return None
    weights = [
        decay_weight(o.as_of, today, half_life_days) * max(0.0, min(1.0, o.confidence)) for o in observations
    ]
    total = sum(weights)
    if total == 0:
        return None
    value = sum(w * o.value for w, o in zip(weights, observations, strict=True)) / total
    mean_w = total / len(weights)
    half = 0.04 + 0.12 * (1 - mean_w)
    newest = max(o.as_of for o in observations)
    return Blend(
        value=round(value, 4),
        weight=round(mean_w, 4),
        ci_low=round(max(lo, value - half), 4),
        ci_high=round(min(hi, value + half), 4),
        freshness=freshness_status(newest, today, cadence_days),
    )


def worst(statuses: Sequence[Freshness]) -> Freshness:
    order = [Freshness.FRESH, Freshness.AGING, Freshness.STALE]
    return max(statuses, key=order.index) if statuses else Freshness.FRESH
