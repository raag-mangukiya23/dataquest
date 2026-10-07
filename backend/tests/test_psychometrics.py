"""Scoring engine: exact cases plus property-based tests (hypothesis)."""

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.engine import psychometrics as pm

likert_value = st.one_of(st.none(), st.integers(min_value=1, max_value=5))
likert_answers = st.lists(
    st.builds(pm.LikertAnswer, value=likert_value, reverse=st.booleans()), min_size=3, max_size=8
)
mcq_answers = st.lists(
    st.builds(
        pm.McqAnswer, correct=st.one_of(st.none(), st.booleans()), weight=st.sampled_from([1.0, 1.5, 2.0])
    ),
    min_size=1,
    max_size=6,
)


def test_reverse_keying():
    assert [pm.keyed(v, True) for v in range(1, 6)] == [5, 4, 3, 2, 1]
    assert [pm.keyed(v, False) for v in range(1, 6)] == [1, 2, 3, 4, 5]
    with pytest.raises(ValueError):
        pm.keyed(6, False)


def test_likert_extremes_and_acquiescence():
    top = pm.score_likert("grit", [pm.LikertAnswer(5), pm.LikertAnswer(5), pm.LikertAnswer(1, reverse=True)])
    assert top.normalized == 1.0 and top.reliability == 1.0
    # Agreeing with everything, including reverse-worded items, lands near the middle instead of the top.
    yes_to_all = pm.score_likert(
        "grit", [pm.LikertAnswer(5), pm.LikertAnswer(5), pm.LikertAnswer(5, reverse=True)]
    )
    assert yes_to_all.normalized == pytest.approx(0.6667, abs=1e-4)


def test_too_few_answers_is_imputed_not_invented():
    r = pm.score_likert("val_financial", [pm.LikertAnswer(5), pm.LikertAnswer(None), pm.LikertAnswer(None)])
    assert r.imputed and r.normalized == pm.NEUTRAL and r.reliability == 0.0


def test_aptitude_chance_correction():
    all_right = pm.score_mcq("apt_logical", [pm.McqAnswer(True, w) for w in (1, 1.5, 1.5, 2)])
    assert all_right.normalized == 1.0
    guessing = pm.score_mcq("apt_logical", [pm.McqAnswer(c, 1.0) for c in (True, False, False, False)])
    assert guessing.normalized == 0.0  # 25 % right is exactly chance on four options
    skipped = pm.score_mcq("apt_logical", [pm.McqAnswer(None)] * 4)
    assert skipped.imputed and skipped.normalized == pm.NEUTRAL


@given(likert_answers)
def test_likert_scores_stay_in_range(answers):
    r = pm.score_likert("x", answers)
    assert 0.0 <= r.normalized <= 1.0
    assert 0.0 <= r.reliability <= 1.0
    assert r.answered == sum(a.value is not None for a in answers)


@given(likert_answers, st.data())
def test_raising_a_forward_answer_never_lowers_the_score(answers, data):
    idx = data.draw(st.integers(min_value=0, max_value=len(answers) - 1))
    a = answers[idx]
    if a.value is None or a.value == 5 or a.reverse:
        return
    bumped = list(answers)
    bumped[idx] = pm.LikertAnswer(a.value + 1, reverse=False)
    before, after = pm.score_likert("x", answers), pm.score_likert("x", bumped)
    if not before.imputed:
        assert after.normalized >= before.normalized


@given(mcq_answers, st.data())
def test_getting_one_more_right_never_lowers_aptitude(answers, data):
    wrong = [i for i, a in enumerate(answers) if a.correct is False]
    if not wrong:
        return
    i = data.draw(st.sampled_from(wrong))
    fixed = list(answers)
    fixed[i] = pm.McqAnswer(True, answers[i].weight)
    assert pm.score_mcq("x", fixed).normalized >= pm.score_mcq("x", answers).normalized


@given(mcq_answers)
def test_aptitude_scores_stay_in_range(answers):
    r = pm.score_mcq("x", answers)
    assert 0.0 <= r.normalized <= 1.0 and 0.0 <= r.reliability <= 1.0


def test_quality_flags():
    same = {"a": [pm.LikertAnswer(4)] * 5, "b": [pm.LikertAnswer(4)] * 4}
    assert "straight_lining" in pm.quality_flags(same)
    fast = {"a": [pm.LikertAnswer(v, response_ms=300) for v in (1, 2, 3, 4, 5)]}
    assert "speeding" in pm.quality_flags(fast)
    contradictory = {"grit": [pm.LikertAnswer(5), pm.LikertAnswer(5), pm.LikertAnswer(5, reverse=True)]}
    assert "contradictory_answers:grit" in pm.quality_flags(contradictory)
    half = {"a": [pm.LikertAnswer(3), pm.LikertAnswer(None), pm.LikertAnswer(None), pm.LikertAnswer(4)]}
    assert "incomplete" in pm.quality_flags(half)
    clean = {"a": [pm.LikertAnswer(v, response_ms=4000) for v in (4, 5, 4, 3)]}
    assert pm.quality_flags(clean) == []


def test_penalties_only_hit_affected_dimensions():
    results = {
        "grit": pm.DimensionResult("grit", 4.0, 0.75, 1.0, 4, 4, False),
        "apt_logical": pm.DimensionResult("apt_logical", 3.0, 0.8, 1.0, 4, 4, False),
    }
    out = pm.apply_penalties(results, ["straight_lining", "contradictory_answers:grit"], likert_dims={"grit"})
    assert out["grit"].reliability == pytest.approx(0.3)
    assert out["apt_logical"].reliability == 1.0


def test_vector_imputes_missing_dimensions_and_reports_completeness():
    v = pm.build_vector({"riasec_i": pm.DimensionResult("riasec_i", 4.5, 0.875, 1.0, 4, 4, False)})
    assert v.vector["riasec_i"] == 0.875 and v.vector["grit"] == pm.NEUTRAL
    assert len(v.imputed) == 18 and v.completeness == pytest.approx(1 / 19, abs=1e-4)


def test_holland_code_ties_follow_riasec_order():
    assert pm.holland_code({}) == "RIA"
    assert pm.holland_code({"riasec_s": 0.9, "riasec_e": 0.8, "riasec_c": 0.7}) == "SEC"


def test_no_percentile_without_a_real_norm_group():
    assert pm.percentile_rank(0.7, [0.5] * 199) is None
    assert pm.percentile_rank(0.5, [0.5] * 200) == 50.0


def test_cronbach_alpha_and_item_total():
    consistent = [[1, 1, 1], [3, 3, 2], [5, 4, 5], [2, 2, 2], [4, 5, 4]]
    assert pm.cronbach_alpha(consistent) > 0.9
    assert pm.cronbach_alpha([[1, 1], [1, 1]]) is None  # no variance
    assert pm.cronbach_alpha([[1, 2]]) is None  # one respondent
    corr = pm.item_total_correlations(consistent)
    assert all(c is not None and c > 0.8 for c in corr)
