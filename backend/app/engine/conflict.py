"""Parent-student conflict index and parent acceptance.

Parent acceptance of a career (0-1), from the ranked preference list:
  exact career at rank k      1.00 - 0.08 (k - 1)
  domain (sector) at rank k   0.85 - 0.08 (k - 1)
  same sector as a preferred career at rank k   0.60 - 0.05 (k - 1)
  otherwise 0.35 (0.5 when parents gave no preferences); 'stability' parents add 0.1 * (0.5 - automation risk)

Conflict index (0-100) = 100 * sum_k w_k * gap_k over six dimensions:
  domain_preference  1 - symmetric overlap of the student's top 3 (by fit) and the parents' top 3 (by acceptance);
                     same career = 1, same sector = 0.5
  risk_appetite      |student risk tolerance - parent risk appetite|
  geography          mean(|relocation gap|, |abroad gap|)
  budget             mean over the student's top 3 of max(0, cheapest cost - family funds and scholarships) / cost
  time_to_earn       |years until the student's top choices pay - parents' expectation| / 4, capped at 1
  prestige_stability |student position - parent position|; parent stability 0.2, balanced 0.5, prestige 0.8;
                     student position = 0.5 + mean(financial reward, risk tolerance) - security
Bands: aligned < 20 <= mild < 40 <= moderate < 60 <= high. Preference dimensions are symmetric (tested).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.engine.types import FamilyInput, StudentInput
from app.schemas.analysis import BridgeCareer, ConflictDimension, ConflictDriver, ConflictReport
from app.schemas.catalog import CareerDetail
from app.schemas.common import CareerRef, ConflictBand

PARENT_POSITION = {"stability": 0.2, "balanced": 0.5, "prestige": 0.8}
LABELS = {
    "domain_preference": "field choice",
    "risk_appetite": "appetite for risk",
    "geography": "where to study",
    "budget": "budget",
    "time_to_earn": "time to first salary",
    "prestige_stability": "stability versus ambition",
}


@dataclass(frozen=True)
class CareerView:
    career: CareerRef
    fit: float
    acceptance: float
    cheapest_cost: int
    own_funds: int
    years_to_earn: int


def acceptance(career: CareerDetail, family: FamilyInput, careers: Mapping[str, CareerDetail]) -> float:
    if not family.preferences:
        base = 0.5
    else:
        base = 0.35
        for p in family.preferences:
            k = p.rank - 1
            if p.career_id == career.id:
                base = max(base, 1.0 - 0.08 * k)
            elif p.domain and p.domain == career.sector:
                base = max(base, 0.85 - 0.08 * k)
            elif p.career_id and p.career_id in careers and careers[p.career_id].sector == career.sector:
                base = max(base, 0.60 - 0.05 * k)
    if family.prestige_vs_stability == "stability":
        base += 0.1 * (0.5 - career.automation_risk)
    return round(max(0.0, min(1.0, base)), 4)


def overlap(a: Sequence[CareerRef], b: Sequence[CareerRef]) -> float:
    """Symmetric top-k overlap: same career counts 1, same sector 0.5."""
    if not a or not b:
        return 0.0

    def best(x: CareerRef, pool: Sequence[CareerRef]) -> float:
        return max(1.0 if x.id == y.id else 0.5 if x.sector == y.sector else 0.0 for y in pool)

    return (sum(best(x, b) for x in a) / len(a) + sum(best(y, a) for y in b) / len(b)) / 2


def student_position(v: Mapping[str, float]) -> float:
    return max(0.0, min(1.0, 0.5 + (v["val_financial"] + v["risk_tolerance"]) / 2 - v["val_security"]))


def _band(index: float) -> ConflictBand:
    if index < 20:
        return ConflictBand.ALIGNED
    if index < 40:
        return ConflictBand.MILD
    if index < 60:
        return ConflictBand.MODERATE
    return ConflictBand.HIGH


def _hm(a: float, b: float) -> float:
    return 0.0 if a + b == 0 else 2 * a * b / (a + b)


def compute(
    student: StudentInput,
    family: FamilyInput,
    views: Sequence[CareerView],
    weights: Mapping[str, float],
    full: bool,
) -> ConflictReport:
    by_fit = sorted(views, key=lambda v: (-v.fit, v.career.id))[:3]
    by_parent = sorted(views, key=lambda v: (-v.acceptance, v.career.id))[:3]
    v = student.vector
    names = lambda xs: ", ".join(x.career.name for x in xs)  # noqa: E731
    mean_years = sum(x.years_to_earn for x in by_fit) / len(by_fit) if by_fit else family.time_to_earn_years
    budget_gaps = [max(0, x.cheapest_cost - x.own_funds) / x.cheapest_cost for x in by_fit if x.cheapest_cost]
    sp = student_position(v)
    pp = PARENT_POSITION.get(family.prestige_vs_stability, 0.5)
    gaps = {
        "domain_preference": (
            1 - overlap([x.career for x in by_fit], [x.career for x in by_parent]),
            f"Top matches: {names(by_fit)}",
            f"Top hopes: {names(by_parent)}",
        ),
        "risk_appetite": (
            abs(v["risk_tolerance"] - family.risk_appetite),
            f"Risk tolerance {v['risk_tolerance']:.2f}",
            f"Risk appetite {family.risk_appetite:.2f}",
        ),
        "geography": (
            (
                abs(student.willing_to_relocate - family.relocation)
                + abs(student.willing_abroad - family.abroad)
            )
            / 2,
            f"Relocate {student.willing_to_relocate:.1f}, abroad {student.willing_abroad:.1f}",
            f"Relocate {family.relocation:.1f}, abroad {family.abroad:.1f}",
        ),
        "budget": (
            sum(budget_gaps) / len(budget_gaps) if budget_gaps else 0.0,
            f"Top choices cost up to Rs {max((x.cheapest_cost for x in by_fit), default=0):,}",
            f"Family can fund about Rs {max((x.own_funds for x in by_fit), default=0):,}",
        ),
        "time_to_earn": (
            min(1.0, abs(mean_years - family.time_to_earn_years) / 4),
            f"About {mean_years:.0f} years until earning",
            f"Expects earning within {family.time_to_earn_years} years",
        ),
        "prestige_stability": (
            abs(sp - pp),
            f"Position {sp:.2f} (0 = stability, 1 = ambition)",
            f"Prefers {family.prestige_vs_stability}",
        ),
    }
    dims = [
        ConflictDimension(
            dimension=k,
            gap=round(min(1.0, g), 4),
            weight=weights[k],
            contribution=round(100 * weights[k] * min(1.0, g), 2),
            student_position=s,
            parent_position=p,
        )
        for k, (g, s, p) in gaps.items()
    ]
    index = round(sum(d.contribution for d in dims), 2)
    band = _band(index)
    bridges = sorted(views, key=lambda x: (-_hm(x.fit, x.acceptance), x.career.id))[:3]
    bridge_rows = [
        BridgeCareer(
            career=b.career,
            student_fit=b.fit,
            parent_acceptance=b.acceptance,
            bridge_score=round(_hm(b.fit, b.acceptance), 4),
            why=f"Fits the student at {b.fit:.0%} and the parents' hopes at {b.acceptance:.0%}",
        )
        for b in bridges
    ]
    top = sorted(dims, key=lambda d: (-d.contribution, d.dimension))[:3]
    bridge_name = bridge_rows[0].career.name if bridge_rows else "a bridge career"
    prompts = {
        "domain_preference": (
            f"You lean towards {names(by_fit[:2])}; your parents lean towards {names(by_parent[:2])}.",
            f"What draws each of you to these fields, and could {bridge_name} give you both what you want?",
        ),
        "risk_appetite": (
            "You are more comfortable with uncertainty than your parents are, or the other way round.",
            "Which risks worry each of you most, and what backup plan would make them acceptable?",
        ),
        "geography": (
            "You see the question of moving away for study differently.",
            "Which cities feel safe and affordable to everyone, and what support would make a move work?",
        ),
        "budget": (
            "Some of the preferred courses cost more than the family can comfortably fund.",
            "Which scholarships, loans or lower-cost colleges could close the gap?",
        ),
        "time_to_earn": (
            "You differ on how long study can take before earning starts.",
            "Would an internship-heavy or earn-while-you-learn route make a longer path acceptable?",
        ),
        "prestige_stability": (
            "One side values a secure job more; the other values ambition and reward more.",
            "What would 'secure enough' look like in numbers, and which careers meet it?",
        ),
    }
    drivers = [
        ConflictDriver(
            dimension=d.dimension,
            explanation=prompts[d.dimension][0],
            conversation_prompt=prompts[d.dimension][1],
        )
        for d in top
    ]
    if full:
        summary = (
            f"Conflict index {index:.0f}/100 ({band.value}). Biggest differences: "
            f"{', '.join(LABELS[d.dimension] for d in top)}. {bridge_name} scores well for both sides."
        )
    else:
        summary = "You and your family agree on a lot. " + (
            f"A few conversations, mainly about {LABELS[top[0].dimension]} and {LABELS[top[1].dimension]}, "
            "will help you plan together."
            if band is not ConflictBand.ALIGNED
            else "You are well aligned."
        )
    return ConflictReport(
        visibility="full" if full else "summary",
        index=index,
        band=band,
        dimensions=dims if full else [],
        top_drivers=drivers,
        bridge_careers=bridge_rows,
        summary=summary,
    )
