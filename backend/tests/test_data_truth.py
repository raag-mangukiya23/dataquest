"""Truth rules: provenance, quality gates, freshness, data trust, corrected fixtures, audit gate."""

import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.engine import freshness as fr
from app.etl import quality
from app.mocks import builders as b
from app.schemas.common import Freshness, Provenance, VerificationStatus

D = date(2026, 10, 7)


def prov(**kw):
    base = {"source_name": "x", "as_of": D, "confidence": 0.5, "is_estimate": True}
    return Provenance(**(base | kw))


def test_provenance_rules():
    prov()  # an unverified estimate is fine
    with pytest.raises(ValidationError):
        prov(is_estimate=False)  # a fact must be checked
    with pytest.raises(ValidationError):
        prov(is_estimate=False, verification="secondary", verified_on=D)  # ... and cite evidence
    with pytest.raises(ValidationError):
        prov(is_estimate=False, verification="verified", verified_on=D, evidence="e")  # verified needs a URL
    with pytest.raises(ValidationError):
        prov(verification="disputed", is_estimate=False, verified_on=D, evidence="e")
    with pytest.raises(ValidationError):
        prov(source_url="http://insecure.example")
    ok = prov(
        is_estimate=False,
        verification="verified",
        verified_on=D,
        evidence="bulletin p.4",
        source_url="https://scholarships.gov.in",
    )
    assert ok.verification is VerificationStatus.VERIFIED


def test_freshness_against_cadence():
    assert fr.freshness_status(date(2026, 9, 30), D, 30) is Freshness.FRESH
    assert fr.freshness_status(date(2026, 8, 20), D, 30) is Freshness.AGING
    assert fr.freshness_status(date(2026, 6, 1), D, 30) is Freshness.STALE
    assert fr.decay_weight(D, D, 30) == 1.0
    assert fr.decay_weight(date(2026, 9, 7), D, 30) == pytest.approx(0.5)


def test_blend_prefers_recent_confident_observations():
    old = fr.Observation(0.2, date(2025, 10, 7), 1.0)
    new = fr.Observation(0.8, date(2026, 10, 1), 1.0)
    out = fr.blend([old, new], D, half_life_days=30, cadence_days=30)
    assert out is not None and out.value > 0.75 and out.freshness is Freshness.FRESH
    only_old = fr.blend([old], D, half_life_days=30, cadence_days=30)
    assert only_old is not None and only_old.freshness is Freshness.STALE
    assert (only_old.ci_high - only_old.ci_low) > (out.ci_high - out.ci_low)


def test_quality_gates_catch_bad_rows():
    css = b.scholarship("css-nsp")
    broken = css.model_copy(
        update={
            "year_amounts": [12_000, 12_000],
            "eligibility_rules": {"all": [{"field": "caste", "op": "==", "value": "x"}]},
        }
    )
    rules = {i.rule for i in quality.check_scholarship(broken, D)}
    assert {"year_amounts_length", "bad_rules"} <= rules
    band = b.salary_bands("data-scientist")[0]
    inverted = band.model_copy(update={"mid_p50": band.entry_p50 - 1})
    assert "salary_order" in {i.rule for i in quality.check_salary("ds", inverted)}
    jee = b.exam("JEE_MAIN")
    bad_session = jee.sessions[0].model_copy(update={"registration_close": date(2027, 2, 1)})
    assert "registration_after_exam" in {
        i.rule for i in quality.check_exam(jee.model_copy(update={"sessions": [bad_session]}), D)
    }
    future = b.pathway("gct-cse-ds").model_copy(update={"fee_academic_year": 2030})
    assert "fee_year_in_future" in {i.rule for i in quality.check_pathway(future, D)}


def test_fixture_world_passes_all_gates():
    report = quality.audit(b.catalog(), D)
    assert report.errors == []


def test_corrections_from_the_source_check():
    jee = b.exam("JEE_MAIN")
    assert jee.sessions[0].exam_start == date(2027, 1, 22) and jee.sessions[0].exam_end == date(2027, 1, 30)
    assert jee.sessions[0].exam_date_status.value == "tentative"
    assert jee.provenance.verification is VerificationStatus.SECONDARY
    css = b.scholarship("css-nsp")
    assert css.year_amounts == [12_000, 12_000, 12_000, 20_000, 20_000] and css.stackable is False
    assert b.exam("NEET_UG").provenance.is_estimate  # not announced yet: must stay an estimate


def test_every_recommendation_reports_its_data_trust(client):
    run = client.get(f"/api/v1/analysis/runs/{b.w.RUN_ID}").json()["data"]
    for rec in run["recommendations"]:
        t = rec["data_trust"]
        checked = sum(i["verification"] in ("verified", "secondary") for i in t["inputs"])
        assert t["verified_share"] == pytest.approx(checked / len(t["inputs"]), abs=1e-4)
        assert t["note"].startswith(f"{checked} of {len(t['inputs'])} inputs")
    by_slug = {r["career"]["slug"]: r for r in run["recommendations"]}
    # The only path with a checked scholarship should be the most confident one.
    assert by_slug["computational-biologist"]["confidence"] > by_slug["data-scientist"]["confidence"]


def test_data_status_is_honest(client):
    d = client.get("/api/v1/system/data-status").json()["data"]
    assert d["computed_live"] is True
    assert "No live market feed" in d["statement"]
    assert not any(x["live_feed"] for x in d["datasets"])
    assert {f["key"]: f["enabled"] for f in d["feeds"]} == {"adzuna": False, "data_gov_in": False}
    total = sum(x["rows"] for x in d["datasets"])
    checked = sum(x["verified"] + x["secondary"] for x in d["datasets"])
    assert d["overall_checked_share"] == pytest.approx(checked / total, abs=1e-4)


def test_audit_script_gates_the_demo():
    script = Path(__file__).resolve().parents[1] / "scripts" / "data_audit.py"
    ok = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
    assert ok.returncode == 0 and "All quality gates passed" in ok.stdout
    strict = subprocess.run(
        [sys.executable, str(script), "--demo", "--strict"], capture_output=True, text=True
    )
    assert strict.returncode == 1 and "Verify before the demo" in strict.stdout
    assert "made-up placeholder" in strict.stdout
