"""Live (database) side of the follow-through features. Mixed into LiveGateway, so it reuses its access rules."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select

from app.core.clock import today
from app.core.errors import AppError, ErrorCode
from app.models import assessment as am
from app.models import catalog as cm
from app.models import engagement as em
from app.models import outputs as om
from app.models import student as sm
from app.schemas.analysis import AnalysisRun
from app.schemas.common import CareerRef, Role
from app.schemas.engagement import (
    DashboardRow,
    Deadlines,
    EducatorDashboard,
    MentorDirectory,
    MentorIn,
    MentorOut,
    OutcomeIn,
    OutcomeOut,
    OutcomeSummary,
    ReminderChannel,
    ReminderOut,
    ReminderPlan,
    ReminderRequest,
)
from app.services import followthrough as ft
from app.services.catalog_db import region_for_pincode
from app.services.principal import Principal

MENTOR_CONTACT = "Ask your school counsellor to introduce you. PRISM never shares mentors' phone numbers."
MENTOR_EMPTY = (
    "No verified mentors are listed for this career and area yet. Schools and counsellors can add mentors "
    "who have agreed in writing; PRISM never lists people without their consent."
)


def _short_name(full: str) -> str:
    parts = full.split()
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[-1][0]}."


class EngagementMixin:
    # ------------------------------------------------------------ helpers
    def catalog_input(self):
        return self._catalog()

    def _latest_row(self, sid: str) -> om.AnalysisRunRow | None:
        return self.db.scalar(
            select(om.AnalysisRunRow)
            .where(om.AnalysisRunRow.student_user_id == sid, om.AnalysisRunRow.kind == "baseline")
            .order_by(om.AnalysisRunRow.created_at.desc())
            .limit(1)
        )

    def latest_run(self, p: Principal, student_id: str) -> AnalysisRun:
        sid = self._student_for(p, student_id)
        row = self._latest_row(sid)
        if row is None:
            raise AppError(ErrorCode.NOT_FOUND, "No results yet: generate recommendations first")
        return self._view(AnalysisRun.model_validate(row.output), p)

    def student_deadlines(self, p: Principal, student_id: str, horizon_days: int) -> Deadlines:
        return ft.deadlines(self.latest_run(p, student_id), self._catalog(), today(), horizon_days)

    # ------------------------------------------------------------ reminders
    def _reminder_out(self, r: em.Reminder) -> ReminderOut:
        return ReminderOut(
            id=r.id,
            title=r.title,
            ref_id=r.ref_id,
            due=r.due,
            send_on=r.send_on,
            channel=ReminderChannel(r.channel),
            status=r.status,
        )

    def create_reminders(self, p: Principal, student_id: str, req: ReminderRequest) -> ReminderPlan:
        if p.role not in (Role.STUDENT, Role.PARENT):
            raise AppError(ErrorCode.FORBIDDEN, "Only students and parents can subscribe to reminders")
        if req.channel is ReminderChannel.CALENDAR:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                "For calendar reminders, download /students/{id}/deadlines.ics instead",
            )
        d = self.student_deadlines(p, student_id, req.horizon_days)
        if req.channel in (ReminderChannel.SMS, ReminderChannel.WHATSAPP):
            if not req.phone:
                raise AppError(ErrorCode.VALIDATION_ERROR, "A phone number is needed for SMS or WhatsApp")
            self._user(p.user_id).phone = req.phone
        existing = {
            (r.ref_id, r.due, r.channel)
            for r in self.db.scalars(select(em.Reminder).where(em.Reminder.user_id == p.user_id))
        }
        created, already = [], 0
        for ref, title, due, send_on in ft.reminder_plan(d, req.lead_days, today()):
            if (ref, due, req.channel.value) in existing:
                already += 1
                continue
            r = em.Reminder(
                user_id=p.user_id,
                title=title,
                ref_id=ref,
                due=due,
                send_on=send_on,
                channel=req.channel.value,
            )
            self.db.add(r)
            created.append(r)
        self.db.flush()
        self._audit(
            p.user_id,
            "reminders.create",
            "reminder",
            None,
            {"count": len(created), "channel": req.channel.value},
        )
        return ReminderPlan(
            created=len(created),
            already_scheduled=already,
            reminders=[self._reminder_out(r) for r in created],
            notice="Reminders are sent on the morning of the send date. Reply STOP or cancel here at any time.",
        )

    def list_reminders(self, p: Principal) -> list[ReminderOut]:
        rows = self.db.scalars(
            select(em.Reminder).where(em.Reminder.user_id == p.user_id).order_by(em.Reminder.send_on)
        )
        return [self._reminder_out(r) for r in rows]

    def cancel_reminders(self, p: Principal) -> int:
        n = 0
        for r in self.db.scalars(
            select(em.Reminder).where(em.Reminder.user_id == p.user_id, em.Reminder.status == "pending")
        ):
            r.status = "cancelled"
            n += 1
        return n

    # ------------------------------------------------------------ outcomes
    def _outcome_out(self, o: em.Outcome) -> OutcomeOut:
        slug = self.db.get(cm.Career, o.chosen_career_id).slug if o.chosen_career_id else None
        return OutcomeOut(
            id=o.id,
            student_id=o.student_user_id,
            run_id=o.run_id,
            status=o.status,
            chosen_career_id=slug,
            chosen_pathway_text=o.chosen_pathway_text,
            admitted=o.admitted,
            scholarship_received=o.scholarship_received,
            satisfaction=o.satisfaction,
            notes=o.notes,
            followed_recommendation_rank=o.followed_recommendation_rank,
            created_at=o.created_at,
        )

    def add_outcome(self, p: Principal, student_id: str, body: OutcomeIn) -> OutcomeOut:
        sid = self._student_for(p, student_id)
        career_id = None
        if body.chosen_career_id:
            c = self.db.scalar(
                select(cm.Career).where(
                    (cm.Career.id == body.chosen_career_id) | (cm.Career.slug == body.chosen_career_id)
                )
            )
            if c is None:
                raise AppError(ErrorCode.NOT_FOUND, "Career not found", {"career_id": body.chosen_career_id})
            career_id = c.id
        row = self.db.get(om.AnalysisRunRow, body.run_id) if body.run_id else self._latest_row(sid)
        if row is not None and row.student_user_id != sid:
            raise AppError(ErrorCode.FORBIDDEN, "That run belongs to another student")
        run = AnalysisRun.model_validate(row.output) if row else None
        o = em.Outcome(
            student_user_id=sid,
            run_id=row.id if row else None,
            chosen_career_id=career_id,
            chosen_pathway_text=body.chosen_pathway_text,
            status=body.status.value,
            admitted=body.admitted,
            scholarship_received=body.scholarship_received,
            satisfaction=body.satisfaction,
            notes=body.notes,
            followed_recommendation_rank=ft.followed_rank(run, career_id),
        )
        self.db.add(o)
        self.db.flush()
        self._audit(p.user_id, "outcome.create", "outcome", o.id)
        return self._outcome_out(o)

    def list_outcomes(self, p: Principal, student_id: str) -> list[OutcomeOut]:
        sid = self._student_for(p, student_id)
        rows = self.db.scalars(
            select(em.Outcome).where(em.Outcome.student_user_id == sid).order_by(em.Outcome.created_at.desc())
        )
        return [self._outcome_out(o) for o in rows]

    def outcomes_summary(self) -> OutcomeSummary:
        rows = [
            {
                "status": o.status,
                "followed_recommendation_rank": o.followed_recommendation_rank,
                "satisfaction": o.satisfaction,
                "scholarship_received": o.scholarship_received,
            }
            for o in self.db.scalars(select(em.Outcome))
        ]
        return ft.outcome_summary(rows)

    # ------------------------------------------------------------ mentors
    def list_mentors(
        self, career_id: str | None, region_code: str | None, pincode: str | None
    ) -> MentorDirectory:
        cat = self._catalog()
        refs = {c.id: c for c in cat.careers}
        q = (
            select(em.Mentor, cm.Region.code)
            .join(cm.Region, cm.Region.id == em.Mentor.region_id)
            .where(em.Mentor.active.is_(True))
        )
        if career_id:
            c = next((c for c in cat.careers if career_id in (c.id, c.slug)), None)
            if c is None:
                raise AppError(ErrorCode.NOT_FOUND, "Career not found", {"career_id": career_id})
            q = q.where(em.Mentor.career_id == c.id)
        if pincode and not region_code:
            region_code = region_for_pincode(self.db, pincode) or "-"
        if region_code:
            q = q.where(cm.Region.code == region_code)
        items = [
            MentorOut(
                id=m.id,
                display_name=m.display_name,
                career=CareerRef(
                    **refs[m.career_id].model_dump(include={"id", "slug", "name", "sector", "steam_tags"})
                ),
                region_code=code,
                district=m.district,
                organisation=m.organisation,
                languages=m.languages,
                bio=m.bio,
                contact=MENTOR_CONTACT,
            )
            for m, code in self.db.execute(q.order_by(em.Mentor.created_at)).all()
            if m.career_id in refs
        ]
        return MentorDirectory(items=items, notice=MENTOR_CONTACT if items else MENTOR_EMPTY)

    def add_mentor(self, p: Principal, body: MentorIn) -> MentorOut:
        c = self.db.scalar(
            select(cm.Career).where((cm.Career.id == body.career_id) | (cm.Career.slug == body.career_id))
        )
        r = self.db.scalar(select(cm.Region).where(cm.Region.code == body.region_code))
        if c is None or r is None:
            raise AppError(ErrorCode.NOT_FOUND, "Unknown career or region")
        m = em.Mentor(
            display_name=body.display_name,
            career_id=c.id,
            region_id=r.id,
            district=body.district,
            organisation=body.organisation,
            languages=body.languages,
            bio=body.bio,
            consent_on=body.consent_on,
            verified_by=body.verified_by,
        )
        self.db.add(m)
        self.db.flush()
        self._audit(p.user_id, "mentor.create", "mentor", m.id)
        return self.list_mentors(c.id, r.code, None).items[-1]

    # ------------------------------------------------------------ counsellor dashboard
    def educator_dashboard(self, p: Principal) -> EducatorDashboard:
        if p.role is not Role.EDUCATOR:
            raise AppError(ErrorCode.FORBIDDEN, "For school counsellors and teachers")
        now = datetime.now(UTC)
        cat = self._catalog()
        rows: list[DashboardRow] = []
        for sid in self._students_of(p):
            u = self._user(sid)
            prof = self.db.scalar(select(sm.StudentProfile).where(sm.StudentProfile.user_id == sid))
            subs = self.db.scalar(
                select(func.count())
                .select_from(am.AssessmentSubmission)
                .where(am.AssessmentSubmission.student_user_id == sid)
            )
            row = self._latest_row(sid)
            run = self._view(AnalysisRun.model_validate(row.output), p) if row else None
            created = row.created_at.replace(tzinfo=row.created_at.tzinfo or UTC) if row else None
            soon = ft.deadlines(run, cat, today(), 14).items if run else []
            has_outcome = bool(
                self.db.scalar(
                    select(func.count()).select_from(em.Outcome).where(em.Outcome.student_user_id == sid)
                )
            )
            rows.append(
                DashboardRow(
                    student_id=sid,
                    display_name=_short_name(u.full_name),
                    grade=prof.grade if prof else None,
                    latest_run_id=row.id if row else None,
                    latest_run_at=created,
                    top_career=run.recommendations[0].career.name if run else None,
                    conflict_band=run.conflict.band.value if run else None,
                    flags=ft.dashboard_flags(
                        consent_status=self._consent_status(u),
                        submissions=subs or 0,
                        run=run,
                        run_age_days=(now - created).days if created else None,
                        deadlines_soon=soon,
                        has_outcome=has_outcome,
                    ),
                )
            )
        rows.sort(
            key=lambda r: (
                min((ft.SEVERITY_ORDER[f.severity.value] for f in r.flags), default=9),
                r.display_name,
            )
        )
        counts: dict[str, int] = {}
        for r in rows:
            for f in r.flags:
                counts[f.code] = counts.get(f.code, 0) + 1
        return EducatorDashboard(educator_id=p.user_id, as_of=today(), students=rows, flag_counts=counts)
