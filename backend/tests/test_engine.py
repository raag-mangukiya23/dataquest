"""Engine properties, fairness, golden personas and performance."""

import json
import os
import time
from dataclasses import replace
from datetime import date, datetime
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.core.dimensions import DIMENSIONS
from app.engine import conflict, eligibility, finance, fit, scoring
from app.engine.config import DEFAULT_CONFIG
from app.mocks import builders as b
from app.schemas.analysis import ScoreComponent
from app.schemas.common import AffordabilityClass, Bucket, CareerRef
from app.services.analysis import run_analysis
from tests.personas import family, personas, vec

TODAY = date(2026, 10, 7)
NOW = datetime(2026, 10, 7, 9, 30)
CAT = b.catalog_input()
ORDER = [
    AffordabilityClass.INFEASIBLE,
    AffordabilityClass.LOAN_DEPENDENT,
    AffordabilityClass.STRETCH,
    AffordabilityClass.COMFORTABLE,
]
GOLDEN = Path(__file__).parent / "golden"
unit = st.floats(min_value=0, max_value=1, allow_nan=False)


def run(s, f, cfg=DEFAULT_CONFIG):
    return run_analysis(s, f, CAT, today=TODAY, now=NOW, cfg=cfg)


# ---------------------------------------------------------------- financial solver
@settings(max_examples=60, deadline=None)
@given(
    savings=st.integers(0, 3_000_000),
    extra=st.integers(1, 2_000_000),
    emi=st.integers(0, 50_000),
    tol=unit,
    pathway=st.sampled_from(CAT.pathways),
)
def test_more_money_never_lowers_affordability(savings, extra, emi, tol, pathway):
    s = b.student_input()
    poor = family(savings=savings, max_emi=emi, loan_tolerance=tol)
    rich = replace(poor, savings=savings + extra)
    a = finance.assess(pathway, poor, s, [], [], DEFAULT_CONFIG, TODAY)
    c = finance.assess(pathway, rich, s, [], [], DEFAULT_CONFIG, TODAY)
    assert c.affordability >= a.affordability
    assert ORDER.index(c.affordability_class) >= ORDER.index(a.affordability_class)
    more_emi = finance.assess(pathway, replace(poor, max_emi=emi + 5_000), s, [], [], DEFAULT_CONFIG, TODAY)
    assert more_emi.affordability >= a.affordability


def test_solver_formulas():
    f = family(
        annual_income=900_000,
        existing_emi=5_000,
        dependents=2,
        savings=600_000,
        income_growth=0.06,
        max_emi=12_000,
    )
    assert finance.affordable_share(f, DEFAULT_CONFIG) == pytest.approx(0.15 - 0.03 - 0.5 * 60_000 / 900_000)
    pv = finance.annuity_pv(12_000, 0.10, 120)
    assert pv == pytest.approx(908_000, rel=0.01)
    assert finance.loan_capacity(f, 4, DEFAULT_CONFIG) == int(pv / (1 + 0.10 * 5))
    assert finance.emi(0, 4, DEFAULT_CONFIG) == 0
    p = CAT.pathways[0]
    assert finance.total_cost(p, 2026, 0.0) == finance.per_year_cost(p) * p.duration_years


def test_scholarship_plan_respects_stacking_and_groups():
    p = CAT.pathways[0]
    css = b.scholarship("css-nsp")  # not stackable
    inspire = b.scholarship("inspire-she")  # same exclusive group as css
    merit = b.scholarship("pvt-ug-merit")
    plan = finance.best_plan(
        [finance.PlanItem(x, finance.scholarship_total(x, p)) for x in (css, inspire, merit)], cap=10_000_000
    )
    ids = {i.scholarship.id for i in plan}
    assert not ({css.id, inspire.id} <= ids)
    assert len(plan) == 1 or all(i.scholarship.stackable for i in plan)


def test_eligibility_never_guesses_missing_facts():
    rules = {
        "all": [
            {"field": "board_percentile", "op": ">", "value": 80},
            {"field": "annual_income", "op": "<", "value": 450_000},
        ]
    }
    assert eligibility.evaluate(rules, {"annual_income": 300_000})[0] is None
    assert eligibility.evaluate(rules, {"annual_income": 900_000})[0] is False
    assert eligibility.evaluate(rules, {"annual_income": 300_000, "board_percentile": 85})[0] is True


# ---------------------------------------------------------------- fit and scores
@given(st.lists(unit, min_size=19, max_size=19), st.lists(unit, min_size=19, max_size=19))
def test_fit_in_range(a, r):
    out = fit.compute_fit(dict(zip(DIMENSIONS, a, strict=True)), dict(zip(DIMENSIONS, r, strict=True)))
    assert 0 <= out.fit <= 1 and 0 <= out.cosine <= 1 and 0 <= out.distance_score <= 1


def test_identical_profile_is_a_perfect_fit():
    v = vec(riasec_i=0.9, apt_logical=0.8, val_security=0.2)
    assert fit.compute_fit(v, v).fit == pytest.approx(1.0)


def test_exceeding_an_aptitude_requirement_is_not_penalised():
    req = vec(apt_numerical=0.6)
    assert (
        fit.compute_fit(vec(apt_numerical=0.95), req).distance_score
        >= fit.compute_fit(req, req).distance_score - 1e-9
    )


@given(
    st.dictionaries(st.sampled_from(list(ScoreComponent)), unit, min_size=6, max_size=6),
    st.lists(st.floats(0, 1), min_size=6, max_size=6),
)
def test_final_score_in_range(raw, ws):
    weights = dict(zip(DEFAULT_CONFIG.weights, ws, strict=True))
    assert 0 <= scoring.final_score(raw, weights) <= 1


# ---------------------------------------------------------------- conflict index
refs = st.lists(
    st.builds(
        CareerRef,
        id=st.sampled_from(list("abcdef")),
        slug=st.just("x"),
        name=st.just("x"),
        sector=st.sampled_from(["s1", "s2", "s3"]),
    ),
    min_size=1,
    max_size=3,
)


@given(refs, refs)
def test_preference_overlap_is_symmetric_and_bounded(a, b_):
    assert conflict.overlap(a, b_) == pytest.approx(conflict.overlap(b_, a))
    assert 0 <= conflict.overlap(a, b_) <= 1


@settings(max_examples=25, deadline=None)
@given(risk=unit, appetite=unit, reloc_s=unit, reloc_f=unit)
def test_conflict_index_bounds_and_symmetric_gaps(risk, appetite, reloc_s, reloc_f):
    s = replace(
        b.student_input(),
        vector={**b.student_input().vector, "risk_tolerance": risk},
        willing_to_relocate=reloc_s,
    )
    f = replace(b.family_input(), risk_appetite=appetite, relocation=reloc_f)
    swapped_s = replace(s, vector={**s.vector, "risk_tolerance": appetite}, willing_to_relocate=reloc_f)
    swapped_f = replace(f, risk_appetite=risk, relocation=reloc_s)
    r1, r2 = run(s, f).conflict, run(swapped_s, swapped_f).conflict
    assert 0 <= r1.index <= 100
    g1 = {d.dimension: d.gap for d in r1.dimensions}
    g2 = {d.dimension: d.gap for d in r2.dimensions}
    assert g1["risk_appetite"] == pytest.approx(g2["risk_appetite"])
    assert g1["geography"] == pytest.approx(g2["geography"])


# ---------------------------------------------------------------- fairness
def test_low_income_students_still_see_ambitious_paths():
    """Same student, very different family incomes: the money must never hide what fits the student best."""
    s, _ = personas()["high_aptitude_low_budget"]
    poor = run(s, family(annual_income=240_000, savings=50_000, max_emi=3_000, dependents=3))
    rich = run(s, family(annual_income=2_500_000, savings=3_000_000, max_emi=40_000))

    def names(r, k):
        return [i.career_id for i in r.buckets[k]]

    assert names(poor, Bucket.BEST_FOR_STUDENT) == names(rich, Bucket.BEST_FOR_STUDENT)
    visible = {
        i.career_id
        for k in (Bucket.BEST_FOR_STUDENT, Bucket.STRETCH_GOALS, Bucket.BEST_OVERALL)
        for i in poor.buckets[k]
    }
    for rec in rich.recommendations:
        if rec.fit.fit >= 0.75:
            assert rec.career.id in visible, rec.career.name


# ---------------------------------------------------------------- golden personas
def _summary(r):
    return {
        "top3": [x.career.slug for x in r.recommendations[:3]],
        "best_for_student": [i.career_name for i in r.buckets[Bucket.BEST_FOR_STUDENT]],
        "classes": {x.career.slug: x.financial.affordability_class.value for x in r.recommendations},
        "conflict_band": r.conflict.band.value,
    }


@pytest.mark.parametrize("name", list(personas()))
def test_golden_persona(name):
    s, f = personas()[name]
    out = _summary(run(s, f))
    path = GOLDEN / f"{name}.json"
    if os.environ.get("UPDATE_GOLDEN") or not path.exists():
        path.write_text(json.dumps(out, indent=2) + "\n")
    assert out == json.loads(path.read_text()), f"{name} changed; rerun with UPDATE_GOLDEN=1 if intended"


def test_golden_persona_stories():
    p = personas()
    aligned = run(*p["aligned_family"])
    assert aligned.conflict.band.value in ("aligned", "mild")
    assert aligned.recommendations[0].career.slug == "ux-designer"
    loan = run(*p["loan_dependent_family"])
    assert any(
        r.financial.affordability_class is AffordabilityClass.LOAN_DEPENDENT for r in loan.recommendations
    )
    poor = run(*p["high_aptitude_low_budget"])
    assert poor.buckets[Bucket.STRETCH_GOALS], "unaffordable high-fit careers must stay visible"


# ---------------------------------------------------------------- reproducibility and performance
def test_runs_are_reproducible():
    a = run(b.student_input(), b.family_input())
    c = run(b.student_input(), b.family_input())
    assert a.reproducibility.input_hash == c.reproducibility.input_hash
    assert [r.final_score for r in a.recommendations] == [r.final_score for r in c.recommendations]
    assert a.sensitivity == c.sensitivity


def test_full_run_under_500_ms():
    start = time.perf_counter()
    run(b.student_input(), b.family_input())
    assert (time.perf_counter() - start) * 1000 < 500
