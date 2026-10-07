from datetime import datetime

from pydantic import Field

from app.schemas.common import Contract


class CountRow(Contract):
    key: str
    count: int


class AdminAnalytics(Contract):
    generated_at: datetime
    k_anonymity_threshold: int = Field(description="Groups smaller than this are suppressed")
    students_total: int
    families_linked: int
    runs_total: int
    median_run_ms: float
    top_recommended_careers: list[CountRow]
    affordability_class_distribution: list[CountRow]
    conflict_band_distribution: list[CountRow]
    riasec_code_distribution: list[CountRow]
    region_distribution: list[CountRow]
    suppressed_groups: int


class DataRefreshRequest(Contract):
    datasets: list[str] = Field(
        default_factory=lambda: ["careers", "market_signals", "salary_bands", "scholarships"],
        examples=[["market_signals"]],
    )
    source: str = Field(default="seed", pattern=r"^(seed|csv|adapter)$")
    dry_run: bool = False


class RefreshResult(Contract):
    job_id: str
    status: str = Field(examples=["completed", "failed", "dry_run"])
    source: str
    counts: dict[str, dict[str, int]] = Field(description="dataset -> {inserted, updated, skipped}")
    warnings: list[str]
    started_at: datetime
    finished_at: datetime
