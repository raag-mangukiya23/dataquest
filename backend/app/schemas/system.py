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
