"""Live postings feed, tested against a fake HTTP server (no network, no key needed)."""

from datetime import date

import httpx

from app.etl.adapters.adzuna import AdzunaAdapter, PostingCount, PostingQuery, plan_queries, to_signals
from app.schemas.common import VerificationStatus

TODAY = date(2026, 10, 7)


def _client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_disabled_without_keys():
    res = AdzunaAdapter(None, None).fetch([PostingQuery("x", "x", "IN", None)], TODAY, 5)
    assert res.counts == [] and res.calls == 0 and "disabled" in res.errors[0]


def test_fetch_sends_the_right_query_and_parses_counts():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"count": 1234, "mean": 850000.5, "results": []})

    feed = AdzunaAdapter("id", "key", client=_client(handler))
    res = feed.fetch([PostingQuery("data-scientist", "data scientist", "IN-TN-CBE", "Coimbatore")], TODAY, 5)
    assert res.errors == [] and res.calls == 1
    assert res.counts[0].count == 1234 and res.counts[0].mean_salary == 850000.5
    q = seen[0].url
    assert q.path == "/v1/api/jobs/in/search/1"
    assert q.params["what"] == "data scientist" and q.params["where"] == "Coimbatore"
    assert q.params["app_id"] == "id" and q.params["results_per_page"] == "1"


def test_errors_are_collected_and_rate_limit_stops_the_run():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(500 if calls["n"] == 1 else 429)

    feed = AdzunaAdapter("id", "key", client=_client(handler))
    queries = [PostingQuery(f"c{i}", "kw", "IN", None) for i in range(5)]
    res = feed.fetch(queries, TODAY, 5)
    assert res.calls == 2 and res.counts == []
    assert any("HTTP 500" in e for e in res.errors) and any("rate limit" in e for e in res.errors)


def test_plan_respects_budget_and_rotates_cities():
    careers = [("a", "a"), ("b", "b")]
    cities = [("C1", "City1"), ("C2", "City2"), ("C3", "City3")]
    day0 = plan_queries(careers, cities, budget=4, day_index=0)
    day1 = plan_queries(careers, cities, budget=4, day_index=1)
    assert len(day0) == 4 and [q.region_code for q in day0[:2]] == ["IN", "IN"]
    assert day0[2:] != day1[2:]
    assert len(plan_queries(careers, cities, budget=1, day_index=0)) == 1


def test_signals_rank_demand_and_compute_velocity():
    def pc(slug, n):
        return PostingCount(PostingQuery(slug, slug, "IN", None), n, None, TODAY)

    drafts = {
        d.career_slug: d for d in to_signals([pc("a", 100), pc("b", 300), pc("c", 200)], {("b", "IN"): 200})
    }
    assert drafts["b"].demand_index > drafts["c"].demand_index > drafts["a"].demand_index
    assert drafts["b"].job_velocity == 0.5 and drafts["a"].job_velocity is None
    prov = drafts["b"].provenance()
    assert prov.verification is VerificationStatus.VERIFIED and not prov.is_estimate
    assert "300 live ads" in prov.evidence
