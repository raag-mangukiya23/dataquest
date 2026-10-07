"""Financial constraint solver: what a pathway costs, what the family can fund, and whether it is affordable.

  start year     the academic year the course would begin (from the student's grade and today's date)
  total_cost     sum over course years t of (tuition + hostel + living + misc) * (1 + i)^(start - fee_year + t - 1)
  share          affordable share of income = base - 0.03 per extra dependent - half the existing-EMI burden,
                 clipped to [0.03, 0.30]
  family_funds   F = savings + sum_t income * (1 + g)^(t - 1) * share
  loan_capacity  L = PV(max EMI, rate, tenor) / (1 + r_m * moratorium years)    interest accrues while studying
                 at r_m: 0 under CSIS (family income <= Rs 4.5 L, on up to Rs 7.5 L), rate - 3 % under
                 PM-Vidyalaxmi (income <= Rs 8 L, top-tier institutions), otherwise the full rate
  scholarships   S = best expected value over subsets of eligible awards, respecting non-stackable awards and
                 exclusive groups, capped at the course cost (exact search)
  affordability  min(1, (F + S + loan_tolerance * L) / total_cost)
  class          comfortable if F + S >= 1.1 * cost; stretch if >= cost; loan-dependent if F + S + L >= cost;
                 otherwise infeasible
  admission      readiness = 0.5 * mean aptitude + 0.5 * latest exam % (aptitude alone if unknown);
                 chance = clip(1 - 4 * max(0, selectivity - readiness), 0.05, 1)  (estimate)
  reachability   affordability * (0.5 + 0.5 * chance); this is what the final score uses
  ROI            NPV of (career salary path - baseline path) over course + 10 years, divided by cost;
                 roi_norm = r / (r + 1.5) for r > 0
  payback        years after graduation until savings from salary cover cost plus loan interest
Property (tested): more money never lowers affordability or worsens the class.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from itertools import combinations

from app.engine.config import ScoringConfig
from app.engine.types import FamilyInput, StudentInput
from app.schemas.analysis import FinancialAssessment, RoiDetail, ScholarshipPick
from app.schemas.catalog import AmountType, Pathway, SalaryBand, Scholarship
from app.schemas.common import AffordabilityClass

TIER_SALARY_FACTOR = {1: 1.25, 2: 1.0, 3: 0.85, 4: 0.75}
LEVEL_SALARY_FACTOR = {"Diploma": 0.65, "UG": 1.0, "Professional": 1.0, "Integrated": 1.1, "PG": 1.15}
MAX_PLAN_CANDIDATES = 14


def course_start_year(grade: int, today: date) -> int:
    years_left = max(0, 12 - min(grade, 12))
    return today.year + years_left + (1 if today.month >= 7 else 0)


def years_until_course(grade: int, today: date) -> int:
    return max(0, course_start_year(grade, today) - today.year)


def per_year_cost(p: Pathway) -> int:
    return p.tuition_per_year + p.hostel_per_year + p.living_per_year + p.misc_per_year


def total_cost(p: Pathway, start_year: int, inflation: float) -> int:
    base_shift = max(0, start_year - p.fee_academic_year)
    return int(sum(per_year_cost(p) * (1 + inflation) ** (base_shift + t) for t in range(p.duration_years)))


def affordable_share(f: FamilyInput, cfg: ScoringConfig) -> float:
    if f.annual_income <= 0:
        return 0.03
    debt_burden = f.existing_emi * 12 / f.annual_income
    share = cfg.base_affordable_share - 0.03 * max(0, f.dependents - 1) - 0.5 * debt_burden
    return max(0.03, min(0.30, share))


def family_funds(f: FamilyInput, years: int, cfg: ScoringConfig) -> int:
    share = affordable_share(f, cfg)
    return int(f.savings + sum(f.annual_income * (1 + f.income_growth) ** t * share for t in range(years)))


def annuity_pv(payment: float, annual_rate: float, months: int) -> float:
    r = annual_rate / 12
    return payment * months if r == 0 else payment * (1 - (1 + r) ** -months) / r


CSIS_INCOME_LIMIT = 450_000
CSIS_LOAN_CAP = 750_000
VIDYALAXMI_INCOME_LIMIT = 800_000
VIDYALAXMI_SUBVENTION = 0.03


def interest_scheme(f: FamilyInput, tier: int) -> tuple[float | None, str | None]:
    """Moratorium interest relief from government schemes, as (rate override, scheme note)."""
    if f.annual_income <= CSIS_INCOME_LIMIT:
        return 0.0, "CSIS: no interest while studying on up to Rs 7.5 lakh (income below Rs 4.5 lakh)"
    if f.annual_income <= VIDYALAXMI_INCOME_LIMIT and tier == 1:
        return (
            None,
            "PM-Vidyalaxmi: 3 % interest subsidy while studying (income up to Rs 8 lakh, top institutions)",
        )
    return None, None


def _moratorium_rate(f: FamilyInput, tier: int, cfg: ScoringConfig) -> float:
    override, note = interest_scheme(f, tier)
    if override is not None:
        return override
    if note:
        return max(0.0, cfg.loan_rate - VIDYALAXMI_SUBVENTION)
    return cfg.loan_rate


def loan_capacity(f: FamilyInput, course_years: int, cfg: ScoringConfig, tier: int = 2) -> int:
    moratorium = course_years + cfg.moratorium_extra_years
    pv = annuity_pv(f.max_emi, cfg.loan_rate, cfg.loan_tenor_months)
    rate = _moratorium_rate(f, tier, cfg)
    if rate == 0.0 and f.annual_income <= CSIS_INCOME_LIMIT:
        covered = min(pv, CSIS_LOAN_CAP)
        return int(covered + max(0.0, pv - covered) / (1 + cfg.loan_rate * moratorium))
    return int(pv / (1 + rate * moratorium))


def emi(principal: int, course_years: int, cfg: ScoringConfig, moratorium_rate: float | None = None) -> int:
    if principal <= 0:
        return 0
    rate = cfg.loan_rate if moratorium_rate is None else moratorium_rate
    owed = principal * (1 + rate * (course_years + cfg.moratorium_extra_years))
    r = cfg.loan_rate / 12
    n = cfg.loan_tenor_months
    return int(round(owed * r * (1 + r) ** n / ((1 + r) ** n - 1)))


def scholarship_total(s: Scholarship, p: Pathway) -> int:
    years = min(s.max_years, p.duration_years)
    if s.year_amounts:
        return sum(s.year_amounts[:years])
    award = s.amount_per_year
    if s.amount_type is AmountType.PERCENT_TUITION and s.percent_of_tuition:
        award = min(award, int(p.tuition_per_year * s.percent_of_tuition))
    elif s.amount_type is AmountType.FULL_TUITION:
        award = min(award, p.tuition_per_year)
    return award * years


@dataclass(frozen=True)
class PlanItem:
    scholarship: Scholarship
    amount_total: int

    @property
    def expected(self) -> float:
        return self.amount_total * self.scholarship.probability


def _valid(combo: Sequence[PlanItem]) -> bool:
    if len(combo) > 1 and any(not c.scholarship.stackable for c in combo):
        return False
    groups = [c.scholarship.exclusive_group for c in combo if c.scholarship.exclusive_group]
    return len(groups) == len(set(groups))


def best_plan(items: Sequence[PlanItem], cap: int) -> list[PlanItem]:
    """Exact search over subsets of the most valuable candidates; deterministic tie-breaks."""
    pool = sorted(items, key=lambda i: (-i.expected, i.scholarship.id))[:MAX_PLAN_CANDIDATES]
    best: tuple[float, int, list[PlanItem]] = (0.0, 0, [])
    for k in range(1, len(pool) + 1):
        for combo in combinations(pool, k):
            if not _valid(combo):
                continue
            value = min(cap, sum(c.expected for c in combo))
            if value > best[0] + 1e-9 or (abs(value - best[0]) <= 1e-9 and best[2] and k < best[1]):
                best = (value, k, list(combo))
    return best[2]


def _classify(own: int, capacity: int, cost: int) -> AffordabilityClass:
    if own >= 1.1 * cost:
        return AffordabilityClass.COMFORTABLE
    if own >= cost:
        return AffordabilityClass.STRETCH
    if own + capacity >= cost:
        return AffordabilityClass.LOAN_DEPENDENT
    return AffordabilityClass.INFEASIBLE


def entry_salary(bands: Sequence[SalaryBand], regions: Sequence[str], tier: int, level: str = "UG") -> int:
    """Best entry salary among the regions the student would work in (people move for jobs), adjusted for
    institution tier and qualification level (a diploma starts lower than a degree)."""
    usable = [b for b in bands if b.region_code in regions] or list(bands)
    base = max((b.entry_p50 for b in usable), default=300_000)
    return int(base * TIER_SALARY_FACTOR.get(tier, 1.0) * LEVEL_SALARY_FACTOR.get(level, 1.0))


def readiness(student: StudentInput) -> float:
    apt = (
        sum(student.vector.get(d, 0.5) for d in ("apt_numerical", "apt_verbal", "apt_logical", "apt_spatial"))
        / 4
    )
    if student.recent_score_pct is None:
        return apt
    return 0.5 * apt + 0.5 * student.recent_score_pct / 100


def admission_chance(selectivity: float, student: StudentInput) -> float:
    return round(max(0.05, min(1.0, 1 - 4 * max(0.0, selectivity - readiness(student)))), 4)


def roi(
    cost: int,
    course_years: int,
    wait_years: int,
    entry: int,
    growth: float,
    loan_interest: int,
    cfg: ScoringConfig,
) -> RoiDetail:
    horizon = wait_years + course_years + cfg.roi_horizon_years
    npv = 0.0
    for t in range(1, horizon + 1):
        years_working = t - wait_years - course_years
        career = entry * (1 + growth) ** (years_working - 1) if years_working >= 1 else 0.0
        baseline = (
            cfg.baseline_salary * (1 + cfg.baseline_growth) ** (t - 1 - wait_years) if t > wait_years else 0.0
        )
        npv += (career - baseline) / (1 + cfg.discount_rate) ** t
    ratio = npv / cost if cost else 0.0
    payback = None
    remaining = cost + loan_interest
    for k in range(1, cfg.roi_horizon_years + 6):
        remaining -= entry * (1 + growth) ** (k - 1) * cfg.savings_rate_after_job
        if remaining <= 0:
            payback = float(k)
            break
    return RoiDetail(
        npv_earnings_premium=int(npv),
        roi_ratio=round(ratio, 3),
        roi_norm=round(ratio / (ratio + 1.5), 4) if ratio > 0 else 0.0,
        payback_years=payback,
        starting_salary=entry,
        salary_year10=int(entry * (1 + growth) ** 9),
    )


def assess(
    p: Pathway,
    family: FamilyInput,
    student: StudentInput,
    eligible: Sequence[Scholarship],
    bands: Sequence[SalaryBand],
    cfg: ScoringConfig,
    today: date,
) -> FinancialAssessment:
    start = course_start_year(student.grade, today)
    wait = years_until_course(student.grade, today)
    cost = total_cost(p, start, cfg.edu_inflation)
    funds = family_funds(family, p.duration_years, cfg)
    plan = best_plan([PlanItem(s, scholarship_total(s, p)) for s in eligible], cap=cost)
    expected = int(min(cost, sum(i.expected for i in plan)))
    capacity = loan_capacity(family, p.duration_years, cfg, p.institution.tier)
    own = funds + expected
    need = max(0, cost - own)
    loan = min(need, capacity)
    gap = max(0, need - capacity)
    monthly = emi(loan, p.duration_years, cfg, _moratorium_rate(family, p.institution.tier, cfg))
    interest = max(0, monthly * cfg.loan_tenor_months - loan)
    affordability = round(min(1.0, (own + family.loan_tolerance * capacity) / cost), 4) if cost else 1.0
    monthly_income = family.annual_income / 12 if family.annual_income else 0
    regions = [r for r in (student.region_code, *student.preferred_regions, *family.preferred_regions) if r]
    growth = bands[0].growth_rate if bands else 0.07
    chance = admission_chance(p.selectivity, student)
    return FinancialAssessment(
        pathway_id=p.id,
        pathway_name=p.course,
        institution_name=p.institution.name,
        institution_tier=p.institution.tier,
        quota=p.quota.value,
        duration_years=p.duration_years,
        total_cost=cost,
        family_funds=funds,
        scholarship_plan=[
            ScholarshipPick(
                scholarship_id=i.scholarship.id,
                name=i.scholarship.name,
                amount_total=i.amount_total,
                probability=i.scholarship.probability,
                expected_value=int(i.expected),
                deadline=i.scholarship.deadline.isoformat() if i.scholarship.deadline else None,
            )
            for i in plan
        ],
        scholarship_expected=expected,
        loan_capacity=capacity,
        loan_required=loan,
        monthly_emi=monthly,
        burden_ratio=round((monthly + family.existing_emi) / monthly_income, 3) if monthly_income else 0.0,
        funding_gap=gap,
        affordability=affordability,
        affordability_class=_classify(own, capacity, cost),
        admission_chance=chance,
        reachability=round(affordability * (0.5 + 0.5 * chance), 4),
        loan_scheme=interest_scheme(family, p.institution.tier)[1],
        roi=roi(
            cost,
            p.duration_years,
            wait,
            entry_salary(bands, regions, p.institution.tier),
            growth,
            interest,
            cfg,
        ),
    )
