"""Reads the catalog from the database into the API's Pydantic models and the engine's CatalogInput.

The catalog changes only when a data refresh activates a new dataset version, so the assembled
CatalogInput is cached per version.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engine.types import CatalogInput, Edge
from app.models import catalog as cm
from app.schemas.catalog import (
    CareerDetail,
    CareerRef,
    CareerSkill,
    DateStatus,
    Exam,
    ExamSession,
    Institution,
    LocalOpportunity,
    MarketSignal,
    Pathway,
    Region,
    SalaryBand,
    Scholarship,
)
from app.schemas.common import Provenance

_cache: dict[str, CatalogInput] = {}


def prov(row) -> Provenance:
    return Provenance(
        source_name=row.source_name,
        source_url=row.source_url,
        as_of=row.as_of,
        confidence=row.confidence,
        is_estimate=row.is_estimate,
        verification=row.verification,
        verified_on=row.verified_on,
        evidence=row.evidence,
    )


def active_version(db: Session) -> cm.DatasetVersion | None:
    return db.scalar(select(cm.DatasetVersion).where(cm.DatasetVersion.is_active.is_(True)))


def career_ref(c: cm.Career) -> CareerRef:
    return CareerRef(id=c.id, slug=c.slug, name=c.name, sector=c.sector, steam_tags=c.steam_tags)


def region_model(r: cm.Region) -> Region:
    return Region(
        code=r.code,
        name=r.name,
        state=r.state,
        country=r.country,
        type=r.type,
        cost_of_living_index=r.cost_of_living_index,
    )


def load_catalog(db: Session) -> CatalogInput:
    v = active_version(db)
    if v is None:
        raise RuntimeError("No active dataset version; run scripts/seed.py")
    if v.label in _cache:
        return _cache[v.label]
    regions = {r.id: r for r in db.scalars(select(cm.Region))}
    careers = {c.id: c for c in db.scalars(select(cm.Career).where(cm.Career.deleted_at.is_(None)))}
    refs = {cid: career_ref(c) for cid, c in careers.items()}
    skills: dict[str, list[CareerSkill]] = defaultdict(list)
    for s in db.scalars(select(cm.CareerSkill)):
        skills[s.career_id].append(CareerSkill(skill=s.skill, importance=s.importance, category=s.category))
    bands: dict[str, list[SalaryBand]] = defaultdict(list)
    for b in db.scalars(select(cm.SalaryBand).where(cm.SalaryBand.dataset_version_id == v.id)):
        r = regions[b.region_id]
        bands[b.career_id].append(
            SalaryBand(
                region_code=r.code,
                entry_p50=b.entry_p50,
                mid_p50=b.mid_p50,
                senior_p50=b.senior_p50,
                growth_rate=b.growth_rate,
                region_multiplier=r.salary_multiplier,
                provenance=prov(b),
            )
        )
    signals = [
        MarketSignal(
            career=refs[s.career_id],
            region_code=regions[s.region_id].code,
            period=s.period,
            demand_index=s.demand_index,
            job_velocity=s.job_velocity,
            disruption_risk=s.disruption_risk,
            trend="rising" if s.job_velocity > 0.08 else "stable" if s.job_velocity > -0.02 else "declining",
            provenance=prov(s),
        )
        for s in db.scalars(select(cm.MarketSignal).where(cm.MarketSignal.dataset_version_id == v.id))
        if s.career_id in refs
    ]
    exams_by_id = {e.id: e for e in db.scalars(select(cm.Exam))}
    sessions: dict[str, list[ExamSession]] = defaultdict(list)
    for s in db.scalars(select(cm.ExamSession).order_by(cm.ExamSession.session_no)):
        sessions[s.exam_id].append(
            ExamSession(
                cycle_year=s.cycle_year,
                session_no=s.session_no,
                registration_close=s.registration_close,
                registration_status=DateStatus(s.registration_status),
                exam_start=s.exam_start,
                exam_end=s.exam_end,
                exam_date_status=DateStatus(s.exam_date_status),
            )
        )
    pathway_careers: dict[str, list[str]] = defaultdict(list)
    for pc in db.scalars(select(cm.PathwayCareer)):
        pathway_careers[pc.pathway_id].append(pc.career_id)
    pathway_exams: dict[str, list[str]] = defaultdict(list)
    for pe in db.scalars(select(cm.PathwayExam)):
        pathway_exams[pe.pathway_id].append(exams_by_id[pe.exam_id].code)
    exam_careers: dict[str, set[str]] = defaultdict(set)
    for pid, codes in pathway_exams.items():
        for code in codes:
            exam_careers[code].update(pathway_careers[pid])
    exams = {}
    for e in exams_by_id.values():
        ss = sessions[e.id]
        first = min((s.exam_start for s in ss if s.exam_start), default=None)
        reg = min((s.registration_close for s in ss if s.registration_close), default=None)
        exams[e.code] = Exam(
            code=e.code,
            name=e.name,
            conducting_body=e.conducting_body,
            level=e.level,
            frequency=e.frequency,
            next_window_start=first,
            next_window_end=ss[0].exam_end if ss else None,
            registration_deadline=reg,
            dates_are_estimates=any(
                DateStatus.ESTIMATED in (s.exam_date_status, s.registration_status) for s in ss
            ),
            sessions=ss,
            eligibility_summary=e.eligibility_summary,
            official_url=e.official_url,
            career_ids=sorted(exam_careers[e.code]),
            provenance=prov(e),
        )
    insts = {i.id: i for i in db.scalars(select(cm.Institution))}
    pathways = []
    for p in db.scalars(select(cm.Pathway).where(cm.Pathway.deleted_at.is_(None))):
        i = insts[p.institution_id]
        pathways.append(
            Pathway(
                id=p.id,
                course=p.course,
                degree_level=p.degree_level,
                institution=Institution(
                    id=i.id,
                    name=i.name,
                    city=i.city,
                    state=i.state,
                    country=i.country,
                    tier=i.tier,
                    ranking_source=i.ranking_source,
                    rank=i.rank,
                    ownership=i.ownership,
                ),
                duration_years=p.duration_years,
                quota=p.quota,
                fee_academic_year=p.fee_academic_year,
                tuition_per_year=p.tuition_per_year,
                hostel_per_year=p.hostel_per_year,
                living_per_year=p.living_per_year,
                misc_per_year=p.misc_per_year,
                entrance_exam_codes=sorted(pathway_exams[p.id]),
                career_ids=pathway_careers[p.id],
                course_area=p.course_area,
                admission_route=p.admission_route,
                selectivity=p.selectivity,
                seats=p.seats,
                provenance=prov(p),
            )
        )
    scholarships = [
        Scholarship(
            id=s.id,
            name=s.name,
            provider=s.provider,
            provider_type=s.provider_type,
            amount_type=s.amount_type,
            amount_per_year=s.amount_per_year,
            year_amounts=s.year_amounts,
            percent_of_tuition=s.percent_of_tuition,
            max_years=s.max_years,
            covers=s.covers,
            eligibility_rules=s.eligibility_rules,
            eligibility_summary=s.eligibility_summary,
            probability=s.probability,
            stackable=s.stackable,
            exclusive_group=s.exclusive_group,
            deadline=s.deadline,
            deadline_status=DateStatus(s.deadline_status),
            self_declared_criteria=s.self_declared_criteria,
            provenance=prov(s),
        )
        for s in db.scalars(select(cm.Scholarship).where(cm.Scholarship.deleted_at.is_(None)))
    ]
    pathway_scholarships: dict[str, list[str]] = defaultdict(list)
    for ps in db.scalars(select(cm.PathwayScholarship)):
        pathway_scholarships[ps.pathway_id].append(ps.scholarship_id)
    local_careers: dict[str, list[CareerRef]] = defaultdict(list)
    for lc in db.scalars(select(cm.LocalOpportunityCareer)):
        if lc.career_id in refs:
            local_careers[lc.local_opportunity_id].append(refs[lc.career_id])
    local = [
        LocalOpportunity(
            id=o.id,
            title=o.title,
            problem_statement=o.problem_statement,
            region_code=regions[o.region_id].code,
            district=o.district,
            pincodes=o.pincodes,
            steam_tags=o.steam_tags,
            linked_careers=local_careers[o.id],
            skills=o.skills,
            partner_type=o.partner_type,
            starter_project=o.starter_project,
            provenance=prov(o),
        )
        for o in db.scalars(select(cm.LocalOpportunity))
    ]
    related = {cid: sorted({code for code, cs in exam_careers.items() if cid in cs}) for cid in careers}
    details = [
        CareerDetail(
            id=c.id,
            slug=c.slug,
            name=c.name,
            sector=c.sector,
            steam_tags=c.steam_tags,
            short_description=c.short_description,
            typical_entry_education=c.typical_entry_education,
            automation_risk=c.automation_risk,
            national_demand_index=max((s.demand_index for s in signals if s.career.id == c.id), default=None),
            long_description=c.short_description,
            riasec_profile={k: v for k, v in c.requirement_vector.items() if k.startswith("riasec_")},
            requirement_vector=c.requirement_vector,
            aptitude_requirements={k: v for k, v in c.requirement_vector.items() if k.startswith("apt_")},
            skills=skills[c.id],
            salary_bands=bands[c.id],
            related_exam_codes=related[c.id],
            day_in_life=[],
        )
        for c in careers.values()
    ]
    edges = [
        Edge(
            from_id=e.from_career_id,
            to_id=e.to_career_id,
            skill_overlap=e.skill_overlap,
            transition_difficulty=e.transition_difficulty,
            why=e.why,
        )
        for e in db.scalars(select(cm.CareerEdge))
    ]
    pins = {p.pincode: p.district for p in db.scalars(select(cm.PincodeRegion))}
    cat = CatalogInput(
        careers=sorted(details, key=lambda c: c.slug),
        pathways=pathways,
        scholarships=scholarships,
        pathway_scholarships=dict(pathway_scholarships),
        signals=signals,
        salaries=dict(bands),
        exams=exams,
        edges=edges,
        local_opportunities=local,
        regions={r.code: region_model(r) for r in regions.values()},
        dataset_version=v.label,
        latest_dataset_version=v.label,
        data_as_of=max((s.provenance.as_of for s in signals), default=date.today()),
        district_of_pincode=pins,
    )
    _cache.clear()
    _cache[v.label] = cat
    return cat


def region_for_pincode(db: Session, pincode: str) -> str | None:
    row = db.get(cm.PincodeRegion, pincode)
    if row:
        return db.get(cm.Region, row.region_id).code
    # Fallback: same first three digits as a known pincode (same postal sorting district).
    near = db.scalar(select(cm.PincodeRegion).where(cm.PincodeRegion.pincode.like(pincode[:3] + "%")))
    return db.get(cm.Region, near.region_id).code if near else None


def invalidate() -> None:
    _cache.clear()
