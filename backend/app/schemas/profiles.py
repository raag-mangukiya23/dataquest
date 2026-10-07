from datetime import datetime

from pydantic import Field

from app.schemas.common import Contract


class StudentProfileIn(Contract):
    grade: int = Field(ge=8, le=13, description="13 = gap year / repeater")
    board: str = Field(examples=["CBSE", "ICSE", "TN State Board", "IB"])
    stream: str | None = Field(default=None, examples=["PCM", "PCB", "PCMB", "Commerce", "Humanities"])
    pincode: str = Field(pattern=r"^\d{6}$")
    city: str
    state: str
    languages: list[str] = Field(default_factory=list, max_length=10)
    interests: list[str] = Field(default_factory=list, max_length=20)
    extracurriculars: list[str] = Field(default_factory=list, max_length=20)
    recent_score_pct: float | None = Field(default=None, ge=0, le=100, description="Latest exam aggregate %")
    preferred_regions: list[str] = Field(
        default_factory=list, description="Region codes the student would study/work in"
    )
    willing_to_relocate: float = Field(default=0.5, ge=0, le=1)
    willing_abroad: float = Field(default=0.2, ge=0, le=1)


class StudentProfileOut(StudentProfileIn):
    student_id: str
    user_id: str
    region_code: str | None = Field(default=None, description="Resolved from pincode")
    completeness: float = Field(ge=0, le=1)
    updated_at: datetime
