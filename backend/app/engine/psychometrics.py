"""Psychometric scoring: pure functions, no I/O.

Formulas (also served by /system/methodology):

  Likert keying       keyed = 6 - v for reverse-scored items, else v            (v in 1..5)
  Likert score        normalized = (mean(keyed) - 1) / 4                         -> [0, 1]
  Consistency         c = 1 - pstdev(keyed) / 2                                  (2 = max SD on a 1..5 scale)
  Likert reliability  coverage * (0.5 + 0.5 * c)                                coverage = answered / items
  Aptitude score      p = sum(w_i * correct_i) / sum(w_i),  w = 1 / 1.5 / 2 for easy / medium / hard
                      normalized = clip((p - 1/k) / (1 - 1/k), 0, 1)            chance-corrected, k options
  Missing data        Likert dimension with < 50 % answered, or an aptitude section with no answers,
                      is imputed at the neutral 0.5 and marked imputed (confidence penalty downstream).
                      Skipped aptitude items inside an attempted section count as wrong.
  Quality flags       straight_lining, speeding, contradictory_answers:<dim>, incomplete;
                      each lowers the reliability of the affected dimensions.
  Percentiles         only against a real norm group of at least MIN_NORM_N students; otherwise None.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace

from app.core.dimensions import DIMENSIONS, RIASEC

LIKERT_MIN = 1
LIKERT_MAX = 5
NEUTRAL = 0.5
MIN_COVERAGE = 0.5
MIN_NORM_N = 200

STRAIGHT_LINE_MIN_ITEMS = 8
SPEED_LIKERT_MEDIAN_MS = 800
SPEED_MCQ_MEDIAN_MS = 3000
INCOMPLETE_BELOW = 0.8

PENALTY_STRAIGHT_LINING = 0.5
PENALTY_SPEEDING = 0.7
PENALTY_CONTRADICTION = 0.6


@dataclass(frozen=True)
class LikertAnswer:
    value: int | None  # 1..5, None = skipped
    reverse: bool = False
    response_ms: int | None = None


@dataclass(frozen=True)
class McqAnswer:
    correct: bool | None  # None = skipped
    weight: float = 1.0
    response_ms: int | None = None


@dataclass(frozen=True)
class DimensionResult:
    dimension: str
    raw: float
    normalized: float
    reliability: float
    answered: int
    total: int
    imputed: bool


@dataclass(frozen=True)
class VectorResult:
    vector: dict[str, float]
    imputed: list[str]
    completeness: float


def _clip01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def keyed(value: int, reverse: bool) -> int:
    if not LIKERT_MIN <= value <= LIKERT_MAX:
        raise ValueError(f"Likert value out of range: {value}")
    return LIKERT_MIN + LIKERT_MAX - value if reverse else value


def score_likert(dimension: str, answers: Sequence[LikertAnswer]) -> DimensionResult:
    if not answers:
        raise ValueError(f"{dimension}: no items")
    total = len(answers)
    values = [keyed(a.value, a.reverse) for a in answers if a.value is not None]
    coverage = len(values) / total
    if not values or coverage < MIN_COVERAGE:
        return DimensionResult(
            dimension,
            raw=3.0,
            normalized=NEUTRAL,
            reliability=0.0,
            answered=len(values),
            total=total,
            imputed=True,
        )
    mean = statistics.fmean(values)
    consistency = 1.0 - statistics.pstdev(values) / 2 if len(values) > 1 else 1.0
    return DimensionResult(
        dimension,
        raw=round(mean, 4),
        normalized=round(_clip01((mean - LIKERT_MIN) / (LIKERT_MAX - LIKERT_MIN)), 4),
        reliability=round(_clip01(coverage * (0.5 + 0.5 * consistency)), 4),
        answered=len(values),
        total=total,
        imputed=False,
    )


def score_mcq(dimension: str, answers: Sequence[McqAnswer], n_options: int = 4) -> DimensionResult:
    if not answers:
        raise ValueError(f"{dimension}: no items")
    if n_options < 2:
        raise ValueError("n_options must be at least 2")
    total = len(answers)
    answered = sum(1 for a in answers if a.correct is not None)
    if answered == 0:
        return DimensionResult(
            dimension, raw=0.0, normalized=NEUTRAL, reliability=0.0, answered=0, total=total, imputed=True
        )
    total_w = sum(a.weight for a in answers)
    correct_w = sum(a.weight for a in answers if a.correct)
    p = correct_w / total_w
    chance = 1 / n_options
    return DimensionResult(
        dimension,
        raw=float(sum(1 for a in answers if a.correct)),
        normalized=round(_clip01((p - chance) / (1 - chance)), 4),
        reliability=round(answered / total, 4),
        answered=answered,
        total=total,
        imputed=False,
    )


def quality_flags(likert: Mapping[str, Sequence[LikertAnswer]], mcq: Sequence[McqAnswer] = ()) -> list[str]:
    flags: list[str] = []
    all_likert = [a for answers in likert.values() for a in answers]
    answered = [a.value for a in all_likert if a.value is not None]
    if len(answered) >= STRAIGHT_LINE_MIN_ITEMS and len(set(answered)) == 1:
        flags.append("straight_lining")

    likert_ms = [a.response_ms for a in all_likert if a.response_ms is not None and a.value is not None]
    mcq_ms = [a.response_ms for a in mcq if a.response_ms is not None and a.correct is not None]
    if (len(likert_ms) >= 5 and statistics.median(likert_ms) < SPEED_LIKERT_MEDIAN_MS) or (
        len(mcq_ms) >= 3 and statistics.median(mcq_ms) < SPEED_MCQ_MEDIAN_MS
    ):
        flags.append("speeding")

    for dim, answers in likert.items():
        forward = [a.value for a in answers if not a.reverse and a.value is not None]
        reverse = [a.value for a in answers if a.reverse and a.value is not None]
        if forward and reverse:
            f, r = statistics.fmean(forward), statistics.fmean(reverse)
            if (f >= 4 and r >= 4) or (f <= 2 and r <= 2):
                flags.append(f"contradictory_answers:{dim}")

    items = len(all_likert) + len(mcq)
    done = len(answered) + sum(1 for a in mcq if a.correct is not None)
    if items and done / items < INCOMPLETE_BELOW:
        flags.append("incomplete")
    return flags


def apply_penalties(
    results: Mapping[str, DimensionResult], flags: Sequence[str], likert_dims: set[str]
) -> dict[str, DimensionResult]:
    out: dict[str, DimensionResult] = {}
    for dim, r in results.items():
        factor = 1.0
        if "straight_lining" in flags and dim in likert_dims:
            factor *= PENALTY_STRAIGHT_LINING
        if "speeding" in flags:
            factor *= PENALTY_SPEEDING
        if f"contradictory_answers:{dim}" in flags:
            factor *= PENALTY_CONTRADICTION
        out[dim] = replace(r, reliability=round(r.reliability * factor, 4))
    return out


def build_vector(results: Mapping[str, DimensionResult]) -> VectorResult:
    vector: dict[str, float] = {}
    imputed: list[str] = []
    for d in DIMENSIONS:
        r = results.get(d)
        if r is None or r.imputed:
            vector[d] = NEUTRAL
            imputed.append(d)
        else:
            vector[d] = r.normalized
    return VectorResult(
        vector=vector, imputed=imputed, completeness=round(1 - len(imputed) / len(DIMENSIONS), 4)
    )


def holland_code(vector: Mapping[str, float]) -> str:
    """Top three RIASEC letters; ties keep the canonical R-I-A-S-E-C order."""
    ranked = sorted(RIASEC, key=lambda d: (-vector.get(d, NEUTRAL), RIASEC.index(d)))
    return "".join(d[-1].upper() for d in ranked[:3])


def percentile_rank(value: float, sample: Sequence[float], min_n: int = MIN_NORM_N) -> float | None:
    """Mid-rank percentile against a real norm sample; None until the sample is large enough."""
    if len(sample) < min_n:
        return None
    below = sum(1 for s in sample if s < value)
    equal = sum(1 for s in sample if s == value)
    return round(100 * (below + 0.5 * equal) / len(sample), 1)


def cronbach_alpha(rows: Sequence[Sequence[float]]) -> float | None:
    """Internal-consistency reliability of one scale. rows = respondents x keyed item scores."""
    if len(rows) < 2:
        return None
    k = len(rows[0])
    if k < 2 or any(len(r) != k for r in rows):
        return None
    item_vars = [statistics.variance([r[i] for r in rows]) for i in range(k)]
    total_var = statistics.variance([sum(r) for r in rows])
    if total_var == 0:
        return None
    return round(k / (k - 1) * (1 - sum(item_vars) / total_var), 4)


def item_total_correlations(rows: Sequence[Sequence[float]]) -> list[float | None]:
    """Corrected item-total correlation per item (item vs. the sum of the other items)."""
    if len(rows) < 3:
        return [None] * (len(rows[0]) if rows else 0)
    k = len(rows[0])
    out: list[float | None] = []
    for i in range(k):
        item = [r[i] for r in rows]
        rest = [sum(r) - r[i] for r in rows]
        out.append(_pearson(item, rest))
    return out


def _pearson(x: Sequence[float], y: Sequence[float]) -> float | None:
    mx, my = statistics.fmean(x), statistics.fmean(y)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y, strict=True))
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    if sxx == 0 or syy == 0:
        return None
    return round(sxy / math.sqrt(sxx * syy), 4)
