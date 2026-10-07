"""Every MOCK_MODE endpoint must return the standard envelope and validate against its schema."""

import pytest

from app.mocks import world as w
from app.schemas.analysis import AnalysisRun, ScoreComponent
from app.schemas.common import AffordabilityClass
from tests.conftest import ADMIN, PARENT

RUN = w.RUN_ID
CAREER = w.sid("career", "data-scientist")

GETS = [
    ("/api/v1/auth/me", {}),
    ("/api/v1/students/me/profile", {}),
    (f"/api/v1/students/{w.STUDENT_ID}/traits", {}),
    ("/api/v1/families/me", {}),
    (f"/api/v1/families/{w.FAMILY_ID}/finance", PARENT),
    (f"/api/v1/families/{w.FAMILY_ID}/finance", {}),
    (f"/api/v1/families/{w.FAMILY_ID}/preferences", PARENT),
    ("/api/v1/consents", {}),
    ("/api/v1/assessments/instruments", {}),
    ("/api/v1/assessments/riasec_v1/questions", {}),
    ("/api/v1/assessments/aptitude_v1/questions", {}),
    (f"/api/v1/analysis/runs/{RUN}", {}),
    ("/api/v1/analysis/runs", {}),
    (f"/api/v1/analysis/compare?run_a={RUN}&run_b={w.WHATIF_RUN_ID}", PARENT),
    (f"/api/v1/analysis/runs/{RUN}/conflict", PARENT),
    (f"/api/v1/analysis/runs/{RUN}/swot", {}),
    (f"/api/v1/analysis/runs/{RUN}/swot?career_id={CAREER}", {}),
    (f"/api/v1/analysis/runs/{RUN}/roadmap", {}),
    (f"/api/v1/analysis/runs/{RUN}/roadmap?career_id={w.sid('career', 'doctor-mbbs')}", {}),
    ("/api/v1/careers", {}),
    ("/api/v1/careers?sector=health_life_sciences&steam_tag=T", {}),
    (f"/api/v1/careers/{CAREER}", {}),
    ("/api/v1/careers/ux-designer", {}),
    (f"/api/v1/careers/{CAREER}/alternatives", {}),
    ("/api/v1/regions", {}),
    ("/api/v1/market/trends?region_code=IN-TN-CBE", {}),
    ("/api/v1/pathways", {}),
    (f"/api/v1/pathways?career_id={w.sid('career', 'doctor-mbbs')}&max_annual_cost=500000", {}),
    ("/api/v1/exams", {}),
    ("/api/v1/scholarships?eligible_only=true", {}),
    ("/api/v1/local-opportunities?pincode=642001", {}),
    ("/api/v1/admin/analytics", ADMIN),
    ("/api/v1/system/health", {}),
    ("/api/v1/system/methodology", {}),
]


@pytest.mark.parametrize(("path", "headers"), GETS)
def test_get_endpoints_return_envelope(client, path, headers):
    r = client.get(path, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["meta"]["request_id"] == r.headers["X-Request-ID"]
    assert body["data"] is not None


POSTS = [
    (
        "/api/v1/auth/register",
        {
            "email": "a@b.co",
            "password": "longenough1",
            "full_name": "A",
            "role": "student",
            "date_of_birth": "2009-05-01",
        },
        {},
        201,
    ),
    ("/api/v1/auth/login", {"email": "parent.demo@prism.example", "password": "x"}, {}, 200),
    ("/api/v1/auth/refresh", {"refresh_token": "mock.refresh.token"}, {}, 200),
    ("/api/v1/families", None, PARENT, 201),
    ("/api/v1/families/invites", None, PARENT, 201),
    ("/api/v1/families/join", {"invite_code": "PRSM7K2Q", "relation": "mother"}, PARENT, 200),
    (
        "/api/v1/consents",
        {"consent_type": "minor_data_processing", "subject_user_id": w.STUDENT_USER_ID, "granted": True},
        PARENT,
        201,
    ),
    ("/api/v1/assessments/riasec_v1/submit", {"answers": [{"question_id": "q1", "value": "4"}]}, {}, 200),
    ("/api/v1/analysis/runs", {"student_id": w.STUDENT_ID}, {}, 201),
    (
        f"/api/v1/analysis/runs/{RUN}/what-if",
        {
            "overrides": {"allocatable_savings": 1_400_000, "loan_tolerance": 0.7},
            "label": "Sell plot + accept loan",
        },
        PARENT,
        201,
    ),
    ("/api/v1/admin/data/refresh", {"datasets": ["market_signals"], "dry_run": True}, ADMIN, 202),
]


@pytest.mark.parametrize(("path", "payload", "headers", "status"), POSTS)
def test_post_endpoints_return_envelope(client, path, payload, headers, status):
    r = client.post(path, json=payload, headers=headers)
    assert r.status_code == status, r.text
    assert r.json()["success"] is True


def test_put_endpoints(client):
    profile = {"grade": 12, "board": "CBSE", "pincode": "641004", "city": "Coimbatore", "state": "Tamil Nadu"}
    assert client.put("/api/v1/students/me/profile", json=profile).status_code == 200
    finance = {k: v for k, v in w.FINANCE.items()}
    r = client.put(f"/api/v1/families/{w.FAMILY_ID}/finance", json=finance, headers=PARENT)
    assert r.status_code == 200, r.text
    prefs = {"preferences": [{"rank": 1, "domain": "health_life_sciences"}]}
    r = client.put(f"/api/v1/families/{w.FAMILY_ID}/preferences", json=prefs, headers=PARENT)
    assert r.status_code == 200, r.text


def test_analysis_run_is_internally_consistent(client):
    data = client.get(f"/api/v1/analysis/runs/{RUN}", headers=PARENT).json()["data"]
    run = AnalysisRun.model_validate(data)
    assert [r.rank for r in run.recommendations] == list(range(1, len(run.recommendations) + 1))
    scores = [r.final_score for r in run.recommendations]
    assert scores == sorted(scores, reverse=True)
    for rec in run.recommendations:
        total = sum(c.contribution for c in rec.contributions)
        assert abs(total - rec.final_score) < 1e-3
        assert {c.component for c in rec.contributions} == set(ScoreComponent)
        assert rec.ci_low <= rec.final_score <= rec.ci_high
    assert all(len(v) > 0 for v in run.buckets.values())
    stretch = run.buckets["stretch_goals"]
    infeasible = {
        r.career.id
        for r in run.recommendations
        if r.financial.affordability_class is AffordabilityClass.INFEASIBLE
    }
    assert {s.career_id for s in stretch} == infeasible
    assert run.reproducibility.input_hash.startswith("sha256:")


def test_privacy_views_differ_by_role(client):
    student = client.get(f"/api/v1/analysis/runs/{RUN}/conflict").json()["data"]
    parent = client.get(f"/api/v1/analysis/runs/{RUN}/conflict", headers=PARENT).json()["data"]
    assert student["visibility"] == "summary" and student["dimensions"] == []
    assert parent["visibility"] == "full" and len(parent["dimensions"]) == 6
    fin_student = client.get(f"/api/v1/families/{w.FAMILY_ID}/finance").json()["data"]
    assert "allocatable_savings" not in fin_student


def test_what_if_more_budget_never_hurts_affordability(client):
    r = client.post(
        f"/api/v1/analysis/runs/{RUN}/what-if",
        json={"overrides": {"allocatable_savings": 2_000_000}},
        headers=PARENT,
    )
    deltas = r.json()["data"]["comparison"]["deltas"]
    order = ["infeasible", "loan_dependent", "stretch", "comfortable"]
    for d in deltas:
        assert order.index(d["new_class"]) >= order.index(d["base_class"])


def test_role_guards(client):
    assert client.get("/api/v1/admin/analytics").json()["error"]["code"] == "FORBIDDEN"
    r = client.put(f"/api/v1/families/{w.FAMILY_ID}/finance", json=w.FINANCE)
    assert r.status_code == 403


def test_errors_use_envelope(client):
    r = client.get("/api/v1/analysis/runs/does-not-exist")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"
    r = client.post("/api/v1/auth/register", json={"email": "bad"})
    assert r.status_code == 422
    body = r.json()
    assert body["success"] is False and body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["details"]["errors"]


def test_incoherent_finance_rejected(client):
    bad = dict(w.FINANCE, max_affordable_emi=80_000)  # EMI + debt > monthly income of 75,000
    r = client.put(f"/api/v1/families/{w.FAMILY_ID}/finance", json=bad, headers=PARENT)
    assert r.status_code == 422


def test_compat_aliases(client):
    r = client.post("/api/login", json={"email": "student.demo@prism.example", "password": "x"})
    assert r.status_code == 200 and "access_token" in r.json()
    r = client.post("/api/users", json={"name": "A", "email": "a@b.co", "password": "longenough1"})
    assert r.status_code == 201 and r.json()["id"]
    assert client.get(f"/api/users/{w.STUDENT_USER_ID}").json()["role"] == "student"
    pred = client.post("/api/predict", json={}).json()
    assert set(pred) >= {"score", "result", "confidence"}
    assert 0 <= pred["score"] <= 100 and 0 <= pred["confidence"] <= 1
    res = client.get(f"/api/results/{pred['id']}").json()
    assert res["result"] == pred["result"] and res["top_careers"]
    assert client.get("/api/results/nope").json()["error"]["code"] == "NOT_FOUND"


def test_live_mode_degrades_explicitly(monkeypatch):
    from fastapi.testclient import TestClient

    from app.core.config import get_settings
    from app.main import create_app

    monkeypatch.setenv("MOCK_MODE", "false")
    get_settings.cache_clear()
    try:
        c = TestClient(create_app())
        r = c.get("/api/v1/careers")
        assert r.status_code == 501
        assert r.json()["error"]["code"] == "LIVE_MODE_UNAVAILABLE"
        assert c.get("/api/v1/system/health").json()["data"]["mock_mode"] is False
    finally:
        monkeypatch.setenv("MOCK_MODE", "true")
        get_settings.cache_clear()


def test_scholarship_plans_respect_eligibility_and_stacking():
    from app.mocks import builders as b

    matches = {m.scholarship.id: m for m in (b.scholarship_match(s[0]) for s in w.SCHOLARSHIPS)}
    run = b.analysis_run()
    for rec in run.recommendations:
        for plan in [rec.financial, *rec.alternative_pathways]:
            ids = [p.scholarship_id for p in plan.scholarship_plan]
            assert all(matches[i].eligible is not False for i in ids), rec.career.slug
            if any(not matches[i].scholarship.stackable for i in ids):
                assert len(ids) == 1, rec.career.slug


def test_scholarship_plans_respect_exclusive_groups():
    from app.mocks import builders as b

    by_id = {b.scholarship(s[0]).id: b.scholarship(s[0]) for s in w.SCHOLARSHIPS}
    for rec in b.analysis_run().recommendations:
        groups = [by_id[p.scholarship_id].exclusive_group for p in rec.financial.scholarship_plan]
        groups = [g for g in groups if g]
        assert len(groups) == len(set(groups)), rec.career.slug


def test_exam_sessions_are_ordered():
    from app.mocks import builders as b

    for e in w.EXAMS:
        sessions = b.exam(e[0]).sessions
        assert sessions and [s.session_no for s in sessions] == sorted(s.session_no for s in sessions)
