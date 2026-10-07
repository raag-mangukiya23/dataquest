"""The public site (site/) is served by the backend and its API contract is answered by the PRISM engine."""

INPUT = {
    "student": {"interest": "creative", "logic": 50, "creative": 85, "comm": 70, "hands": 55, "sci": 40},
    "parent": {"priority": "passion", "budget": 40, "risk": 50, "minpay": 5, "mobility": "intrastate",
               "tier": "tier2", "firstGen": False},
    "region": "coimbatore",
    "scholarship": True,
    "hyperlocal": True,
}  # fmt: skip
CAREER_KEYS = {"id", "name", "domain", "c", "hyperlocal", "v", "cost", "years", "entry", "mid", "vol", "d", "exams",
               "funds"}  # fmt: skip
SCORED_KEYS = {
    "composite",
    "fit",
    "fin",
    "riskAl",
    "mkt",
    "finGap",
    "yieldGap",
    "roiScore",
    "interestMatch",
    "c",
}


def test_site_is_served_at_root(client):
    r = client.get("/")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    assert client.get("/app.js").status_code == 200
    assert client.get("/api/v1/system/health").status_code == 200  # API routes still win


def test_assess_returns_the_shape_app_js_renders(client):
    r = client.post("/api/assess", json=INPUT)
    assert r.status_code == 201
    d = r.json()
    assert d["ok"] and d["persisted"] and len(d["id"]) == 36
    res = d["result"]
    assert res["source"] == "prism-backend" and len(res["top"]) == 3 and res["best"] == res["top"][0]
    for s in res["top"]:
        assert set(s) >= SCORED_KEYS and set(s["c"]) >= CAREER_KEYS
        assert set(s["c"]["v"]) == {"logic", "creative", "comm", "hands", "sci"}
        assert set(s["c"]["d"]) == {"chennai", "coimbatore", "bengaluru", "hyderabad", "pune", "remote"}
        assert 0 <= s["composite"] <= 100 and s["c"]["funds"]
    assert [t["composite"] for t in res["top"]] == sorted((t["composite"] for t in res["top"]), reverse=True)
    assert 0 <= res["pci"] <= 100 and len(res["parentVec"]) == 5 and res["capacity"] > 0
    assert res["gaps"] and all(set(g) == {"warn", "html"} for g in res["gaps"])
    assert res["audit"] and "<script" not in str(res)


def test_share_link_returns_the_saved_result(client):
    d = client.post("/api/assess", json=INPUT).json()
    again = client.get(f"/api/assess/{d['id']}").json()
    assert again["ok"] and again["input"] == d["input"] and again["result"] == d["result"]
    assert client.get("/api/assess/not-an-id").status_code == 400
    assert client.get("/api/assess/00000000-0000-0000-0000-000000000000").status_code == 404


def test_validation_and_guards(client):
    bad = client.post("/api/assess", json={"student": {"interest": "nope"}, "parent": {}})
    assert bad.status_code == 400 and bad.json() == {
        "ok": False, "error": "validation failed", "detail": bad.json()["detail"]
    }  # fmt: skip
    assert client.post("/api/assess", content=b"{not json").status_code == 400
    assert client.post("/api/assess", content=b"x" * 9000).status_code == 413
    assert (
        client.post("/api/assess", json=INPUT, headers={"origin": "https://evil.example"}).status_code == 403
    )
    clamped = client.post("/api/score", json={**INPUT, "student": {**INPUT["student"], "logic": 500}}).json()
    assert clamped["input"]["student"]["logic"] == 100 and clamped["persisted"] is False


def test_battery_and_insights(client):
    before = client.get("/api/insights").json()
    body = {"aptitude": {"logic": {"score": 70}, "creative": 60, "comm": 55, "hands": 40, "sci": 65},
            "profile": INPUT, "answered": 40, "total": 43}  # fmt: skip
    r = client.post("/api/battery", json=body)
    assert r.status_code == 201 and r.json()["battery"]["meanAptitude"] == 58
    client.post("/api/assess", json=INPUT)
    after = client.get("/api/insights").json()
    assert after["ok"] and after["total"] == before["total"] + 1
    assert (
        after["battery"]["attempts"] == before["battery"]["attempts"] + 1 and after["battery"]["partial"] >= 1
    )
    assert after["topCareers"] and after["recent"][0]["career"]


def test_market_and_health(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["engine"] == "prism-backend" and h["careers"] > 0
    m = client.get("/api/market?region=pune").json()
    assert m["ok"] and m["careers"] == sorted(m["careers"], key=lambda c: -c["demand"])
    assert client.get("/api/market?region=mars").status_code == 400
