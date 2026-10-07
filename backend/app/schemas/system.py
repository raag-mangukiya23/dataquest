from datetime import datetime

from pydantic import Field

from app.schemas.common import Contract


class ComponentHealth(Contract):
    status: str = Field(examples=["ok", "degraded", "down", "disabled"])
    detail: str | None = None


class Health(Contract):
    status: str
    version: str
    engine_version: str
    mock_mode: bool
    time: datetime
    components: dict[str, ComponentHealth]


class Formula(Contract):
    name: str
    expression: str
    explanation: str


class DataSourceInfo(Contract):
    dataset: str
    source_name: str
    source_url: str | None
    as_of: str
    rows: int
    share_estimated: float = Field(ge=0, le=1)


class Methodology(Contract):
    engine_version: str
    vector_spec_version: str
    dimensions: list[dict[str, str]]
    scoring_config_version: str
    weights: dict[str, float]
    parameters: dict[str, float | int | str]
    formulas: list[Formula]
    data_sources: list[DataSourceInfo]
    fairness_safeguards: list[str]
    privacy_rules: list[str]
    limitations: list[str]


class DatasetStatus(Contract):
    dataset: str
    label: str
    rows: int
    cadence_days: int = Field(description="How often the publisher updates this data")
    oldest_as_of: str | None
    newest_as_of: str | None
    freshness: str = Field(examples=["fresh", "aging", "stale"])
    next_refresh_due: str | None
    verified: int
    secondary: int
    unverified: int
    disputed: int
    checked_share: float = Field(ge=0, le=1)
    errors: int
    warnings: int
    sources: list[str]
    live_feed: bool = Field(description="true only when an API adapter for this dataset is configured")


class FeedStatus(Contract):
    key: str
    name: str
    access: str = Field(examples=["api", "download", "manual"])
    enabled: bool
    detail: str


class DataIssue(Contract):
    dataset: str
    key: str
    rule: str
    severity: str
    message: str


class DataStatus(Contract):
    generated_at: datetime
    today: str
    dataset_version: str
    computed_live: bool = Field(description="Recommendations are recomputed on every request")
    overall_checked_share: float = Field(ge=0, le=1)
    statement: str = Field(description="Plain-language summary safe to show judges and users")
    datasets: list[DatasetStatus]
    feeds: list[FeedStatus]
    issues: list[DataIssue]
