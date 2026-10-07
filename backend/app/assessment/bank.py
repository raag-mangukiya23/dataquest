"""The psychometric item bank: loading, validation and the public (answer-free) view.

Items live in backend/data/instruments/*.json so psychologists, teachers and translators can review
them without reading code. Loading validates the whole bank; a malformed bank fails at start-up
rather than producing silently wrong scores.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from enum import StrEnum
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.dimensions import DIMENSIONS

BANK_DIR = Path(__file__).resolve().parents[2] / "data" / "instruments"

MIN_ITEMS_PER_DIMENSION = 3


class Scale(StrEnum):
    INTEREST5 = "interest5"
    AGREE5 = "agree5"
    MCQ = "mcq"


SCALE_LABELS: dict[Scale, list[str]] = {
    Scale.INTEREST5: ["Not at all", "A little", "Somewhat", "Quite a lot", "Very much"],
    Scale.AGREE5: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
}

DIFFICULTY_WEIGHT = {"easy": 1.0, "medium": 1.5, "hard": 2.0}


def public_id(item_id: str) -> str:
    """Opaque, stable id shown to clients; the readable bank id would reveal the trait being measured."""
    return "q_" + hashlib.sha256(item_id.encode()).hexdigest()[:12]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class OptionSpec(_Strict):
    key: str
    label: str


class ItemSpec(_Strict):
    id: str = Field(pattern=r"^[a-z]+\.[a-z_]+\.\d+$")
    dimension: str
    prompt: str = Field(min_length=8, max_length=400)
    reverse: bool = False
    options: list[OptionSpec] | None = None
    answer: str | None = None
    difficulty: str | None = None

    @property
    def is_mcq(self) -> bool:
        return self.options is not None

    @model_validator(mode="after")
    def _check(self) -> ItemSpec:
        if self.dimension not in DIMENSIONS:
            raise ValueError(f"{self.id}: unknown dimension {self.dimension}")
        if self.options is not None:
            keys = [o.key for o in self.options]
            if len(keys) != 4 or len(set(keys)) != 4:
                raise ValueError(f"{self.id}: MCQ items need exactly 4 distinct options")
            if self.answer not in keys:
                raise ValueError(f"{self.id}: answer key must be one of the options")
            if self.difficulty not in DIFFICULTY_WEIGHT:
                raise ValueError(f"{self.id}: difficulty must be easy, medium or hard")
            if self.reverse:
                raise ValueError(f"{self.id}: MCQ items cannot be reverse-scored")
        elif self.answer is not None or self.difficulty is not None:
            raise ValueError(f"{self.id}: only MCQ items have an answer or difficulty")
        return self


class InstrumentSpec(_Strict):
    code: str = Field(pattern=r"^[a-z]+_v\d+$")
    version: str
    name: str
    description: str
    framework: str
    scale: Scale
    time_limit_sec: int | None = None
    est_minutes: int = Field(ge=1, le=60)
    items: list[ItemSpec]

    @property
    def dimensions(self) -> list[str]:
        return list(dict.fromkeys(i.dimension for i in self.items))

    @model_validator(mode="after")
    def _check(self) -> InstrumentSpec:
        ids = [i.id for i in self.items]
        dupes = [k for k, n in Counter(ids).items() if n > 1]
        if dupes:
            raise ValueError(f"{self.code}: duplicate item ids {dupes}")
        mcq = self.scale is Scale.MCQ
        if any(i.is_mcq != mcq for i in self.items):
            raise ValueError(f"{self.code}: every item must match the instrument scale {self.scale}")
        per_dim = Counter(i.dimension for i in self.items)
        thin = [d for d, n in per_dim.items() if n < MIN_ITEMS_PER_DIMENSION]
        if thin:
            raise ValueError(
                f"{self.code}: dimensions with fewer than {MIN_ITEMS_PER_DIMENSION} items: {thin}"
            )
        if not mcq:
            for d in per_dim:
                if all(i.reverse for i in self.items if i.dimension == d):
                    raise ValueError(f"{self.code}: dimension {d} has only reverse-scored items")
        return self

    def option_labels(self) -> list[OptionSpec]:
        labels = SCALE_LABELS[self.scale]
        return [OptionSpec(key=str(n), label=label) for n, label in enumerate(labels, 1)]


class ItemBank:
    def __init__(self, instruments: list[InstrumentSpec]) -> None:
        self.instruments = {i.code: i for i in instruments}
        self.items = {item.id: (inst, item) for inst in instruments for item in inst.items}
        self.by_public_id = {public_id(item.id): (inst, item) for inst in instruments for item in inst.items}
        if len(self.by_public_id) != len(self.items):
            raise ValueError("public id collision in item bank")
        covered = {d for inst in instruments for d in inst.dimensions}
        missing = set(DIMENSIONS) - covered
        if missing:
            raise ValueError(f"item bank does not cover dimensions: {sorted(missing)}")
        overlap = [d for d, n in Counter(d for inst in instruments for d in inst.dimensions).items() if n > 1]
        if overlap:
            raise ValueError(f"dimensions measured by more than one instrument: {overlap}")

    def instrument(self, code: str) -> InstrumentSpec | None:
        return self.instruments.get(code)

    @property
    def total_items(self) -> int:
        return len(self.items)


def load_bank(directory: Path = BANK_DIR) -> ItemBank:
    files = sorted(directory.glob("*.json"))
    if not files:
        raise FileNotFoundError(f"no instrument files in {directory}")
    instruments = [InstrumentSpec.model_validate(json.loads(f.read_text(encoding="utf-8"))) for f in files]
    return ItemBank(instruments)


@lru_cache
def get_bank() -> ItemBank:
    return load_bank()
