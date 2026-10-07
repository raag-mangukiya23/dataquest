"""Final score, confidence, buckets and sensitivity analysis.

  final       = sum(w_c * raw_c for fit, market, affordability, roi, family_alignment) - w_d * disruption,
                clipped to [0, 1]; every recommendation returns each part's contribution
  confidence  = 0.85 * (0.7 + 0.3 * checked share) * freshness factor * (1 - imputation penalty)
                * (0.8 + 0.2 * mean trait reliability)
  sensitivity 64 deterministic scenarios: each weight moved +/-20 % alone (12), plus 52 random joint
              perturbations within +/-20 % (seeded by the input hash, so it is reproducible).
              robustness = mean Kendall tau between the base top-5 order and each scenario's order.
Buckets never hide ambitious paths: 'best for student' ignores money entirely, and high-fit careers that
are unaffordable today appear as stretch goals with the route that could make them reachable.
"""

from __future__ import annotations

import math
import random
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.schemas.analysis import (
    BucketItem,
    Contribution,
    RankChange,
    Recommendation,
    ScoreComponent,
    SensitivityReport,
)
from app.schemas.common import AffordabilityClass, Bucket

POSITIVE = (
    ScoreComponent.FIT,
    ScoreComponent.MARKET,
    ScoreComponent.AFFORDABILITY,
    ScoreComponent.ROI,
    ScoreComponent.FAMILY_ALIGNMENT,
)


def contributions(raw: Mapping[ScoreComponent, float], weights: Mapping[str, float]) -> list[Contribution]:
    return [
        Contribution(
            component=c,
            raw_value=round(raw[c], 4),
            weight=weights[c.value],
            contribution=round((-1 if c is ScoreComponent.DISRUPTION else 1) * weights[c.value] * raw[c], 4),
        )
        for c in (*POSITIVE, ScoreComponent.DISRUPTION)
    ]


def final_score(raw: Mapping[ScoreComponent, float], weights: Mapping[str, float]) -> float:
    total = (
        sum(weights[c.value] * raw[c] for c in POSITIVE)
        - weights["disruption"] * raw[ScoreComponent.DISRUPTION]
    )
    return round(min(1.0, max(0.0, total)), 4)


def kendall_tau(a: Sequence[str], b: Sequence[str]) -> float:
    common = [x for x in a if x in b]
    n = len(common)
    if n < 2:
        return 1.0
    pos = {x: i for i, x in enumerate(b)}
    s = 0
    for i in range(n):
        for j in range(i + 1, n):
            s += 1 if pos[common[i]] < pos[common[j]] else -1
    return round(s / math.comb(n, 2), 4)


@dataclass(frozen=True)
class Scored:
    id: str
    name: str
    raw: Mapping[ScoreComponent, float]


def _ranking(items: Sequence[Scored], weights: Mapping[str, float]) -> list[str]:
    return [x.id for x in sorted(items, key=lambda x: (-final_score(x.raw, weights), x.id))]


def sensitivity(
    items: Sequence[Scored],
    weights: Mapping[str, float],
    perturbation: float,
    scenarios: int,
    seed: int,
    top_k: int = 5,
) -> SensitivityReport:
    base = _ranking(items, weights)
    keys = list(weights)
    plans: list[tuple[str | None, dict[str, float]]] = []
    for k in keys:
        for sign in (1, -1):
            plans.append((k, {**weights, k: weights[k] * (1 + sign * perturbation)}))
    rng = random.Random(seed)
    while len(plans) < scenarios:
        plans.append(
            (None, {k: w * (1 + rng.uniform(-perturbation, perturbation)) for k, w in weights.items()})
        )
    names = {x.id: x.name for x in items}
    ranges = {cid: [i + 1, i + 1] for i, cid in enumerate(base)}
    taus, same_top, impact = [], 0, dict.fromkeys(keys, 0)
    for key, w in plans:
        order = _ranking(items, w)
        taus.append(kendall_tau(base[:top_k], order))
        same_top += order[0] == base[0]
        for i, cid in enumerate(order):
            ranges[cid][0] = min(ranges[cid][0], i + 1)
            ranges[cid][1] = max(ranges[cid][1], i + 1)
            if key:
                impact[key] += abs(i - base.index(cid))
    return SensitivityReport(
        perturbation=perturbation,
        scenarios=len(plans),
        robustness_score=round(max(0.0, sum(taus) / len(taus)), 4),
        top1_stability=round(same_top / len(plans), 4),
        rank_ranges=[
            RankChange(
                career_id=cid,
                career_name=names[cid],
                base_rank=i + 1,
                min_rank=ranges[cid][0],
                max_rank=ranges[cid][1],
            )
            for i, cid in enumerate(base)
        ],
        most_sensitive_weight=max(keys, key=lambda k: (impact[k], k)),
    )


def _hm(a: float, b: float) -> float:
    return 0.0 if a + b == 0 else 2 * a * b / (a + b)


HIDDEN_BY_COST_FIT = 0.75  # a well-fitting career pushed out of view by cost must stay visible


def buckets(
    recs: Sequence[Recommendation],
    gem_ids: set[str],
    stretch_reasons: Mapping[str, str],
    shown_ids: set[str] | None = None,
) -> dict[Bucket, list[BucketItem]]:
    """shown_ids = careers in the visible top-k list. A high-fit career that cost pushed out of that list is
    added to stretch goals, so money never silently hides what fits the student best."""

    def item(r: Recommendation, score: float, reason: str) -> BucketItem:
        return BucketItem(
            career_id=r.career.id, career_name=r.career.name, score=round(score, 4), reason=reason
        )

    infeasible = AffordabilityClass.INFEASIBLE
    top3 = {r.career.id for r in recs[:3]}
    by_fit = sorted(recs, key=lambda r: (-r.fit.fit, r.career.id))
    family = sorted(
        (r for r in recs if r.financial.affordability_class is not infeasible),
        key=lambda r: (-(0.5 * r.family.parent_acceptance + 0.5 * r.financial.affordability), r.career.id),
    )
    bridges = sorted(
        (r for r in recs if r.family.student_fit >= 0.45 and r.family.parent_acceptance >= 0.45),
        key=lambda r: (-r.family.bridge_score, r.career.id),
    )
    gems = [r for r in recs if r.career.id in gem_ids and r.career.id not in top3 and r.fit.fit >= 0.6]
    costly = (AffordabilityClass.STRETCH, AffordabilityClass.LOAN_DEPENDENT, infeasible)
    shown = {r.career.id for r in recs} if shown_ids is None else shown_ids
    in_view = shown | top3 | {r.career.id for r in by_fit[:3]}
    stretch = sorted(
        (
            r
            for r in recs
            if (r.financial.affordability_class is infeasible and r.fit.fit >= 0.6)
            or (
                r.career.id not in in_view
                and r.fit.fit >= HIDDEN_BY_COST_FIT
                and r.financial.affordability_class in costly
            )
        ),
        key=lambda r: (-r.fit.fit, r.career.id),
    )

    def stretch_reason(r: Recommendation) -> str:
        if r.career.id in stretch_reasons:
            return stretch_reasons[r.career.id]
        if r.financial.affordability_class is infeasible:
            return "Out of budget today"
        label = r.financial.affordability_class.value.replace("_", "-")
        return f"Fits you well but ranked lower because of cost ({label}); see scholarships and loan options"

    return {
        Bucket.BEST_OVERALL: [item(r, r.final_score, "Highest blended score") for r in recs[:3]],
        Bucket.BEST_FOR_STUDENT: [
            item(r, r.fit.fit, "Closest match to your interests and abilities, whatever the cost")
            for r in by_fit[:3]
        ],
        Bucket.BEST_FOR_FAMILY: [
            item(
                r,
                0.5 * r.family.parent_acceptance + 0.5 * r.financial.affordability,
                "Affordable and close to your family's hopes",
            )
            for r in family[:3]
        ],
        Bucket.BRIDGE: [
            item(r, r.family.bridge_score, "Balances what you love with what your family values")
            for r in bridges[:2]
        ],
        Bucket.HIDDEN_GEMS: [
            item(
                r,
                r.final_score,
                "Less obvious path that fits you, linked to local work or a neighbouring field",
            )
            for r in gems[:2]
        ],
        Bucket.STRETCH_GOALS: [item(r, r.fit.fit, stretch_reason(r)) for r in stretch[:5]],
    }
