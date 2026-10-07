"""Live mode end to end: migrations, seed catalog, demo families, login, privacy rules and the engine over HTTP."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.mocks import demo_families as df

PW = df.DEMO_PASSWORD


@pytest.fixture(scope="module")
def live(tmp_path_factory):
    import os

    from app.db import session as dbs
    from app.services import catalog_db

    db_path = tmp_path_factory.mktemp("live") / "prism.db"
    old = {k: os.environ.get(k) for k in ("MOCK_MODE", "DATABASE_URL")}
    os.environ["MOCK_MODE"] = "false"
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
    get_settings.cache_clear()
    dbs.get_engine.cache_clear()
    dbs.get_sessionmaker.cache_clear()
    catalog_db.invalidate()
    from app.core.clock import today
    from app.etl import loader
    from scripts.seed import migrate, seed_demo

    migrate()
    with dbs.get_sessionmaker()() as db:
        assert loader.load(db, today(), label="seed-test")["status"] == "completed"
        assert seed_demo(db) == 5
        db.commit()
    from app.main import create_app

    yield TestClient(create_app())
    for k, v in old.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    get_settings.cache_clear()
    dbs.get_engine.cache_clear()
    dbs.get_sessionmaker.cache_clear()
    catalog_db.invalidate()


def login(c, email, password=PW):
    r = c.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    return {"Authorization": f"Bearer {d['tokens']['access_token']}"}, d


def test_requires_login(live):
    r = live.get("/api/v1/auth/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHORIZED"


def test_parent_sees_full_run_and_finances(live):
    h, d = login(live, df.parent_email("creative_risk_averse"))
    fam = d["user"]["family_id"]
    fin = live.get(f"/api/v1/families/{fam}/finance", headers=h).json()["data"]
    assert fin["allocatable_savings"] == 600_000
    runs = live.get("/api/v1/analysis/runs", headers=h).json()["data"]
    assert runs["total"] >= 1
    run = live.get(f"/api/v1/analysis/runs/{runs['items'][0]['run_id']}", headers=h).json()["data"]
    assert run["conflict"]["visibility"] == "full" and len(run["conflict"]["dimensions"]) == 6
    assert len(run["recommendations"]) == 10
    assert (
        run["reproducibility"]["dataset_version"] == "seed-test" and not run["reproducibility"]["is_outdated"]
    )
    assert run.get("mock", True)


def test_student_sees_gentle_view_and_no_raw_finances(live):
    h, d = login(live, df.student_email("creative_risk_averse"))
    fam = d["user"]["family_id"]
    fin = live.get(f"/api/v1/families/{fam}/finance", headers=h).json()["data"]
    assert "allocatable_savings" not in fin and fin["budget_comfort"] in ("modest", "moderate", "comfortable")
    run_id = live.get("/api/v1/analysis/runs", headers=h).json()["data"]["items"][0]["run_id"]
    conflict = live.get(f"/api/v1/analysis/runs/{run_id}/conflict", headers=h).json()["data"]
    assert conflict["visibility"] == "summary" and conflict["dimensions"] == []
    run = live.get(f"/api/v1/analysis/runs/{run_id}", headers=h).json()["data"]
    money = ("family_funds", "loan_capacity", "loan_required", "monthly_emi", "burden_ratio", "funding_gap")
    for r in run["recommendations"]:
        assert all(r["financial"][k] is None for k in money)
        assert r["financial"]["total_cost"] > 0 and r["financial"]["affordability_class"]
    assert "short even with a loan" not in str(run["buckets"])
    roadmap = live.get(f"/api/v1/analysis/runs/{run_id}/roadmap", headers=h).json()["data"]
    assert "a month" not in str(roadmap)
    hp, _ = login(live, df.parent_email("creative_risk_averse"))
    parent_run = live.get(f"/api/v1/analysis/runs/{run_id}", headers=hp).json()["data"]
    assert parent_run["recommendations"][0]["financial"]["family_funds"] is not None
    traits = live.get(f"/api/v1/students/{d['user']['id']}/traits", headers=h).json()["data"]
    assert traits["completeness"] > 0.9 and all(t["percentile"] is None for t in traits["traits"])


def test_family_boundaries(live):
    h, _ = login(live, df.parent_email("aligned_family"))
    _, other = login(live, df.student_email("creative_risk_averse"))
    r = live.get(f"/api/v1/students/{other['user']['id']}/traits", headers=h)
    assert r.status_code == 403
    r = live.get(f"/api/v1/families/{other['user']['family_id']}/finance", headers=h)
    assert r.status_code == 403


def test_new_minor_needs_parental_consent_then_full_flow(live):
    r = live.post(
        "/api/v1/auth/register",
        json={
            "email": "new.student@prism.example",
            "password": "longenough1",
            "full_name": "New Student",
            "role": "student",
            "date_of_birth": "2010-06-01",
        },
    )
    assert r.status_code == 201
    sh = {"Authorization": f"Bearer {r.json()['data']['tokens']['access_token']}"}
    assert r.json()["data"]["user"]["consent_status"] == "pending"
    qs = live.get("/api/v1/assessments/riasec_v1/questions", headers=sh).json()["data"]
    body = {"answers": [{"question_id": q["id"], "value": str(1 + i % 5)} for i, q in enumerate(qs)]}
    blocked = live.post("/api/v1/assessments/riasec_v1/submit", json=body, headers=sh)
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "CONSENT_REQUIRED"
    live.put(
        "/api/v1/students/me/profile",
        headers=sh,
        json={
            "grade": 11,
            "board": "CBSE",
            "pincode": "642001",
            "city": "Pollachi",
            "state": "Tamil Nadu",
            "recent_score_pct": 85,
        },
    )
    live.post("/api/v1/families", headers=sh)
    code = live.post("/api/v1/families/invites", headers=sh).json()["data"]["invite_code"]
    r = live.post(
        "/api/v1/auth/register",
        json={
            "email": "new.parent@prism.example",
            "password": "longenough1",
            "full_name": "New Parent",
            "role": "parent",
        },
    )
    ph = {"Authorization": f"Bearer {r.json()['data']['tokens']['access_token']}"}
    fam = live.post(
        "/api/v1/families/join", headers=ph, json={"invite_code": code, "relation": "mother"}
    ).json()["data"]
    sid = next(m["user_id"] for m in fam["members"] if m["role"] == "student")
    assert (
        live.post(
            "/api/v1/consents",
            headers=ph,
            json={"consent_type": "minor_data_processing", "subject_user_id": sid, "granted": True},
        ).status_code
        == 201
    )
    ok = live.post(
        "/api/v1/assessments/riasec_v1/submit", json={**body, "client_submission_id": "offline-1"}, headers=sh
    )
    assert ok.status_code == 200
    again = live.post(
        "/api/v1/assessments/riasec_v1/submit", json={**body, "client_submission_id": "offline-1"}, headers=sh
    )
    assert (
        again.json()["data"]["submission_id"] == ok.json()["data"]["submission_id"]
    )  # offline retry is a no-op
    run = live.post("/api/v1/analysis/runs", headers=sh, json={"student_id": sid}).json()["data"]
    assert any("No family budget yet" in w for w in run["data_quality"]["warnings"])
    assert run["data_quality"]["completeness"] < 0.5  # only one instrument done: imputation is reported


def test_what_if_roadmap_swot_and_compare(live):
    h, _ = login(live, df.parent_email("loan_dependent_family"))
    run_id = live.get("/api/v1/analysis/runs", headers=h).json()["data"]["items"][0]["run_id"]
    wi = live.post(
        f"/api/v1/analysis/runs/{run_id}/what-if",
        headers=h,
        json={"overrides": {"allocatable_savings": 1_500_000, "loan_tolerance": 1.0}},
    ).json()["data"]
    order = ["infeasible", "loan_dependent", "stretch", "comfortable"]
    for d in wi["comparison"]["deltas"]:
        if d["base_class"] and d["new_class"]:
            assert order.index(d["new_class"]) >= order.index(d["base_class"])
    assert live.get(f"/api/v1/analysis/runs/{wi['what_if_run_id']}", headers=h).status_code == 200
    road = live.get(f"/api/v1/analysis/runs/{run_id}/roadmap", headers=h).json()["data"]
    assert len(road["phases"]) == 5 and road["skill_actions"]
    assert all(a["resource_url"].startswith("https://") for a in road["skill_actions"])
    assert live.get(f"/api/v1/analysis/runs/{run_id}/swot", headers=h).json()["data"]["strengths"]
    cmp = live.get(f"/api/v1/analysis/compare?run_a={run_id}&run_b={wi['what_if_run_id']}", headers=h)
    assert cmp.status_code == 200


def test_refresh_rotation_and_reuse_detection(live):
    _, d = login(live, df.parent_email("aligned_family"))
    first = d["tokens"]["refresh_token"]
    r1 = live.post("/api/v1/auth/refresh", json={"refresh_token": first})
    assert r1.status_code == 200
    reuse = live.post("/api/v1/auth/refresh", json={"refresh_token": first})
    assert reuse.status_code == 401
    second = r1.json()["data"]["refresh_token"]
    assert (
        live.post("/api/v1/auth/refresh", json={"refresh_token": second}).status_code == 401
    )  # family revoked


def test_lockout_after_repeated_failures(live):
    email = df.parent_email("rural_steam_innovator")
    for _ in range(5):
        assert live.post("/api/v1/auth/login", json={"email": email, "password": "wrong"}).status_code == 401
    r = live.post("/api/v1/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 429


def test_catalog_and_scholarships_from_database(live):
    h, _ = login(live, df.parent_email("high_aptitude_low_budget"))
    careers = live.get("/api/v1/careers?page_size=100").json()["data"]
    assert careers["total"] == 51
    assert live.get("/api/v1/careers/ev-engineer/alternatives").json()["data"]
    pathways = live.get("/api/v1/pathways?page_size=200").json()["data"]
    assert pathways["total"] >= 100
    sch = live.get("/api/v1/scholarships", headers=h).json()["data"]
    assert len(sch) >= 40
    css = next(m for m in sch if m["scholarship"]["name"].startswith("Central Sector"))
    assert css["eligible"] is None  # income fits, board percentile unknown: never guessed
    self_check = [m for m in sch if m["scholarship"]["self_declared_criteria"]]
    assert self_check, "category/gender-based schemes are listed for self-check"
    local = live.get("/api/v1/local-opportunities?pincode=636701").json()["data"]
    assert local and local[0]["district"] == "Dharmapuri"
    trends = live.get("/api/v1/market/trends?region_code=IN-TN-MDU").json()["data"]
    assert trends["is_live"] is False


def test_admin_analytics_are_k_anonymised(live):
    h, _ = login(live, df.ADMIN_EMAIL)
    a = live.get("/api/v1/admin/analytics", headers=h).json()["data"]
    assert a["k_anonymity_threshold"] == 5 and a["runs_total"] >= 5
    assert all(row["count"] >= 5 for row in a["top_recommended_careers"])
    s, _ = login(live, df.student_email("aligned_family"))
    assert live.get("/api/v1/admin/analytics", headers=s).status_code == 403


def test_data_status_and_methodology_from_database(live):
    d = live.get("/api/v1/system/data-status").json()["data"]
    assert d["dataset_version"] == "seed-test" and d["overall_checked_share"] < 0.1
    assert any(x["dataset"] == "scholarships" and x["secondary"] >= 2 for x in d["datasets"])
    m = live.get("/api/v1/system/methodology").json()["data"]
    assert any(f["name"] == "aptitude_trait" for f in m["formulas"])


def test_demo_endpoints_use_seeded_families(live):
    people = live.get("/api/v1/demo/personas").json()["data"]
    assert all(p["fixture_available"] and p["baseline_run_id"] for p in people)
    wt = live.get("/api/v1/demo/walkthrough").json()["data"]
    assert people[0]["baseline_run_id"] in wt["steps"][4]["call"]["path"]


def test_compat_aliases_live(live):
    r = live.post("/api/login", json={"email": df.student_email("aligned_family"), "password": PW}).json()
    pred = live.post("/api/predict", json={"user_id": r["user_id"]}).json()
    assert 0 <= pred["score"] <= 100 and pred["result"]
    assert live.get(f"/api/results/{pred['id']}").json()["top_careers"]


def test_reminders_end_to_end(live):
    from datetime import date

    from app.db import session as dbs
    from app.services.notify import ConsoleProvider, send_due

    hp, d = login(live, df.parent_email("creative_risk_averse"))
    sid = next(
        x for x in live.get("/api/v1/demo/personas").json()["data"] if x["key"] == "creative_risk_averse"
    )["student_id"]
    assert live.get(f"/api/v1/students/{sid}/deadlines", headers=hp).json()["data"]["items"]
    body = {"channel": "sms", "phone": "+919876543210", "lead_days": [14, 3]}
    plan = live.post(f"/api/v1/students/{sid}/reminders", headers=hp, json=body).json()["data"]
    assert plan["created"] > 0
    again = live.post(f"/api/v1/students/{sid}/reminders", headers=hp, json=body).json()["data"]
    assert again["created"] == 0 and again["already_scheduled"] == plan["created"]
    ho, _ = login(live, df.parent_email("aligned_family"))
    assert live.post(f"/api/v1/students/{sid}/reminders", headers=ho, json=body).status_code == 403

    first = date.fromisoformat(min(x["send_on"] for x in plan["reminders"]))
    provider = ConsoleProvider()
    with dbs.get_sessionmaker()() as db:
        counts = send_due(db, first, provider)
        db.commit()
    assert counts["sent"] >= 1 and provider.sent[0][1] == "+919876543210"
    assert "PRISM reminder" in provider.sent[0][2] and "STOP" in provider.sent[0][2]
    mine = live.get("/api/v1/me/reminders", headers=hp).json()["data"]
    assert "sent" in {x["status"] for x in mine}
    assert live.delete("/api/v1/me/reminders", headers=hp).json()["data"]["cancelled"] > 0
    ics = live.get(f"/api/v1/students/{sid}/deadlines.ics", headers=hp)
    assert ics.status_code == 200 and "BEGIN:VEVENT" in ics.text


def test_outcomes_mentors_dashboard_and_report_live(live):
    hp, _ = login(live, df.parent_email("creative_risk_averse"))
    hc, _ = login(live, df.COUNSELLOR_EMAIL)
    ha, _ = login(live, df.ADMIN_EMAIL)
    sid = next(
        x for x in live.get("/api/v1/demo/personas").json()["data"] if x["key"] == "creative_risk_averse"
    )["student_id"]
    rid = live.get("/api/v1/analysis/runs", headers=hp).json()["data"]["items"][0]["run_id"]
    run = live.get(f"/api/v1/analysis/runs/{rid}", headers=hp).json()["data"]
    second = run["recommendations"][1]["career"]["slug"]
    o = live.post(
        f"/api/v1/students/{sid}/outcomes",
        headers=hp,
        json={"status": "enrolled", "run_id": rid, "chosen_career_id": second, "satisfaction": 5},
    )
    assert o.status_code == 201 and o.json()["data"]["followed_recommendation_rank"] == 2
    assert len(live.get(f"/api/v1/students/{sid}/outcomes", headers=hp).json()["data"]) == 1
    summary = live.get("/api/v1/admin/outcomes/summary", headers=ha).json()["data"]
    assert summary["responses"] == 1 and summary["suppressed"]

    mentor = {
        "display_name": "Priya S.",
        "career_id": "agri-drone-engineer",
        "region_code": "IN-TN-CBE",
        "district": "Pollachi",
        "languages": ["ta", "en"],
        "bio": "Drone pilot with a farmer producer company; happy to talk to students.",
        "consent_on": "2026-10-01",
        "verified_by": "Demo school counsellor",
    }
    assert live.post("/api/v1/mentors", headers=hp, json=mentor).status_code == 403
    assert live.post("/api/v1/mentors", headers=hc, json=mentor).status_code == 201
    found = live.get("/api/v1/mentors?pincode=641004", headers=hp).json()["data"]["items"]
    assert [m["display_name"] for m in found] == ["Priya S."] and not any(
        ch.isdigit() for ch in found[0]["contact"]
    )
    assert live.get("/api/v1/mentors?pincode=600001", headers=hp).json()["data"]["items"] == []

    dash = live.get("/api/v1/educator/dashboard", headers=hc).json()["data"]
    assert len(dash["students"]) == 5
    assert all(len(r["display_name"].split()) <= 2 for r in dash["students"])
    assert live.get("/api/v1/educator/dashboard", headers=hp).status_code == 403
    edu_run = live.get(f"/api/v1/analysis/runs/{rid}", headers=hc).json()["data"]
    assert edu_run["recommendations"][0]["financial"]["family_funds"] is None

    report = live.get(f"/api/v1/analysis/runs/{rid}/report?lang=ta", headers=hp)
    assert report.status_code == 200 and "PRISM குடும்ப அறிக்கை" in report.text
    fair = live.get("/api/v1/system/fairness").json()["data"]
    assert fair["passed"], fair["probes"]


def test_partner_local_problems_import(live, tmp_path):
    from pathlib import Path

    from app.core.clock import today
    from app.db import session as dbs
    from app.etl.local_csv import import_local_csv
    from app.services import catalog_db

    template = Path(__file__).resolve().parents[1] / "data/partners/local_problems_template.csv"
    lines = template.read_text().splitlines()
    lines.append(lines[1].replace("example-school-water-sensor", "Bad Key").replace("636701", "6367"))
    path = tmp_path / "atl.csv"
    path.write_text("\n".join(lines) + "\n")
    with dbs.get_sessionmaker()() as db:
        res = import_local_csv(db, path, today())
        db.commit()
    catalog_db.invalidate()
    assert res["imported"] == 1 and len(res["warnings"]) == 1
    ops = live.get("/api/v1/local-opportunities?pincode=636701").json()["data"]
    mine = [o for o in ops if o["title"].startswith("Low-cost tank water-level")]
    assert (
        mine
        and mine[0]["provenance"]["verification"] == "unverified"
        and mine[0]["provenance"]["is_estimate"]
    )


def test_offline_market_csv_creates_new_dataset_version(live, tmp_path):
    """Runs last: publishes a new dataset version, so earlier runs become 'outdated' but stay reproducible."""
    from datetime import timedelta

    from app.core.clock import today
    from app.db import session as dbs
    from app.etl.market_csv import import_market_csv
    from app.services import catalog_db

    h, _ = login(live, df.parent_email("creative_risk_averse"))
    old_run = live.get("/api/v1/analysis/runs", headers=h).json()["data"]["items"][0]["run_id"]
    d1, d0 = today() - timedelta(days=1), today() - timedelta(days=31)
    slugs = ["software-engineer", "data-scientist", "agri-drone-engineer", "civil-engineer"]
    lines = ["career_slug,region_code,fetched_on,posting_count,mean_salary,keywords,source_name"]
    for i, s in enumerate(slugs):
        lines.append(f"{s},IN-TN-CHN,{d0},{100 + 10 * i},,{s},")
        lines.append(f"{s},IN-TN-CHN,{d1},{150 + 40 * i},650000,{s},")
        lines.append(f"{s},IN,{d1},{4000 + i},,{s},")
    lines += [
        "astronaut-chef,IN-TN-CHN,2026-10-01,5,,x,",
        f"software-engineer,IN-TN-CHN,{today() + timedelta(days=3)},5,,x,",
    ]
    path = tmp_path / "postings.csv"
    path.write_text("\n".join(lines) + "\n")

    with dbs.get_sessionmaker()() as db:
        res = import_market_csv(db, today(), path)
        db.commit()
        again = import_market_csv(db, today(), path)
        db.rollback()
    catalog_db.invalidate()
    assert res["status"] == "completed", res
    assert res["counts"]["market_signals"]["inserted"] == 4
    assert any("unknown career" in w for w in res["warnings"])
    assert any("future date" in w for w in res["warnings"])
    assert again["status"] == "skipped"

    sid = live.get("/api/v1/demo/personas").json()["data"][0]["student_id"]
    new = live.post("/api/v1/analysis/runs", headers=h, json={"student_id": sid}).json()["data"]
    assert new["reproducibility"]["dataset_version"] == res["label"]
    old = live.get(f"/api/v1/analysis/runs/{old_run}", headers=h).json()["data"]
    assert old["reproducibility"]["is_outdated"] is True
    status = live.get("/api/v1/system/data-status").json()["data"]
    assert status is not None
