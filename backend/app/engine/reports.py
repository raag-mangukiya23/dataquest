"""SWOT and 5-year roadmap generation from a computed run. Pure functions."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, timedelta

from app.core.dimensions import APTITUDE, DIMENSION_LABELS, DIMENSIONS
from app.engine.finance import course_start_year
from app.engine.psychometrics import holland_code
from app.engine.types import StudentInput
from app.schemas.analysis import AnalysisRun, FinancialAssessment, Recommendation
from app.schemas.catalog import CareerDetail, DateStatus, Exam, LocalOpportunity, MarketSignal, Pathway
from app.schemas.common import AffordabilityClass, CareerRef, ConflictBand
from app.schemas.reports import (
    Milestone,
    MilestoneType,
    RankedPathway,
    Roadmap,
    RoadmapPhase,
    SkillAction,
    SwotItem,
    SwotReport,
)

FREE_PLATFORMS = {
    "school": ("DIKSHA", "https://diksha.gov.in"),
    "technical": ("NPTEL", "https://nptel.ac.in"),
    "general": ("SWAYAM", "https://swayam.gov.in"),
}


def _status_text(status: DateStatus) -> str:
    return {
        DateStatus.ANNOUNCED: "Announced",
        DateStatus.TENTATIVE: "Tentative (official calendar)",
        DateStatus.ESTIMATED: "Estimated from previous years",
    }[status]


def swot(
    run: AnalysisRun,
    student: StudentInput,
    rec: Recommendation | None,
    signals: Sequence[MarketSignal],
    local: Sequence[LocalOpportunity],
) -> SwotReport:
    v = student.vector
    measured = [d for d in DIMENSIONS if d not in student.imputed]
    strengths = [
        SwotItem(
            title=DIMENSION_LABELS[d],
            detail=f"Scored {v[d]:.0%}, one of your strongest traits.",
            evidence={"score": round(v[d], 4)},
            weight=round(v[d], 2),
        )
        for d in sorted(measured, key=lambda d: (-v[d], d))[:4]
        if v[d] >= 0.6
    ]
    focus = rec or run.recommendations[0]
    weaknesses = [
        SwotItem(
            title=g.label,
            detail=f"{g.gap:.0%} below what {focus.career.name} usually needs; closable with practice.",
            evidence={"student": g.student, "required": g.required},
            weight=min(1.0, 2 * g.gap),
        )
        for g in focus.fit.gaps[:3]
    ] + [
        SwotItem(
            title=DIMENSION_LABELS[d],
            detail="Not enough answers to measure this yet; finish the questionnaire.",
            weight=0.3,
        )
        for d in student.imputed[:2]
    ]
    top_ids = {r.career.id for r in run.recommendations[:5]}
    rising = sorted(
        (s for s in signals if s.career.id in top_ids and s.job_velocity > 0.05),
        key=lambda s: (-s.job_velocity, s.career.id),
    )
    opportunities = [
        SwotItem(
            title=f"Growing demand for {s.career.name} ({s.region_code})",
            detail=f"Demand index {s.demand_index:.2f}, job ads {s.job_velocity:+.0%} a year "
            f"({'estimate' if s.provenance.is_estimate else s.provenance.source_name}).",
            evidence={"demand_index": s.demand_index, "job_velocity": s.job_velocity},
            weight=s.demand_index,
        )
        for s in list({s.career.id: s for s in rising}.values())[:2]
    ] + [
        SwotItem(
            title=o.title,
            detail=f"A real problem near you. Starter project: {o.starter_project}",
            evidence={"district": o.district},
            weight=0.6,
        )
        for o in local[:2]
    ]
    threats = [
        SwotItem(
            title=f"Automation pressure on {r.career.name}",
            detail=f"Disruption risk {r.market.disruption_risk:.0%}; routine parts of the job are shrinking.",
            evidence={"disruption_risk": r.market.disruption_risk},
            weight=r.market.disruption_risk,
        )
        for r in run.recommendations[:3]
        if r.market.disruption_risk >= 0.25
    ]
    costly = [
        r
        for r in run.recommendations[:5]
        if r.financial.affordability_class
        in (AffordabilityClass.LOAN_DEPENDENT, AffordabilityClass.INFEASIBLE)
    ]
    if costly:
        threats.append(
            SwotItem(
                title="Budget pressure",
                detail=f"{', '.join(r.career.name for r in costly)} need a loan or are out of budget.",
                evidence={"careers": len(costly)},
                weight=0.6,
            )
        )
    if run.conflict.band in (ConflictBand.MODERATE, ConflictBand.HIGH):
        threats.append(
            SwotItem(
                title="Family disagreement",
                detail="Talk through the conversation prompts early.",
                evidence={"conflict_index": run.conflict.index},
                weight=0.5,
            )
        )
    top_two = [DIMENSION_LABELS[d].split(" (")[0].lower() for d in sorted(measured, key=lambda d: -v[d])[:2]]
    return SwotReport(
        run_id=run.run_id,
        career=rec.career if rec else None,
        strengths=strengths,
        weaknesses=weaknesses
        or [SwotItem(title="No major gaps", detail="You meet the usual requirements.", weight=0.1)],
        opportunities=opportunities,
        threats=threats,
        headline=f"{holland_code(v)} profile, strongest in {' and '.join(top_two)}; best matched to "
        f"{focus.career.name} via {focus.financial.pathway_name} "
        f"({focus.financial.affordability_class.value.replace('_', '-')}).",
    )


def _resource(kind: str) -> tuple[str, str]:
    return FREE_PLATFORMS[kind]


def skill_actions(rec: Recommendation, career: CareerDetail, in_school: bool) -> list[SkillAction]:
    out = []
    for g in rec.fit.gaps[:3]:
        kind = "school" if in_school and g.dimension in APTITUDE else "general"
        name, url = _resource(kind)
        out.append(
            SkillAction(
                dimension_or_skill=g.label,
                gap=g.gap,
                resource_type="practice",
                action=f"Practise {g.label.lower()} for 20 minutes a day; {name} has free material.",
                weeks=8,
                resource_name=name,
                resource_url=url,
            )
        )
    for sk in sorted(career.skills, key=lambda s: -s.importance)[:2]:
        name, url = _resource("technical" if sk.category == "technical" else "general")
        out.append(
            SkillAction(
                dimension_or_skill=sk.skill,
                gap=round(sk.importance, 2),
                resource_type="course",
                action=f"Search '{sk.skill}' on {name} and complete one beginner course.",
                weeks=6,
                resource_name=name,
                resource_url=url,
            )
        )
    return out


def roadmap(
    run: AnalysisRun,
    rec: Recommendation,
    student: StudentInput,
    career: CareerDetail,
    pathways: Mapping[str, Pathway],
    exams: Mapping[str, Exam],
    local: Sequence[LocalOpportunity],
    plan_b: Sequence[CareerRef],
    today: date,
) -> Roadmap:
    y1 = today.year if today.month < 9 else today.year + 1
    start_year = course_start_year(student.grade, today)
    p0 = start_year - y1 + 2  # phase in which the course begins
    primary = pathways.get(rec.financial.pathway_id)
    duration = rec.financial.duration_years
    phases: list[RoadmapPhase] = []
    for i in range(1, 6):
        start = today if i == 1 else date(y1 + i - 2, 9, 1)
        end = date(y1 + i - 1, 8, 31)
        ms: list[Milestone] = []
        course_year = i - p0 + 1
        if course_year < 1:  # still in school
            label = f"Year {i} - Class {min(12, student.grade + i - 1)}"
            if i == p0 - 1:
                label += ", entrance exams and admission"
                for code in primary.entrance_exam_codes if primary else []:
                    e = exams.get(code)
                    for s in e.sessions if e else []:
                        if s.registration_close and start <= s.registration_close <= end:
                            ms.append(
                                Milestone(
                                    title=f"Register for {e.name} (session {s.session_no})",
                                    type=MilestoneType.EXAM,
                                    due=s.registration_close,
                                    date_is_estimate=s.registration_status is not DateStatus.ANNOUNCED,
                                    ref_id=e.code,
                                    detail=_status_text(s.registration_status),
                                )
                            )
                        if s.exam_start and start <= s.exam_start <= end:
                            ms.append(
                                Milestone(
                                    title=f"Sit {e.name} (session {s.session_no})",
                                    type=MilestoneType.EXAM,
                                    due=s.exam_start,
                                    date_is_estimate=s.exam_date_status is not DateStatus.ANNOUNCED,
                                    ref_id=e.code,
                                    detail=_status_text(s.exam_date_status),
                                )
                            )
                if student.grade >= 12:
                    ms.append(
                        Milestone(
                            title="Class 12 board exams",
                            type=MilestoneType.ACADEMIC,
                            due=date(end.year, 2, 15),
                            detail="Estimated; your board percentile also decides several scholarships.",
                        )
                    )
                ms.append(
                    Milestone(
                        title=f"Admission and counselling: {rec.financial.pathway_name}",
                        type=MilestoneType.APPLICATION,
                        due=date(end.year, 7, 15),
                        ref_id=rec.financial.pathway_id,
                        detail=rec.financial.institution_name,
                    )
                )
            else:
                ms.append(
                    Milestone(
                        title="Explore: join a club or a local project",
                        type=MilestoneType.PROJECT,
                        due=date(end.year, 3, 31),
                        detail="Build evidence of interest early.",
                    )
                )
        elif course_year <= duration:
            label = f"Year {i} - {rec.financial.pathway_name}, year {course_year}"
            if course_year == 1:
                for a in skill_actions(rec, career, in_school=False)[-2:]:
                    ms.append(
                        Milestone(
                            title=a.action,
                            type=MilestoneType.SKILL,
                            due=date(end.year, 1, 31),
                            detail=f"{a.resource_name}: {a.resource_url}",
                        )
                    )
            elif course_year == 2:
                if local:
                    o = local[0]
                    ms.append(
                        Milestone(
                            title=f"Local project: {o.title}",
                            type=MilestoneType.PROJECT,
                            due=date(end.year, 4, 30),
                            ref_id=o.id,
                            detail=o.starter_project,
                        )
                    )
                else:
                    ms.append(
                        Milestone(
                            title=f"Build a portfolio project in {career.name.lower()}",
                            type=MilestoneType.PROJECT,
                            due=date(end.year, 4, 30),
                            detail="",
                        )
                    )
            elif course_year < duration:
                ms.append(
                    Milestone(
                        title="Summer internship",
                        type=MilestoneType.CAREER,
                        due=date(end.year, 6, 30),
                        detail="Apply by January.",
                    )
                )
            if course_year == duration:
                ms.append(
                    Milestone(
                        title="Campus placements",
                        type=MilestoneType.CAREER,
                        due=date(end.year - 1, 12, 15),
                        detail=f"Typical starting salary about Rs {rec.financial.roi.starting_salary:,} "
                        "a year (estimate).",
                    )
                )
                if rec.financial.monthly_emi:
                    ms.append(
                        Milestone(
                            title="Loan repayment starts",
                            type=MilestoneType.FINANCE,
                            due=date(end.year + 1, 6, 30),
                            detail=f"About Rs {rec.financial.monthly_emi:,} a month.",
                        )
                    )
        else:
            label = f"Year {i} - First role as {career.name}"
            ms.append(
                Milestone(
                    title="Keep learning on the job",
                    type=MilestoneType.CAREER,
                    due=None,
                    detail=f"Starting salary about Rs {rec.financial.roi.starting_salary:,} (estimate).",
                )
            )
        ms = [m for m in ms if m.due is None or m.due >= today]
        phases.append(
            RoadmapPhase(
                year_index=i,
                label=label,
                start=start,
                end=end,
                milestones=sorted(ms, key=lambda m: m.due or date.max),
            )
        )

    options: list[FinancialAssessment] = [rec.financial, *rec.alternative_pathways]
    ranked = [
        RankedPathway(
            rank=n,
            pathway_id=f.pathway_id,
            name=f.pathway_name,
            institution_name=f.institution_name,
            affordability_class=f.affordability_class.value,
            total_cost=f.total_cost,
            entrance_exam_codes=pathways[f.pathway_id].entrance_exam_codes
            if f.pathway_id in pathways
            else [],
        )
        for n, f in enumerate(options, 1)
    ]
    deadlines = [
        Milestone(
            title=s.name,
            type=MilestoneType.SCHOLARSHIP,
            due=date.fromisoformat(s.deadline) if s.deadline else None,
            ref_id=s.scholarship_id,
            detail=f"Expected value Rs {s.expected_value:,}",
        )
        for s in rec.financial.scholarship_plan
        if not s.deadline or date.fromisoformat(s.deadline) >= today - timedelta(days=0)
    ]
    return Roadmap(
        run_id=run.run_id,
        career=rec.career,
        phases=phases,
        ranked_pathways=ranked,
        scholarship_deadlines=deadlines,
        skill_actions=skill_actions(rec, career, in_school=student.grade < 13 and p0 > 1),
        plan_b=list(plan_b)[:3],
    )
