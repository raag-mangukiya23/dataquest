"""The item bank is valid, never leaks keys to clients, and scores submissions for real."""

import json
from collections import Counter

import pytest

from app.assessment import service
from app.assessment.bank import BANK_DIR, InstrumentSpec, get_bank, public_id
from app.core.dimensions import DIMENSIONS
from app.core.errors import AppError
from app.schemas.assessment import Answer


def test_bank_covers_every_dimension_once():
    bank = get_bank()
    dims = [d for inst in bank.instruments.values() for d in inst.dimensions]
    assert sorted(dims) == sorted(DIMENSIONS)
    assert bank.total_items == 74


def test_answer_keys_are_balanced_across_positions():
    apt = get_bank().instrument("aptitude_v1")
    assert Counter(i.answer for i in apt.items) == {"a": 4, "b": 4, "c": 4, "d": 4}


def test_public_questions_do_not_leak_trait_keying_or_answers(client):
    allowed = {"id", "instrument_code", "section", "type", "prompt", "options", "order"}
    for code in get_bank().instruments:
        questions = client.get(f"/api/v1/assessments/{code}/questions").json()["data"]
        for q in questions:
            assert set(q) == allowed, code
            assert all(set(o) == {"key", "label"} for o in q["options"])
        text = json.dumps(questions)
        for dim in DIMENSIONS:
            assert dim not in text, (code, dim)
        ids = [q["id"] for q in questions]
        assert all(i.startswith("q_") for i in ids) and len(ids) == len(set(ids))


def test_items_are_interleaved_not_blocked():
    qs = service.public_questions(get_bank(), "riasec_v1")
    bank = get_bank()
    first_six = [bank.by_public_id[q.id][1].dimension for q in qs[:6]]
    assert len(set(first_six)) == 6


def test_invalid_bank_is_rejected():
    raw = json.loads((BANK_DIR / "disposition_v1.json").read_text())
    raw["items"] = raw["items"][:2] + raw["items"][5:7]  # leaves dimensions with 2 items
    with pytest.raises(ValueError):
        InstrumentSpec.model_validate(raw)
    bad_key = json.loads((BANK_DIR / "aptitude_v1.json").read_text())
    bad_key["items"][0]["answer"] = "z"
    with pytest.raises(ValueError):
        InstrumentSpec.model_validate(bad_key)


def test_submission_validation_errors_are_explicit():
    bank = get_bank()
    good = service.public_questions(bank, "aptitude_v1")[0].id
    with pytest.raises(AppError) as e:
        service.score_submission(
            bank,
            "aptitude_v1",
            [
                Answer(question_id="q_doesnotexist", value="a"),
                Answer(question_id=good, value="z"),
            ],
        )
    assert len(e.value.details["errors"]) == 2


def test_perfect_aptitude_scores_one_and_wrong_answers_score_zero():
    bank = get_bank()
    inst = bank.instrument("aptitude_v1")
    right = [Answer(question_id=public_id(i.id), value=i.answer) for i in inst.items]
    res = service.score_submission(bank, "aptitude_v1", right)
    assert all(t.normalized == 1.0 for t in res.scored) and res.flags == []
    wrong = [
        Answer(question_id=public_id(i.id), value=next(o.key for o in i.options if o.key != i.answer))
        for i in inst.items
    ]
    assert all(t.normalized == 0.0 for t in service.score_submission(bank, "aptitude_v1", wrong).scored)


def test_submit_endpoint_scores_and_flags(client):
    qs = client.get("/api/v1/assessments/values_v1/questions").json()["data"]
    body = {"answers": [{"question_id": q["id"], "value": "5", "response_ms": 3000} for q in qs]}
    data = client.post("/api/v1/assessments/values_v1/submit", json=body).json()["data"]
    assert "straight_lining" in data["flags"]
    assert data["answered"] == data["total_items"] == 12
    assert all(t["percentile"] is None for t in data["scored"])
    bad = client.post(
        "/api/v1/assessments/values_v1/submit", json={"answers": [{"question_id": "x", "value": "9"}]}
    )
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "VALIDATION_ERROR"


def test_demo_persona_profile_comes_from_scored_answers(client):
    from app.mocks import persona

    traits = client.get("/api/v1/students/any/traits").json()["data"]
    assert traits["vector"] == persona.VECTOR
    assert all(t["percentile"] is None for t in traits["traits"])
    assert traits["top_riasec_code"] == "IAR"
    run = client.get("/api/v1/demo/personas").json()["data"][0]["baseline_run_id"]
    vec = client.get(f"/api/v1/analysis/runs/{run}").json()["data"]["student_vector"]
    assert vec == persona.VECTOR


def test_pilot_analysis_reports_every_trait(tmp_path):
    import csv
    import random

    from scripts.pilot_analysis import analyse, load

    bank = get_bank()
    rng = random.Random(3)
    path = tmp_path / "pilot.csv"
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["respondent_id", "question_id", "value"])
        for r in range(12):
            for inst in bank.instruments.values():
                for it in inst.items:
                    v = rng.choice("abcd") if it.is_mcq else str(rng.randint(1, 5))
                    w.writerow([f"s{r}", public_id(it.id), v])
    lines = analyse(load(path))
    for d in DIMENSIONS:
        assert any(line.startswith(d) for line in lines), d
