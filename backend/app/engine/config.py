"""Versioned scoring configuration. Every run records the version it used, so results are reproducible.

Values marked 'estimate' are planning assumptions, not measured facts; they are listed in /system/methodology.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

DEFAULT_WEIGHTS = {
    "fit": 0.30,
    "market": 0.15,
    "affordability": 0.20,
    "roi": 0.15,
    "family_alignment": 0.15,
    "disruption": 0.05,
}

# Careers entered through a highly selective exam AFTER the degree. Expected earnings are weighted by the chance
# of getting in; the rest earn graduate_fallback_salary. Estimates, shown in every affected explanation.
CAREER_ENTRY_GATES: dict[str, tuple[float, str]] = {
    "civil-servant": (
        0.02,
        "UPSC Civil Services selects about 1,000 of the 5-6 lakh candidates who sit it each year, so even "
        "after several attempts most aspirants are not selected",
    ),
    "chartered-accountant": (
        0.35,
        "ICAI Final pass rates are often 10-20 % per attempt, so many students take years or stop before "
        "qualifying",
    ),
    "actuary": (
        0.3,
        "Fully qualifying needs about 13 professional exams, which most students take years to clear",
    ),
}

CONFLICT_WEIGHTS = {
    "domain_preference": 0.30,
    "risk_appetite": 0.15,
    "geography": 0.15,
    "budget": 0.15,
    "time_to_earn": 0.10,
    "prestige_stability": 0.15,
}


@dataclass(frozen=True)
class ScoringConfig:
    version: str = "weights-2026.10-v3"
    weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    conflict_weights: dict[str, float] = field(default_factory=lambda: dict(CONFLICT_WEIGHTS))
    edu_inflation: float = 0.08  # estimate: yearly fee growth
    loan_rate: float = 0.10  # estimate: typical education-loan rate
    loan_tenor_months: int = 120
    moratorium_extra_years: int = 1  # course length + 1 year, as banks commonly allow
    discount_rate: float = 0.08
    roi_horizon_years: int = 10
    baseline_salary: int = 180_000  # estimate: yearly earnings if the student starts work after Class 12
    baseline_growth: float = 0.05
    savings_rate_after_job: float = 0.35
    base_affordable_share: float = 0.15  # estimate: share of income a family can put towards education
    loan_share_penalty: float = 0.25  # borrowing the whole cost scores 25 % lower than paying it outright
    comfortable_emi_share: float = 0.30  # estimate: EMIs above 30 % of monthly income strain a family
    graduate_fallback_salary: int = (
        300_000  # estimate: typical starting pay for a graduate who misses a gated career
    )
    ml_alpha: float = 0.5
    sensitivity_perturbation: float = 0.2
    sensitivity_scenarios: int = 64
    base_model_confidence: float = 0.85

    def with_weights(self, overrides: dict[str, float]) -> ScoringConfig:
        weights = dict(self.weights)
        weights.update({k: max(0.0, float(v)) for k, v in overrides.items() if k in weights})
        return ScoringConfig(**{**asdict(self), "weights": weights, "version": f"{self.version}+custom"})

    def as_parameters(self) -> dict[str, float | int | str]:
        d = asdict(self)
        d.pop("weights")
        d.pop("conflict_weights")
        return d


DEFAULT_CONFIG = ScoringConfig()
