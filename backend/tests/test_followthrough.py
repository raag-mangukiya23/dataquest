"""Follow-through features in MOCK_MODE and their pure helpers: deadlines, calendar, loans, report, outcomes,
mentors, counsellor dashboard, fairness and reminder delivery."""

from datetime import date, timedelta

import httpx

from app.mocks import world as w
from app.mocks.builders import analysis_run, catalog_input
from app.services import followthrough as ft
from app.services.notify import ConsoleProvider, TwilioProvider

P, S, E, A = ({"X-Mock-Role": r} for r in ("parent", "student", "educator", "admin"))
SID = w.STUDENT_ID


def test_deadlines_are_upcoming_sorted_and_sourced():
    d = ft.deadlines(analysis_run(), catalog_input(), w.TODAY, 365)
    assert d.items, "the demo run should have exam and scholarship dates"
    dues = [i.due for i in d.items]
    assert dues == sorted(dues) and all(w.TODAY <= x <= w.TODAY + timedelta(days=365) for x in dues)
    assert all(i.days_left == (i.due - w.TODAY).days and i.for_careers and i.source_name for i in d.items)
    assert len({i.ref_id for i in d.items}) == len(d.items)
    short = ft.deadlines(analysis_run(), catalog_input(), w.TODAY, 30)
    assert all(i.days_left <= 30 for i in short.items)


def test_ics_calendar_is_well_formed():
    d = ft.deadlines(analysis_run(), catalog_input(), w.TODAY, 365)
    text = ft.to_ics(d)
    lines = text.split("\r\n")
    assert lines[0] == "BEGIN:VCALENDAR" and lines[-2] == "END:VCALENDAR" and lines[-1] == ""
    assert text.count("BEGIN:VEVENT") == len(d.items) == text.count("END:VEVENT")
    assert all(len(line.encode()) <= 75 for line in lines)


def test_reminder_plan_skips_past_send_dates():
    d = ft.deadlines(analysis_run(), catalog_input(), w.TODAY, 365)
    first = d.items[0]
    plan = ft.reminder_plan(d, [14, 3], w.TODAY)
    assert all(send >= w.TODAY and send < due for _, _, due, send in plan)
    for lead in (14, 3):
        expected = first.due - timedelta(days=lead) >= w.TODAY
        assert any(ref == f"{first.ref_id}@{lead}d" for ref, *_ in plan) == expected


def test_loan_explainer_applies_scheme_caps():
    csis = ft.explain_loan(800_000, 4, 400_000, None)
    assert csis.interest_while_studying == round(50_000 * 0.10 * 5)  # only the part above Rs 7.5 lakh
    assert [s.applies for s in csis.schemes] == [True, None]
    vidya = ft.explain_loan(1_200_000, 4, 700_000, 1)
    assert vidya.interest_while_studying == round((1_000_000 * 0.07 + 200_000 * 0.10) * 5)
    rich = ft.explain_loan(500_000, 4, 2_000_000, 2)
    assert rich.interest_while_studying == 250_000 and not any(s.applies for s in rich.schemes)
    unknown = ft.explain_loan(500_000, 4, None, None)
    assert all(s.applies is None for s in unknown.schemes)
    emis = [o.monthly_emi for o in rich.options]
    interest = [o.total_interest for o in rich.options]
    assert emis == sorted(emis, reverse=True) and interest == sorted(interest)


def test_fairness_probes_pass_on_mock_catalogue(client):
    d = client.get("/api/v1/system/fairness").json()["data"]
    assert d["passed"] and d["protected_attributes_used"] == []
    assert {p["name"] for p in d["probes"]} >= {"money_never_hides_best_fits", "fit_ignores_home_region"}


def test_outcome_summary_is_k_anonymous():
    row = {
        "status": "enrolled",
        "followed_recommendation_rank": 2,
        "satisfaction": 4,
        "scholarship_received": True,
    }
    assert ft.outcome_summary([row] * 4).suppressed
    s = ft.outcome_summary([row] * 4 + [{**row, "followed_recommendation_rank": None}])
    assert not s.suppressed and s.followed_top3_share == 0.8 and s.by_status == {"enrolled": 5}


def test_endpoints_in_mock_mode(client):
    assert client.get(f"/api/v1/students/{SID}/deadlines", headers=P).json()["data"]["items"]
    ics = client.get(f"/api/v1/students/{SID}/deadlines.ics", headers=P)
    assert ics.status_code == 200 and ics.headers["content-type"].startswith("text/calendar")
    bad = client.post(f"/api/v1/students/{SID}/reminders", headers=P, json={"channel": "sms"})
    assert bad.status_code == 422
    cal = client.post(f"/api/v1/students/{SID}/reminders", headers=P, json={"channel": "calendar"})
    assert cal.status_code == 422
    plan = client.post(
        f"/api/v1/students/{SID}/reminders", headers=P, json={"channel": "whatsapp", "phone": "+919876543210"}
    )
    assert plan.status_code == 201
    loan = client.get("/api/v1/loans/explain?amount=600000&course_years=4&annual_income=300000")
    assert loan.json()["data"]["interest_while_studying"] == 0
    out = client.post(
        f"/api/v1/students/{SID}/outcomes", headers=S, json={"status": "enrolled", "satisfaction": 4}
    )
    assert out.status_code == 201
    assert client.get("/api/v1/admin/outcomes/summary", headers=A).json()["data"]["suppressed"]
    assert client.get("/api/v1/admin/outcomes/summary", headers=P).status_code == 403
    mentors = client.get("/api/v1/mentors", headers=P).json()["data"]
    assert mentors["items"] == [] and "consent" in mentors["notice"]
    assert client.get("/api/v1/educator/dashboard", headers=P).status_code == 403
    dash = client.get("/api/v1/educator/dashboard", headers=E).json()["data"]
    assert len(dash["students"]) == 1 and dash["students"][0]["top_career"]


def test_family_report_languages_and_views(client):
    rid = client.get("/api/v1/analysis/runs", headers=P).json()["data"]["items"][0]["run_id"]
    ta = client.get(f"/api/v1/analysis/runs/{rid}/report?lang=ta", headers=P)
    assert ta.status_code == 200 and "text/html" in ta.headers["content-type"]
    assert "முன்னணி தொழில்கள்" in ta.text and 'lang="ta"' in ta.text
    hi = client.get(f"/api/v1/analysis/runs/{rid}/report?lang=hi", headers=S).text
    assert "शीर्ष करियर" in hi and "साथ बैठकर बात करें" not in hi  # discussion prompts are for parents
    en = client.get(f"/api/v1/analysis/runs/{rid}/report", headers=P).text
    assert "<script" not in en


def test_educator_view_hides_family_money(client):
    rid = client.get("/api/v1/analysis/runs", headers=P).json()["data"]["items"][0]["run_id"]
    run = client.get(f"/api/v1/analysis/runs/{rid}", headers=E).json()["data"]
    assert all(r["financial"]["family_funds"] is None for r in run["recommendations"])
    assert run["recommendations"][0]["financial"]["affordability_class"]


def test_twilio_provider_formats_whatsapp_and_sms():
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(dict(x.split("=", 1) for x in req.content.decode().split("&")))
        return httpx.Response(201, json={"sid": "SM1"})

    t = TwilioProvider(
        "AC1", "tok", "+15550001", "+15550002", client=httpx.Client(transport=httpx.MockTransport(handler))
    )
    t.send("whatsapp", "+919876543210", "hi")
    t.send("sms", "+919876543210", "hi")
    assert seen[0]["To"] == "whatsapp%3A%2B919876543210" and seen[0]["From"] == "whatsapp%3A%2B15550002"
    assert seen[1]["To"] == "%2B919876543210" and seen[1]["From"] == "%2B15550001"
    c = ConsoleProvider()
    c.send("sms", "+919876543210", "x")
    assert c.sent == [("sms", "+919876543210", "x")]


def test_report_has_dates_for_today():
    assert ft.deadlines(analysis_run(), catalog_input(), date(2030, 1, 1), 30).items == []
