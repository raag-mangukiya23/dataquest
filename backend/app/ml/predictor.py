"""Plug-in point for Person 3's ML model, with a deterministic cosine-similarity fallback.

Contract
--------
    predict_domain_fit(student_vector: Mapping[str, float]) -> dict
        {"scores": {domain: float in [0,1], ... all 12 domains},
         "confidence": float in [0,1],
         "source": "ml" | "fallback",
         "model_version": str}

Plugging in the real model
--------------------------
Set ML_MODEL_PATH to a .py file that defines ``predict(vector: dict[str, float]) -> dict``.
The vector uses the canonical 19 dimensions (app/core/dimensions.py), each in [0, 1].
Any of these return shapes is accepted:
    {"scores": {"computing_ai": 0.82, ...}, "confidence": 0.71}
    {"domain_scores": {...}, "confidence": 0.71}
    {"computing_ai": 0.82, "engineering": 0.64, ..., "confidence": 0.71}
Unknown keys are ignored, scores are clipped to [0, 1], missing domains are filled from the
fallback, and any exception degrades to the fallback (logged), so the API never fails because
of the model. The engine blends: fit = alpha * ml + (1 - alpha) * classic (alpha in config).
"""

from __future__ import annotations

import importlib.util
import logging
import math
from collections.abc import Callable, Mapping
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.dimensions import DIMENSIONS, DOMAINS
from app.ml.prototypes import DOMAIN_PROTOTYPES

log = logging.getLogger("prism.ml")

FALLBACK_VERSION = "cosine-fallback/1"


def _clip01(x: float) -> float:
    if math.isnan(x):
        return 0.0
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def to_array(student_vector: Mapping[str, float]) -> list[float]:
    """Order a vector by DIMENSIONS; missing dimensions default to the neutral 0.5."""
    return [_clip01(float(student_vector.get(d, 0.5))) for d in DIMENSIONS]


def centered_cosine(a: list[float] | tuple[float, ...], b: list[float] | tuple[float, ...]) -> float:
    """Cosine similarity after centring both vectors on the neutral point 0.5, mapped to [0, 1].

    Raw cosine of all-positive vectors clusters near 1 and barely discriminates; centring makes
    'above/below neutral' the signal. A zero vector (fully neutral) returns 0.5.
    """
    ca = [x - 0.5 for x in a]
    cb = [x - 0.5 for x in b]
    na = math.sqrt(sum(x * x for x in ca))
    nb = math.sqrt(sum(x * x for x in cb))
    if na == 0 or nb == 0:
        return 0.5
    cos = sum(x * y for x, y in zip(ca, cb, strict=True)) / (na * nb)
    return _clip01((cos + 1) / 2)


def fallback_predict(student_vector: Mapping[str, float]) -> dict[str, Any]:
    s = to_array(student_vector)
    scores = {d: round(centered_cosine(s, DOMAIN_PROTOTYPES[d]), 4) for d in DOMAINS}
    ranked = sorted(scores.values(), reverse=True)
    margin = ranked[0] - ranked[1]
    # Confidence grows with the separation between the best and second-best domain.
    confidence = round(min(0.85, max(0.5, 0.5 + 2 * margin)), 4)
    return {
        "scores": scores,
        "confidence": confidence,
        "source": "fallback",
        "model_version": FALLBACK_VERSION,
    }


def normalise_model_output(raw: Mapping[str, Any], fallback: Mapping[str, Any]) -> dict[str, Any]:
    if "scores" in raw and isinstance(raw["scores"], Mapping):
        scores_in = raw["scores"]
    elif "domain_scores" in raw and isinstance(raw["domain_scores"], Mapping):
        scores_in = raw["domain_scores"]
    else:
        scores_in = {k: v for k, v in raw.items() if k in DOMAINS}
    scores: dict[str, float] = {}
    for d in DOMAINS:
        v = scores_in.get(d)
        scores[d] = round(_clip01(float(v)), 4) if isinstance(v, int | float) else fallback["scores"][d]
    conf = raw.get("confidence", 0.5)
    confidence = round(_clip01(float(conf)), 4) if isinstance(conf, int | float) else 0.5
    return {
        "scores": scores,
        "confidence": confidence,
        "source": "ml",
        "model_version": str(raw.get("model_version", "external")),
    }


@lru_cache
def _load_model(path: str | None) -> Callable[[dict[str, float]], Mapping[str, Any]] | None:
    if not path:
        return None
    p = Path(path)
    if not p.is_file() or p.suffix != ".py":
        log.warning("ML_MODEL_PATH is not a .py file; using fallback", extra={"extra_fields": {"path": path}})
        return None
    try:
        spec = importlib.util.spec_from_file_location("prism_external_model", p)
        if spec is None or spec.loader is None:
            return None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        fn = getattr(module, "predict", None)
        return fn if callable(fn) else None
    except Exception:  # noqa: BLE001 - any model import failure must degrade, not crash
        log.exception("failed to load ML model; using fallback")
        return None


def model_available() -> bool:
    return _load_model(get_settings().ml_model_path) is not None


def predict_domain_fit(student_vector: Mapping[str, float]) -> dict[str, Any]:
    fb = fallback_predict(student_vector)
    model = _load_model(get_settings().ml_model_path)
    if model is None:
        return fb
    try:
        vec = dict(zip(DIMENSIONS, to_array(student_vector), strict=True))
        raw = model(vec)
        if not isinstance(raw, Mapping):
            raise TypeError(f"model returned {type(raw).__name__}, expected a mapping")
        return normalise_model_output(raw, fb)
    except Exception:  # noqa: BLE001
        log.exception("ML model prediction failed; using fallback")
        return fb
