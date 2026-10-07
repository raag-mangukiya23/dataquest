"""Compare two analysis runs (baseline vs what-if, or any two runs of the same student)."""

from __future__ import annotations

from app.engine.scoring import kendall_tau
from app.schemas.analysis import AnalysisRun, CareerDelta, RunComparison


def compare(base: AnalysisRun, other: AnalysisRun, top_k: int = 5) -> RunComparison:
    b = {r.career.id: r for r in base.recommendations}
    o = {r.career.id: r for r in other.recommendations}
    deltas = []
    for cid in dict.fromkeys([*b, *o]):
        br, orr = b.get(cid), o.get(cid)
        deltas.append(
            CareerDelta(
                career_id=cid,
                career_name=(br or orr).career.name,
                base_rank=br.rank if br else None,
                new_rank=orr.rank if orr else None,
                base_score=br.final_score if br else None,
                new_score=orr.final_score if orr else None,
                score_delta=round((orr.final_score if orr else 0) - (br.final_score if br else 0), 4),
                base_class=br.financial.affordability_class if br else None,
                new_class=orr.financial.affordability_class if orr else None,
            )
        )
    deltas.sort(key=lambda d: (-abs(d.score_delta), d.career_id))
    btop = [r.career.id for r in base.recommendations[:top_k]]
    otop = [r.career.id for r in other.recommendations[:top_k]]
    summary = [
        f"{d.career_name}: {d.base_class.value if d.base_class else '-'} -> "
        f"{d.new_class.value if d.new_class else '-'} ({d.score_delta:+.3f})"
        for d in deltas
        if d.base_class != d.new_class
    ]
    moved = [
        f"{d.career_name}: rank {d.base_rank} -> {d.new_rank}"
        for d in deltas
        if d.base_rank and d.new_rank and d.base_rank != d.new_rank
    ]
    return RunComparison(
        base_run_id=base.run_id,
        other_run_id=other.run_id,
        rank_correlation=kendall_tau(
            [r.career.id for r in base.recommendations], [r.career.id for r in other.recommendations]
        ),
        deltas=deltas,
        entered_top_k=[c for c in otop if c not in btop],
        left_top_k=[c for c in btop if c not in otop],
        conflict_index_delta=round(other.conflict.index - base.conflict.index, 2),
        summary=(summary + moved) or ["Rankings and funding classes are unchanged under this scenario."],
    )
