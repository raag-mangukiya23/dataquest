"""Data quality gates: pure checks run on every dataset before it can become the active version.

Severity 'error' blocks the refresh (the previous dataset version stays active); 'warning' is reported
in /system/data-status and the audit script. The same checks run in CI over the seed data.
"""

from __future__ import annotations

import statistics
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date

from app.engine.freshness import freshness_status
from app.etl.sources import DATASETS
from app.schemas.catalog import (
    AmountType,
    Exam,
    LocalOpportunity,
    MarketSignal,
    Pathway,
    SalaryBand,
    Scholarship,
)
from app.schemas.common import Freshness, Provenance, VerificationStatus

ALLOWED_RULE_OPS = {"==", "!=", "<", "<=", ">", ">=", "in"}
ALLOWED_RULE_FIELDS = {
    "annual_income",
    "board_percentile",
    "entrance_percentile",
    "recent_score_pct",
    "course_area",
    "first_graduate",
    "admission_route",
    "state",
    "grade",
}
SALARY_RANGE = (100_000, 20_000_000)  # plausible annual CTC in INR
MAX_COST_PER_YEAR = 6_000_000


@dataclass(frozen=True)
class Issue:
    dataset: str
    key: str
    rule: str
    severity: str  # error | warning
    message: str


@dataclass
class DatasetStats:
    rows: int = 0
    verified: int = 0
    secondary: int = 0
    unverified: int = 0
    disputed: int = 0
    estimates: int = 0
    oldest: date | None = None
    newest: date | None = None
    freshness: Freshness = Freshness.FRESH

    @property
    def checked_share(self) -> float:
        return round((self.verified + self.secondary) / self.rows, 4) if self.rows else 0.0


@dataclass
class Catalog:
    market_signals: list[MarketSignal] = field(default_factory=list)
    salary_bands: list[tuple[str, SalaryBand]] = field(default_factory=list)  # (career slug, band)
    pathways: list[Pathway] = field(default_factory=list)
    exams: list[Exam] = field(default_factory=list)
    scholarships: list[Scholarship] = field(default_factory=list)
    local_opportunities: list[LocalOpportunity] = field(default_factory=list)


@dataclass
class AuditReport:
    issues: list[Issue]
    stats: dict[str, DatasetStats]

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "warning"]


def check_provenance(dataset: str, key: str, p: Provenance, today: date) -> list[Issue]:
    out = []
    if p.as_of > today:
        out.append(
            Issue(dataset, key, "as_of_in_future", "error", f"as_of {p.as_of} is after today ({today})")
        )
    if p.verified_on and p.verified_on > today:
        out.append(
            Issue(
                dataset, key, "verified_in_future", "error", f"verified_on {p.verified_on} is in the future"
            )
        )
    cadence = DATASETS[dataset].cadence_days
    if freshness_status(p.as_of, today, cadence) is Freshness.STALE:
        out.append(
            Issue(
                dataset,
                key,
                "stale",
                "warning",
                f"as_of {p.as_of} is more than two update cycles ({2 * cadence} days) old",
            )
        )
    return out


def check_salary(slug: str, b: SalaryBand) -> list[Issue]:
    key = f"{slug}@{b.region_code}"
    out = []
    if not b.entry_p50 <= b.mid_p50 <= b.senior_p50:
        out.append(Issue("salary_bands", key, "salary_order", "error", "entry <= mid <= senior is violated"))
    if b.p25_entry is not None and b.p75_entry is not None and not b.p25_entry <= b.entry_p50 <= b.p75_entry:
        out.append(Issue("salary_bands", key, "percentile_order", "error", "p25 <= p50 <= p75 is violated"))
    if not SALARY_RANGE[0] <= b.entry_p50 <= SALARY_RANGE[1]:
        out.append(
            Issue(
                "salary_bands",
                key,
                "salary_out_of_range",
                "warning",
                f"entry salary {b.entry_p50} is outside the plausible range {SALARY_RANGE}",
            )
        )
    return out


def check_pathway(p: Pathway, today: date) -> list[Issue]:
    out = []
    per_year = p.tuition_per_year + p.hostel_per_year + p.living_per_year + p.misc_per_year
    if per_year == 0:
        out.append(Issue("pathways", p.id, "zero_cost", "warning", "all cost components are zero"))
    if per_year > MAX_COST_PER_YEAR:
        out.append(
            Issue("pathways", p.id, "cost_out_of_range", "warning", f"annual cost {per_year} looks too high")
        )
    if p.fee_academic_year > today.year + 1:
        out.append(
            Issue(
                "pathways",
                p.id,
                "fee_year_in_future",
                "error",
                f"fee_academic_year {p.fee_academic_year} is in the future",
            )
        )
    if p.fee_academic_year < today.year - 2:
        out.append(
            Issue(
                "pathways",
                p.id,
                "old_fees",
                "warning",
                f"fees are from {p.fee_academic_year}; inflation is applied but the notice should be refreshed",
            )
        )
    return out


def check_exam(e: Exam, today: date) -> list[Issue]:
    out = []
    nums = [s.session_no for s in e.sessions]
    if len(nums) != len(set(nums)):
        out.append(Issue("exams", e.code, "duplicate_session", "error", "session numbers repeat"))
    for s in e.sessions:
        tag = f"{e.code}#{s.cycle_year}.{s.session_no}"
        if s.exam_start and s.exam_end and s.exam_start > s.exam_end:
            out.append(Issue("exams", tag, "exam_dates_reversed", "error", "exam_start is after exam_end"))
        if s.registration_close and s.exam_start and s.registration_close > s.exam_start:
            out.append(
                Issue("exams", tag, "registration_after_exam", "error", "registration closes after the exam")
            )
    if (
        e.sessions
        and e.next_window_start
        and e.next_window_start
        != min((s.exam_start for s in e.sessions if s.exam_start), default=e.next_window_start)
    ):
        out.append(
            Issue(
                "exams",
                e.code,
                "inconsistent_dates",
                "error",
                "next_window_start does not match the earliest session",
            )
        )
    ends = [s.exam_end or s.exam_start for s in e.sessions if s.exam_end or s.exam_start]
    if ends and max(ends) < today:
        out.append(Issue("exams", e.code, "cycle_over", "warning", "every listed session is in the past"))
    return out


def check_rules(rules: object) -> list[str]:
    if not isinstance(rules, dict) or not rules:
        return ["rules must be a non-empty object"]
    problems = []
    for combinator, clauses in rules.items():
        if combinator not in ("all", "any"):
            problems.append(f"unknown combinator '{combinator}'")
            continue
        if not isinstance(clauses, list) or not clauses:
            problems.append(f"'{combinator}' must be a non-empty list")
            continue
        for c in clauses:
            if not isinstance(c, dict) or set(c) != {"field", "op", "value"}:
                problems.append(f"clause {c!r} must have exactly field, op and value")
            elif c["field"] not in ALLOWED_RULE_FIELDS:
                problems.append(f"unknown field '{c['field']}'")
            elif c["op"] not in ALLOWED_RULE_OPS:
                problems.append(f"unknown operator '{c['op']}'")
            elif c["op"] == "in" and not isinstance(c["value"], list):
                problems.append(f"'in' needs a list value for '{c['field']}'")
    return problems


def check_scholarship(s: Scholarship, today: date) -> list[Issue]:
    out = [Issue("scholarships", s.id, "bad_rules", "error", msg) for msg in check_rules(s.eligibility_rules)]
    if s.amount_per_year <= 0:
        out.append(Issue("scholarships", s.id, "zero_amount", "error", "amount_per_year must be positive"))
    if s.year_amounts is not None and len(s.year_amounts) != s.max_years:
        out.append(
            Issue(
                "scholarships",
                s.id,
                "year_amounts_length",
                "error",
                f"year_amounts has {len(s.year_amounts)} entries but max_years is {s.max_years}",
            )
        )
    if s.amount_type is AmountType.PERCENT_TUITION and not s.percent_of_tuition:
        out.append(
            Issue(
                "scholarships", s.id, "missing_percent", "error", "percent_tuition needs percent_of_tuition"
            )
        )
    if s.deadline and s.deadline < today:
        out.append(
            Issue("scholarships", s.id, "deadline_passed", "warning", f"deadline {s.deadline} has passed")
        )
    return out


def check_market(signals: list[MarketSignal]) -> list[Issue]:
    out = []
    for s in signals:
        if abs(s.job_velocity) > 1.0:
            out.append(
                Issue(
                    "market_signals",
                    f"{s.career.slug}@{s.region_code}",
                    "velocity_outlier",
                    "warning",
                    f"job_velocity {s.job_velocity:+.0%} is implausibly large",
                )
            )
    by_region: dict[str, list[MarketSignal]] = {}
    for s in signals:
        by_region.setdefault(s.region_code, []).append(s)
    for region, rows in by_region.items():
        if len(rows) < 5:
            continue
        vals = [r.demand_index for r in rows]
        med = statistics.median(vals)
        mad = statistics.median(abs(v - med) for v in vals) or 1e-9
        for r in rows:
            z = 0.6745 * (r.demand_index - med) / mad
            if abs(z) > 3.5:
                out.append(
                    Issue(
                        "market_signals",
                        f"{r.career.slug}@{region}",
                        "demand_outlier",
                        "warning",
                        f"demand_index {r.demand_index} is a robust outlier (z={z:.1f})",
                    )
                )
    return out


def _duplicates(dataset: str, keys: Iterable[str]) -> list[Issue]:
    return [
        Issue(dataset, k, "duplicate_key", "error", f"{n} rows share this key")
        for k, n in Counter(keys).items()
        if n > 1
    ]


def _stats(dataset: str, provs: list[Provenance], today: date) -> DatasetStats:
    st = DatasetStats(rows=len(provs))
    for p in provs:
        st.estimates += p.is_estimate
        if p.verification is VerificationStatus.VERIFIED:
            st.verified += 1
        elif p.verification is VerificationStatus.SECONDARY:
            st.secondary += 1
        elif p.verification is VerificationStatus.DISPUTED:
            st.disputed += 1
        else:
            st.unverified += 1
    if provs:
        st.oldest = min(p.as_of for p in provs)
        st.newest = max(p.as_of for p in provs)
        st.freshness = freshness_status(st.newest, today, DATASETS[dataset].cadence_days)
    return st


def audit(cat: Catalog, today: date) -> AuditReport:
    issues: list[Issue] = []
    provs: dict[str, list[tuple[str, Provenance]]] = {
        "market_signals": [(f"{s.career.slug}@{s.region_code}", s.provenance) for s in cat.market_signals],
        "salary_bands": [(f"{slug}@{b.region_code}", b.provenance) for slug, b in cat.salary_bands],
        "pathways": [(p.id, p.provenance) for p in cat.pathways],
        "exams": [(e.code, e.provenance) for e in cat.exams],
        "scholarships": [(s.id, s.provenance) for s in cat.scholarships],
        "local_opportunities": [(o.id, o.provenance) for o in cat.local_opportunities],
    }
    for dataset, rows in provs.items():
        issues += _duplicates(dataset, [k for k, _ in rows])
        for key, p in rows:
            issues += check_provenance(dataset, key, p, today)
    for slug, b in cat.salary_bands:
        issues += check_salary(slug, b)
    for p in cat.pathways:
        issues += check_pathway(p, today)
    for e in cat.exams:
        issues += check_exam(e, today)
    for s in cat.scholarships:
        issues += check_scholarship(s, today)
    issues += check_market(cat.market_signals)
    stats = {d: _stats(d, [p for _, p in rows], today) for d, rows in provs.items()}
    return AuditReport(issues=issues, stats=stats)
