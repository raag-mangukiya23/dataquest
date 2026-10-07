"""The five golden personas from the brief, as engine inputs. Vectors are synthetic but plausible."""

from dataclasses import replace

from app.core.dimensions import DIMENSIONS
from app.engine.types import FamilyInput, Preference, StudentInput
from app.mocks import builders as b
from app.mocks import world as w


def vec(**kw: float) -> dict[str, float]:
    return {d: kw.get(d, 0.5) for d in DIMENSIONS}


def student(key: str, v: dict[str, float], **kw) -> StudentInput:
    base = StudentInput(
        student_id=f"golden-{key}",
        vector=v,
        reliability=dict.fromkeys(DIMENSIONS, 0.9),
        imputed=(),
        completeness=1.0,
        grade=12,
        region_code="IN-TN-CBE",
        state="Tamil Nadu",
        willing_to_relocate=0.5,
        willing_abroad=0.2,
        recent_score_pct=80.0,
    )
    return replace(base, **kw)


def family(**kw) -> FamilyInput:
    base = FamilyInput(
        family_id="golden",
        annual_income=900_000,
        income_growth=0.05,
        savings=500_000,
        existing_emi=0,
        dependents=2,
        max_emi=10_000,
        loan_tolerance=0.4,
        risk_appetite=0.4,
        relocation=0.4,
        abroad=0.1,
        time_to_earn_years=5,
        prestige_vs_stability="balanced",
    )
    return replace(base, **kw)


def personas() -> dict[str, tuple[StudentInput, FamilyInput]]:
    cid = lambda slug: w.sid("career", slug)  # noqa: E731
    return {
        "high_aptitude_low_budget": (
            student(
                "hal",
                vec(
                    riasec_i=0.9,
                    riasec_r=0.7,
                    apt_numerical=0.95,
                    apt_logical=0.95,
                    apt_spatial=0.9,
                    apt_verbal=0.8,
                    cog_analytical=0.9,
                    grit=0.85,
                ),
                recent_score_pct=96.0,
            ),
            family(
                annual_income=240_000,
                savings=50_000,
                max_emi=3_000,
                dependents=3,
                loan_tolerance=0.3,
                prestige_vs_stability="stability",
            ),
        ),
        "creative_risk_averse": (b.student_input(), b.family_input()),
        "rural_steam_innovator": (
            student(
                "rsi",
                vec(
                    riasec_r=0.9,
                    riasec_i=0.75,
                    cog_practical=0.9,
                    apt_spatial=0.8,
                    val_impact=0.85,
                    risk_tolerance=0.6,
                ),
                willing_to_relocate=0.2,
                recent_score_pct=72.0,
            ),
            family(
                annual_income=360_000,
                savings=80_000,
                max_emi=4_000,
                relocation=0.2,
                preferences=(Preference(rank=1, domain="agri_environment"),),
            ),
        ),
        "loan_dependent_family": (
            student(
                "ldf",
                vec(
                    riasec_r=0.85,
                    riasec_i=0.8,
                    apt_spatial=0.85,
                    apt_numerical=0.8,
                    apt_logical=0.8,
                    cog_practical=0.85,
                    cog_creative=0.65,
                ),
            ),
            family(
                annual_income=700_000,
                savings=100_000,
                max_emi=15_000,
                loan_tolerance=0.8,
                preferences=(Preference(rank=1, career_id=cid("robotics-engineer")),),
            ),
        ),
        "aligned_family": (
            student(
                "alf",
                vec(
                    riasec_a=0.92,
                    riasec_s=0.65,
                    cog_creative=0.92,
                    apt_verbal=0.75,
                    val_autonomy=0.8,
                    riasec_c=0.3,
                    risk_tolerance=0.65,
                ),
                willing_to_relocate=0.8,
                willing_abroad=0.4,
            ),
            family(
                annual_income=2_500_000,
                savings=3_000_000,
                max_emi=40_000,
                loan_tolerance=0.6,
                risk_appetite=0.65,
                relocation=0.8,
                abroad=0.4,
                prestige_vs_stability="balanced",
                preferences=(
                    Preference(rank=1, career_id=cid("ux-designer")),
                    Preference(rank=2, domain="design_arts"),
                ),
            ),
        ),
    }
