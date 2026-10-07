"""Turns a submission into trait scores: validates answers against the item bank, then scores with the
pure engine. Used by both the mock and the live gateway, so scoring is real in MOCK_MODE too."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

from app.assessment.bank import DIFFICULTY_WEIGHT, ItemBank, Scale, public_id
from app.core.errors import AppError, ErrorCode
from app.engine import psychometrics as pm
from app.schemas.assessment import (
    Answer,
    Instrument,
    Question,
    QuestionOption,
    QuestionType,
    SubmitResult,
    TraitScore,
)


def instruments(bank: ItemBank) -> list[Instrument]:
    return [
        Instrument(
            code=i.code,
            name=i.name,
            description=i.description,
            framework=i.framework,
            version=i.version,
            question_count=len(i.items),
            est_minutes=i.est_minutes,
            time_limit_sec=i.time_limit_sec,
        )
        for i in bank.instruments.values()
    ]


def public_questions(bank: ItemBank, code: str) -> list[Question]:
    inst = bank.instrument(code)
    if inst is None:
        raise AppError(ErrorCode.NOT_FOUND, f"Unknown instrument '{code}'")
    # Interleave traits round-robin (R, I, A, S, E, C, R, ...) so a student never sees a block of items
    # measuring the same trait; aptitude stays in increasing difficulty within each round.
    by_dim = {d: [i for i in inst.items if i.dimension == d] for d in inst.dimensions}
    ordered = []
    for round_no in range(max(len(v) for v in by_dim.values())):
        ordered += [items[round_no] for items in by_dim.values() if round_no < len(items)]
    is_mcq = inst.scale is Scale.MCQ
    scale_options = (
        None if is_mcq else [QuestionOption(key=o.key, label=o.label) for o in inst.option_labels()]
    )
    return [
        Question(
            id=public_id(item.id),
            instrument_code=code,
            section=inst.name,
            type=QuestionType.MCQ if is_mcq else QuestionType.LIKERT5,
            prompt=item.prompt,
            options=[QuestionOption(key=o.key, label=o.label) for o in item.options]
            if is_mcq
            else scale_options,
            order=n,
        )
        for n, item in enumerate(ordered, 1)
    ]


def score_submission(
    bank: ItemBank, code: str, answers: list[Answer], now: datetime | None = None
) -> SubmitResult:
    inst = bank.instrument(code)
    if inst is None:
        raise AppError(ErrorCode.NOT_FOUND, f"Unknown instrument '{code}'")
    items = {public_id(i.id): i for i in inst.items}
    errors: list[dict[str, str]] = []
    given: dict[str, Answer] = {}
    for a in answers:
        item = items.get(a.question_id)
        if item is None:
            errors.append({"question_id": a.question_id, "error": "not part of this instrument"})
        elif a.question_id in given:
            errors.append({"question_id": a.question_id, "error": "answered more than once"})
        elif item.is_mcq and a.value not in {o.key for o in item.options or []}:
            errors.append({"question_id": a.question_id, "error": "value must be one of the option keys"})
        elif not item.is_mcq and a.value not in {"1", "2", "3", "4", "5"}:
            errors.append({"question_id": a.question_id, "error": "value must be '1' to '5'"})
        else:
            given[a.question_id] = a
    if errors:
        raise AppError(
            ErrorCode.VALIDATION_ERROR, "Some answers do not match this instrument", {"errors": errors}
        )

    likert: dict[str, list[pm.LikertAnswer]] = {}
    mcq: dict[str, list[pm.McqAnswer]] = {}
    for item in inst.items:
        a = given.get(public_id(item.id))
        ms = a.response_ms if a else None
        if item.is_mcq:
            correct = None if a is None else a.value == item.answer
            mcq.setdefault(item.dimension, []).append(
                pm.McqAnswer(
                    correct=correct, weight=DIFFICULTY_WEIGHT[item.difficulty or "medium"], response_ms=ms
                )
            )
        else:
            likert.setdefault(item.dimension, []).append(
                pm.LikertAnswer(value=int(a.value) if a else None, reverse=item.reverse, response_ms=ms)
            )

    results = {d: pm.score_likert(d, ans) for d, ans in likert.items()}
    results |= {d: pm.score_mcq(d, ans) for d, ans in mcq.items()}
    flags = pm.quality_flags(likert, [x for v in mcq.values() for x in v])
    results = pm.apply_penalties(results, flags, likert_dims=set(likert))

    digest = hashlib.sha256(
        json.dumps([code, sorted((a.question_id, a.value) for a in given.values())]).encode()
    ).hexdigest()
    return SubmitResult(
        instrument_code=code,
        submission_id=f"sub_{digest[:24]}",
        answered=len(given),
        total_items=len(items),
        scored=[
            TraitScore(
                dimension=r.dimension,
                raw=r.raw,
                normalized=r.normalized,
                percentile=None,
                reliability=r.reliability,
                answered=r.answered,
                imputed=r.imputed,
            )
            for r in (results[d] for d in inst.dimensions)
        ],
        flags=flags,
        submitted_at=now or datetime.now(UTC),
    )
