"""Demo-day contracts: persona switcher, one-click reset and a scripted walkthrough."""

from typing import Any

from pydantic import Field

from app.schemas.common import Contract


class DemoPersona(Contract):
    key: str = Field(examples=["creative_risk_averse"])
    student_name: str
    parent_name: str
    location: str
    scenario: str = Field(description="One line the presenter can read out")
    highlights: list[str] = Field(description="What this persona proves about the engine")
    student_email: str
    parent_email: str
    demo_password: str = Field(description="Shared demo password; only served when DEMO_MODE=true")
    student_id: str
    baseline_run_id: str | None
    fixture_available: bool = Field(description="false = data arrives with the seeded database (Phase 1+)")


class DemoResetResult(Contract):
    status: str = Field(examples=["reset", "noop_mock_mode"])
    personas: int
    runs_precomputed: int
    demo_today: str | None
    took_ms: float


class DemoCall(Contract):
    method: str
    path: str
    headers: dict[str, str] = Field(default_factory=dict)
    body: dict[str, Any] | None = None


class DemoStep(Contract):
    step: int
    title: str
    say: str = Field(description="Presenter line, about 15 seconds")
    call: DemoCall
    show: list[str] = Field(description="JSON paths in the response worth pointing at")
    seconds: int


class DemoWalkthrough(Contract):
    persona_key: str
    total_seconds: int
    steps: list[DemoStep]
