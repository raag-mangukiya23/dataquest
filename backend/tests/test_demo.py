"""The demo must never break on stage: every scripted step has to succeed against the mock server."""

import pytest

from app.mocks import demo


def test_personas_cover_the_five_scenarios(client):
    data = client.get("/api/v1/demo/personas").json()["data"]
    assert {p["key"] for p in data} == {
        "creative_risk_averse",
        "high_aptitude_low_budget",
        "rural_steam_innovator",
        "loan_dependent_family",
        "aligned_family",
    }
    assert sum(p["fixture_available"] for p in data) >= 1


@pytest.mark.parametrize("step", demo.walkthrough().steps, ids=lambda s: f"step{s.step}")
def test_every_walkthrough_step_succeeds(client, step):
    r = client.request(step.call.method, step.call.path, headers=step.call.headers, json=step.call.body)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body["success"] is True
    for path in step.show:
        node = body
        for part in path.replace("]", "").replace("[", ".").split("."):
            node = node[int(part)] if part.isdigit() else node[part]
        assert node is not None, path


def test_walkthrough_fits_a_seven_minute_slot(client):
    wt = client.get("/api/v1/demo/walkthrough").json()["data"]
    assert wt["total_seconds"] <= 420
    assert [s["step"] for s in wt["steps"]] == list(range(1, len(wt["steps"]) + 1))


def test_reset_is_safe_in_mock_mode(client):
    data = client.post("/api/v1/demo/reset").json()["data"]
    assert data["status"] == "noop_mock_mode" and data["demo_today"] == "2026-10-07"


def test_demo_disabled_returns_404(monkeypatch):
    from fastapi.testclient import TestClient

    from app.core.config import get_settings
    from app.main import create_app

    monkeypatch.setenv("DEMO_MODE", "false")
    get_settings.cache_clear()
    try:
        r = TestClient(create_app()).get("/api/v1/demo/personas")
        assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
    finally:
        monkeypatch.setenv("DEMO_MODE", "true")
        get_settings.cache_clear()


def test_roadmap_deadlines_are_not_in_the_past_on_demo_day(client):
    from datetime import date

    from app.core.config import get_settings

    today = get_settings().demo_today or date.today()
    run = client.get("/api/v1/demo/personas").json()["data"][0]["baseline_run_id"]
    phases = client.get(f"/api/v1/analysis/runs/{run}/roadmap").json()["data"]["phases"]
    year1 = [m for m in phases[0]["milestones"] if m["due"]]
    assert all(date.fromisoformat(m["due"]) >= today for m in year1)
