"""Realism checks on the full seed catalogue: answers drive careers, money drives funding, and neither a poor fit
nor a long-shot entry exam can be carried to the top by cheap fees or high pay."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.dimensions import DIMENSIONS
from app.engine.types import FamilyInput, StudentInput
from app.services.analysis import run_analysis

TODAY = date(2026, 10, 7)
NOW = datetime(2026, 10, 7, 9, 30, tzinfo=UTC)


@pytest.fixture(scope="module")
def cat(tmp_path_factory):
    import app.models  # noqa: F401  (registers every table)
    from app.db.base import Base
    from app.etl import loader
    from app.services.catalog_db import load_catalog

    engine = create_engine(f"sqlite:///{tmp_path_factory.mktemp('realism') / 'r.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        assert loader.load(db, TODAY, label="seed-realism")["status"] == "completed"
        db.commit()
        return load_catalog(db)


def vec(**kw: float) -> dict[str, float]:
    return {d: kw.get(d, 0.45) for d in DIMENSIONS}


ARCHETYPES = {
    "arts": (
        vec(
            riasec_a=0.95,
            riasec_s=0.6,
            riasec_i=0.3,
            riasec_r=0.3,
            riasec_c=0.2,
            cog_creative=0.95,
            cog_analytical=0.35,
            apt_numerical=0.35,
            apt_spatial=0.8,
            apt_verbal=0.7,
            val_autonomy=0.85,
        ),
        "design_arts",
    ),
    "computing": (
        vec(
            riasec_i=0.95,
            riasec_r=0.7,
            riasec_c=0.65,
            riasec_a=0.2,
            riasec_s=0.25,
            cog_analytical=0.95,
            apt_numerical=0.95,
            apt_logical=0.9,
            apt_spatial=0.75,
            val_financial=0.8,
        ),
        "computing_ai",
    ),
    "business": (
        vec(
            riasec_e=0.95,
            riasec_c=0.8,
            riasec_s=0.6,
            riasec_i=0.4,
            riasec_a=0.3,
            apt_numerical=0.75,
            apt_verbal=0.75,
            cog_practical=0.85,
            val_financial=0.95,
            risk_tolerance=0.8,
        ),
        "business_finance",
    ),
}


def student(v: dict[str, float]) -> StudentInput:
    return StudentInput(
        student_id="realism",
        vector=v,
        reliability=dict.fromkeys(DIMENSIONS, 0.9),
        imputed=(),
        completeness=1.0,
        grade=12,
        region_code="IN-TN-CBE",
        state="Tamil Nadu",
        willing_to_relocate=0.5,
        willing_abroad=0.1,
        recent_score_pct=80,
    )


def family(income: int, savings: int, emi: int) -> FamilyInput:
    return FamilyInput(
        family_id="realism",
        annual_income=income,
        income_growth=0.05,
        savings=savings,
        existing_emi=0,
        dependents=2,
        max_emi=emi,
        loan_tolerance=0.5,
        risk_appetite=0.5,
        relocation=0.5,
        abroad=0.1,
        time_to_earn_years=5,
        prestige_vs_stability="balanced",
    )


RICH, POOR = family(1_500_000, 2_000_000, 25_000), family(240_000, 50_000, 3_000)


@pytest.mark.parametrize("name", list(ARCHETYPES))
def test_answers_drive_the_top_careers(cat, name):
    v, sector = ARCHETYPES[name]
    for fam in (RICH, POOR):
        top = run_analysis(student(v), fam, cat, today=TODAY, now=NOW).recommendations[:5]
        assert sum(r.career.sector == sector for r in top) >= 2, [r.career.name for r in top]
        assert all(r.fit.fit >= 0.5 for r in top), [(r.career.name, r.fit.fit) for r in top]


def test_poor_fit_is_never_carried_up_by_money(cat):
    v, _ = ARCHETYPES["arts"]
    run = run_analysis(student(v), POOR, cat, today=TODAY, now=NOW)
    for r in run.recommendations:
        if r.fit.fit < 0.5:
            assert any("scaled to" in e for e in r.explanation)
            assert abs(sum(c.contribution for c in r.contributions) - r.final_score) < 1e-3
    best_fit = max(run.recommendations, key=lambda r: r.fit.fit)
    worst_fit = min(run.recommendations, key=lambda r: r.fit.fit)
    assert best_fit.rank < worst_fit.rank


def test_long_shot_entry_exams_are_weighted_by_the_chance(cat):
    v = vec(riasec_s=0.95, riasec_e=0.6, riasec_a=0.6, riasec_i=0.45, apt_verbal=0.85, val_impact=0.95)
    run = run_analysis(student(v), RICH, cat, today=TODAY, now=NOW, top_k=60)
    civil = next(r for r in run.recommendations if r.career.slug == "civil-servant")
    assert civil.rank > 5 and any("Getting in is the hard part" in e for e in civil.explanation)
    assert civil.financial.reachability <= 0.51 * civil.financial.affordability + 1e-6
    assert civil.financial.roi.starting_salary > 500_000  # the job's own pay is still shown


def test_borrowing_lowers_affordability_but_money_still_helps(cat):
    v, _ = ARCHETYPES["computing"]
    poor = run_analysis(student(v), POOR, cat, today=TODAY, now=NOW, top_k=60)
    rich = run_analysis(student(v), RICH, cat, today=TODAY, now=NOW, top_k=60)
    by_id = {r.career.id: r for r in rich.recommendations}
    for r in poor.recommendations:
        if r.financial.loan_required and r.career.id in by_id:
            assert r.financial.affordability < 1.0
            assert by_id[r.career.id].financial.affordability >= r.financial.affordability


def test_careless_answers_lower_confidence_and_say_why(cat):
    from dataclasses import replace

    v, _ = ARCHETYPES["computing"]
    careful = student(v)
    careless = replace(
        careful, reliability=dict.fromkeys(DIMENSIONS, 0.35), quality_flags=("straight_lining", "speeding")
    )
    a = run_analysis(careful, RICH, cat, today=TODAY, now=NOW)
    b = run_analysis(careless, RICH, cat, today=TODAY, now=NOW)
    assert b.data_quality.confidence_penalty > a.data_quality.confidence_penalty
    assert b.recommendations[0].confidence < 0.85 * a.recommendations[0].confidence
    assert any("identical" in w for w in b.data_quality.warnings)
    assert not any("_" in w.split(".")[0] for w in b.data_quality.warnings)  # plain words, no codes
