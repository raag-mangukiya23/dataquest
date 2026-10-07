"""The demo student's actual questionnaire answers, and the profile the real engine computes from them.

No trait number in the fixtures is typed in by hand: answers are generated once to approximate the
intended profile, then scored by app.assessment.service exactly as a live submission would be.
The work-values 'financial reward' items are mostly skipped on purpose, so the demo shows imputation.
"""

from __future__ import annotations

from itertools import product

from app.assessment.bank import DIFFICULTY_WEIGHT, InstrumentSpec, ItemSpec, get_bank, public_id
from app.assessment.service import score_submission
from app.core.dimensions import DIMENSIONS
from app.engine import psychometrics as pm
from app.mocks import world as w
from app.schemas.assessment import Answer, SubmitResult, TraitScore

SKIPPED_ITEMS = {"values.val_financial.2", "values.val_financial.3"}
LIKERT_MS = 4_200
MCQ_MS = 48_000


def _likert(items: list[ItemSpec], target: float) -> list[Answer]:
    n = len(items)
    total = min(max(round((1 + 4 * target) * n), n), 5 * n)
    base, extra = divmod(total, n)
    out = []
    for i, item in enumerate(items):
        if item.id in SKIPPED_ITEMS:
            continue
        k = base + (1 if i < extra else 0)
        raw = 6 - k if item.reverse else k
        out.append(Answer(question_id=public_id(item.id), value=str(raw), response_ms=LIKERT_MS))
    return out


def _mcq(items: list[ItemSpec], target: float) -> list[Answer]:
    best: tuple[float, tuple[bool, ...]] | None = None
    for pattern in product((True, False), repeat=len(items)):
        score = pm.score_mcq(
            "x",
            [
                pm.McqAnswer(correct=c, weight=DIFFICULTY_WEIGHT[i.difficulty or "medium"])
                for c, i in zip(pattern, items, strict=True)
            ],
        ).normalized
        if best is None or abs(score - target) < best[0]:
            best = (abs(score - target), pattern)
    assert best is not None
    out = []
    for correct, item in zip(best[1], items, strict=True):
        wrong = next(o.key for o in item.options or [] if o.key != item.answer)
        out.append(
            Answer(
                question_id=public_id(item.id), value=item.answer if correct else wrong, response_ms=MCQ_MS
            )
        )
    return out


def _answers(inst: InstrumentSpec) -> list[Answer]:
    out: list[Answer] = []
    for dim in inst.dimensions:
        items = [i for i in inst.items if i.dimension == dim]
        target = w.STUDENT_TARGET_VECTOR[dim]
        out += _mcq(items, target) if items[0].is_mcq else _likert(items, target)
    return out


_bank = get_bank()
ANSWERS: dict[str, list[Answer]] = {code: _answers(inst) for code, inst in _bank.instruments.items()}
SUBMISSIONS: dict[str, SubmitResult] = {
    code: score_submission(_bank, code, answers, now=w.NOW) for code, answers in ANSWERS.items()
}
TRAITS: dict[str, TraitScore] = {t.dimension: t for s in SUBMISSIONS.values() for t in s.scored}
_vec = pm.build_vector(
    {
        d: pm.DimensionResult(d, t.raw, t.normalized, t.reliability, t.answered, t.answered, t.imputed)
        for d, t in TRAITS.items()
    }
)
VECTOR: dict[str, float] = _vec.vector
IMPUTED: list[str] = _vec.imputed
COMPLETENESS: float = _vec.completeness
HOLLAND_CODE: str = pm.holland_code(VECTOR)

assert set(TRAITS) == set(DIMENSIONS)
