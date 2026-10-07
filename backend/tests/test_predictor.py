from pathlib import Path

import pytest

from app.core.config import get_settings
from app.core.dimensions import DIMENSIONS, DOMAINS
from app.ml import predictor
from app.mocks import world as w


def test_fallback_is_deterministic_and_complete():
    a = predictor.predict_domain_fit(w.STUDENT_VECTOR)
    b = predictor.predict_domain_fit(w.STUDENT_VECTOR)
    assert a == b
    assert a["source"] == "fallback"
    assert set(a["scores"]) == set(DOMAINS)
    assert all(0 <= v <= 1 for v in a["scores"].values())
    assert 0.5 <= a["confidence"] <= 0.85


def test_fallback_ranks_obvious_profiles():
    designer = {d: 0.5 for d in DIMENSIONS} | {
        "riasec_a": 1.0,
        "cog_creative": 1.0,
        "apt_spatial": 0.9,
        "riasec_c": 0.1,
        "val_autonomy": 0.9,
    }
    scores = predictor.fallback_predict(designer)["scores"]
    assert max(scores, key=scores.get) == "design_arts"


def test_neutral_vector_is_neutral():
    scores = predictor.fallback_predict({})["scores"]
    assert set(scores.values()) == {0.5}


def test_centered_cosine_bounds():
    assert predictor.centered_cosine([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert predictor.centered_cosine([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


@pytest.mark.parametrize("shape", ["scores", "domain_scores", "flat"])
def test_external_model_shapes(tmp_path: Path, monkeypatch, shape):
    body = {"computing_ai": 0.9, "engineering": 1.7}
    ret = (
        {"scores": body}
        if shape == "scores"
        else {"domain_scores": body}
        if shape == "domain_scores"
        else body
    )
    ret = {**ret, "confidence": 0.8, "model_version": "p3-v1"}
    model = tmp_path / "model.py"
    model.write_text(
        f"def predict(vector):\n    assert len(vector) == {len(DIMENSIONS)}\n    return {ret!r}\n"
    )
    monkeypatch.setenv("ML_MODEL_PATH", str(model))
    get_settings.cache_clear()
    predictor._load_model.cache_clear()
    try:
        out = predictor.predict_domain_fit(w.STUDENT_VECTOR)
        assert out["source"] == "ml" and out["model_version"] == "p3-v1"
        assert out["scores"]["computing_ai"] == 0.9
        assert out["scores"]["engineering"] == 1.0  # clipped
        assert set(out["scores"]) == set(DOMAINS)  # gaps filled from fallback
        assert predictor.model_available()
    finally:
        monkeypatch.delenv("ML_MODEL_PATH")
        get_settings.cache_clear()
        predictor._load_model.cache_clear()


def test_broken_model_degrades_to_fallback(tmp_path: Path, monkeypatch):
    model = tmp_path / "model.py"
    model.write_text("def predict(vector):\n    raise RuntimeError('boom')\n")
    monkeypatch.setenv("ML_MODEL_PATH", str(model))
    get_settings.cache_clear()
    predictor._load_model.cache_clear()
    try:
        assert predictor.predict_domain_fit(w.STUDENT_VECTOR)["source"] == "fallback"
    finally:
        monkeypatch.delenv("ML_MODEL_PATH")
        get_settings.cache_clear()
        predictor._load_model.cache_clear()
