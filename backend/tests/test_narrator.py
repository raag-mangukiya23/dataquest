"""Narrator: anonymised facts, number guard, template fallback. No real network calls."""

import json

import httpx
import pytest

from app.core.config import get_settings
from app.mocks.builders import analysis_run
from app.schemas.common import Role
from app.schemas.reports import Language
from app.services import narrator


@pytest.fixture
def grok(monkeypatch):
    monkeypatch.setenv("GROK_API_KEY", "test-key")
    get_settings.cache_clear()
    narrator._CACHE.clear()
    yield
    get_settings.cache_clear()
    narrator._CACHE.clear()


def fake(answer: dict | None = None, status: int = 200, seen: list | None = None) -> httpx.Client:
    def handler(req: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(json.loads(req.content))
        if answer is None:
            raise httpx.ConnectError("blocked by campus firewall")
        content = json.dumps(answer, ensure_ascii=False)
        return httpx.Response(status, json={"choices": [{"message": {"content": content}}]})

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_template_without_key_in_all_languages():
    run = analysis_run()
    for lang in Language:
        n = narrator.narrate(run, Role.PARENT, lang)
        assert n.source == "template" and n.model is None and len(n.bullets) >= 3
        assert run.recommendations[0].career.name in n.headline
    assert narrator.narrate(run, Role.PARENT, Language.TA).translation_reviewed is False


def test_facts_are_anonymised():
    run = analysis_run()
    facts = json.dumps(narrator.facts_for(run, "parent"))
    fin = run.recommendations[0].financial
    assert run.student_id not in facts and run.run_id not in facts
    for k in ("family_funds", "loan_capacity", "monthly_emi", "burden_ratio", "pincode", "email", "income"):
        assert k not in facts
    assert str(fin.family_funds) not in facts


def test_model_answer_used_when_numbers_check_out(grok):
    run = analysis_run()
    facts = narrator.facts_for(run, "parent")
    seen: list = []
    ans = {"headline": f"{facts['top']['name']} looks best", "bullets": [f"Fit {facts['top']['fit']}%."]}
    n = narrator.narrate(run, Role.PARENT, Language.HI, client=fake(ans, seen=seen))
    assert n.source == "model" and n.bullets == ans["bullets"] and n.model == get_settings().grok_model
    sent = json.loads(seen[0]["messages"][1]["content"])
    assert sent == n.facts and "Hindi" in seen[0]["messages"][0]["content"]


def test_invented_numbers_fall_back_to_template(grok):
    run = analysis_run()
    ans = {"headline": "Great choice", "bullets": ["Starting salary Rs 98,76,543 guaranteed."]}
    n = narrator.narrate(run, Role.PARENT, Language.EN, client=fake(ans))
    assert n.source == "template" and "98,76,543" not in " ".join(n.bullets)


def test_network_errors_and_bad_status_fall_back(grok):
    run = analysis_run()
    assert narrator.narrate(run, Role.STUDENT, Language.EN, client=fake(None)).source == "template"
    bad = narrator.narrate(run, Role.STUDENT, Language.EN, client=fake({"x": 1}, status=503))
    assert bad.source == "template"


def test_native_digits_are_checked():
    facts = {"top": {"score": 71}}
    assert narrator._numbers_ok("स्कोर ७१%", facts)
    assert not narrator._numbers_ok("स्कोर ९९%", facts)


def test_narrative_endpoint(client):
    rid = client.get("/api/v1/analysis/runs", headers={"X-Mock-Role": "parent"}).json()["data"]["items"][0][
        "run_id"
    ]
    r = client.get(f"/api/v1/analysis/runs/{rid}/narrative?lang=ta", headers={"X-Mock-Role": "student"})
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["language"] == "ta" and d["audience"] == "student" and d["source"] == "template"
    assert client.get(f"/api/v1/analysis/runs/{rid}/narrative?lang=fr").status_code == 422
