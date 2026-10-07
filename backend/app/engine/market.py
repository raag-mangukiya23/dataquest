"""Market blend: demand where this student could realistically work.

region weight   home region 1.0; preferred regions 0.8; other Indian regions 0.25 + 0.5 * relocation;
                abroad 0.6 * abroad willingness (relocation and abroad = mean of student and family)
observation w   region weight * signal confidence * 0.5^(age / 30 days)
market score    0.7 * demand + 0.3 * clip(0.5 + job_velocity, 0, 1)
CI half-width   0.04 + 0.12 * (1 - mean weight)
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date

from app.engine.freshness import decay_weight
from app.engine.types import FamilyInput, StudentInput
from app.schemas.analysis import MarketDetail
from app.schemas.catalog import MarketSignal, Region
from app.schemas.common import RegionType

SIGNAL_HALF_LIFE_DAYS = 30


def region_weights(
    student: StudentInput, family: FamilyInput, regions: Mapping[str, Region]
) -> dict[str, float]:
    relocate = (student.willing_to_relocate + family.relocation) / 2
    abroad = (student.willing_abroad + family.abroad) / 2
    preferred = set(student.preferred_regions) | set(family.preferred_regions)
    out: dict[str, float] = {}
    for code, r in regions.items():
        if code == student.region_code:
            w = 1.0
        elif code in preferred:
            w = 0.8
        elif r.type is RegionType.INTERNATIONAL:
            w = 0.6 * abroad
        else:
            w = 0.25 + 0.5 * relocate
        if w > 0:
            out[code] = round(w, 4)
    return out


def blend(
    career_id: str,
    signals: Sequence[MarketSignal],
    weights: Mapping[str, float],
    automation_risk: float,
    today: date,
) -> MarketDetail:
    rows = [s for s in signals if s.career.id == career_id and s.region_code in weights]
    if not rows:
        return MarketDetail(
            market_score=0.5,
            demand_index=0.5,
            job_velocity=0.0,
            disruption_risk=automation_risk,
            regions_considered=[],
            ci_low=0.3,
            ci_high=0.7,
            signals_as_of="",
        )
    ws = [
        weights[s.region_code]
        * s.provenance.confidence
        * decay_weight(s.provenance.as_of, today, SIGNAL_HALF_LIFE_DAYS)
        for s in rows
    ]
    total = sum(ws) or 1.0
    demand = sum(w * s.demand_index for w, s in zip(ws, rows, strict=True)) / total
    velocity = sum(w * s.job_velocity for w, s in zip(ws, rows, strict=True)) / total
    disruption = sum(w * s.disruption_risk for w, s in zip(ws, rows, strict=True)) / total
    score = 0.7 * demand + 0.3 * max(0.0, min(1.0, 0.5 + velocity))
    mean_w = total / len(ws)
    half = 0.04 + 0.12 * (1 - min(1.0, mean_w))
    return MarketDetail(
        market_score=round(score, 4),
        demand_index=round(demand, 4),
        job_velocity=round(velocity, 4),
        disruption_risk=round(max(disruption, 0.0), 4),
        regions_considered=sorted({s.region_code for s in rows}, key=lambda c: (-weights[c], c)),
        ci_low=round(max(0.0, score - half), 4),
        ci_high=round(min(1.0, score + half), 4),
        signals_as_of=max(s.provenance.as_of for s in rows).isoformat(),
    )
