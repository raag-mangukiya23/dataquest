"""Student-career fit in the 19-dimension space.

centred cosine   cos_c = cosine(S - 0.5, C - 0.5), mapped to [0, 1]
dimension weight w_d  = 0.5 + |C_d - 0.5|           (traits a career really cares about count double)
shortfall        d_d  = max(0, C_d - S_d) for aptitude and grit (exceeding a requirement is fine),
                        |C_d - S_d| for interests, styles and values
mismatch         rms = sqrt(sum w_d d_d^2 / sum w_d)
distance score   max(0, 1 - rms / 0.4)    0.4 is the 90th-percentile mismatch of 2,000 random profiles,
                                         so a random student scores about 0.33 overall and a strong match ~0.8
classic fit      0.5 * cos_c + 0.5 * distance score
final fit        alpha * ml + (1 - alpha) * classic   only when a real ML model scored the career's domain
"""

from __future__ import annotations

import math
from collections.abc import Mapping

from app.core.dimensions import APTITUDE, DIMENSION_LABELS, DIMENSIONS
from app.ml.predictor import centered_cosine
from app.schemas.analysis import FitDetail, TraitGap

ONE_SIDED = set(APTITUDE) | {"grit"}
MISMATCH_SCALE = 0.4
GAP_THRESHOLD = 0.05


def dim_weight(required: float) -> float:
    return 0.5 + abs(required - 0.5)


def shortfall(dim: str, student: float, required: float) -> float:
    return max(0.0, required - student) if dim in ONE_SIDED else abs(required - student)


def classic_fit(student: Mapping[str, float], required: Mapping[str, float]) -> tuple[float, float, float]:
    s = [student.get(d, 0.5) for d in DIMENSIONS]
    r = [required.get(d, 0.5) for d in DIMENSIONS]
    cos = centered_cosine(s, r)
    weights = [dim_weight(x) for x in r]
    sq = sum(w * shortfall(d, a, b) ** 2 for w, d, a, b in zip(weights, DIMENSIONS, s, r, strict=True))
    dist_score = max(0.0, 1 - math.sqrt(sq / sum(weights)) / MISMATCH_SCALE)
    return round(cos, 4), round(dist_score, 4), round(0.5 * cos + 0.5 * dist_score, 4)


def compute_fit(
    student: Mapping[str, float],
    required: Mapping[str, float],
    ml_score: float | None = None,
    alpha: float = 0.5,
) -> FitDetail:
    cos, dist, classic = classic_fit(student, required)
    ml_used = ml_score is not None
    fit = alpha * ml_score + (1 - alpha) * classic if ml_score is not None else classic
    gaps = sorted(
        (
            TraitGap(
                dimension=d,
                label=DIMENSION_LABELS[d],
                student=round(student.get(d, 0.5), 4),
                required=round(required.get(d, 0.5), 4),
                gap=round(required.get(d, 0.5) - student.get(d, 0.5), 4),
            )
            for d in DIMENSIONS
            if required.get(d, 0.5) - student.get(d, 0.5) > GAP_THRESHOLD
        ),
        key=lambda g: -g.gap * dim_weight(g.required),
    )[:4]
    matches = sorted(
        (d for d in DIMENSIONS if required.get(d, 0.5) >= 0.65 and student.get(d, 0.5) >= 0.65),
        key=lambda d: -(required.get(d, 0.5) + student.get(d, 0.5)),
    )[:3]
    return FitDetail(
        fit=round(min(1.0, max(0.0, fit)), 4),
        cosine=cos,
        distance_score=dist,
        ml_score=round(ml_score, 4) if ml_score is not None else None,
        ml_used=ml_used,
        alpha=alpha if ml_used else 0.0,
        top_matching_dimensions=matches,
        gaps=gaps,
    )
