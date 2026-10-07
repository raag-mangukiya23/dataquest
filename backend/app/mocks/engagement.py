"""MOCK_MODE side of the follow-through features: same shapes as live, state kept in memory."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.core.errors import AppError, ErrorCode
from app.mocks import builders as b
from app.mocks import world as w
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
from app.services.engagement_live import MENTOR_CONTACT, MENTOR_EMPTY
from app.services.principal import Principal

STUDENT_KEYS = {w.STUDENT_ID, w.STUDENT_USER_ID, "me"}


def _id(*parts: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "mock:" + ":".join(parts)))


class MockEngagementMixin:
    def _state(self, name: str) -> list:
        return self.__dict__.setdefault(name, [])

    def catalog_input(self):
        return b.catalog_input()

    def latest_run(self, p: Principal, student_id: str) -> AnalysisRun:
        if student_id not in STUDENT_KEYS:
            raise AppError(ErrorCode.NOT_FOUND, "Student not found", {"student_id": student_id})
        return self._view(self._baseline(), p)

    def student_deadlines(self, p: Principal, student_id: str, horizon_days: int) -> Deadlines:
        return ft.deadlines(self.latest_run(p, student_id), b.catalog_input(), w.TODAY, horizon_days)

    # ------------------------------------------------------------ reminders
    def create_reminders(self, p: Principal, student_id: str, req: ReminderRequest) -> ReminderPlan:
        if p.role not in (Role.STUDENT, Role.PARENT):
            raise AppError(ErrorCode.FORBIDDEN, "Only students and parents can subscribe to reminders")
        if req.channel is ReminderChannel.CALENDAR:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                "For calendar reminders, download /students/{id}/deadlines.ics instead",
            )
        if req.channel in (ReminderChannel.SMS, ReminderChannel.WHATSAPP) and not req.phone:
            raise AppError(ErrorCode.VALIDATION_ERROR, "A phone number is needed for SMS or WhatsApp")
        store: list[ReminderOut] = self._state("_reminders")
        mine = {(r.ref_id, r.due, r.channel) for r in store if r.id.startswith(p.user_id[:8])}
        created, already = [], 0
        d = self.student_deadlines(p, student_id, req.horizon_days)
        for ref, title, due, send_on in ft.reminder_plan(d, req.lead_days, w.TODAY):
            if (ref, due, req.channel) in mine:
                already += 1
                continue
            r = ReminderOut(
                id=f"{p.user_id[:8]}-{_id(p.user_id, ref, req.channel.value)[9:]}",
                title=title,
                ref_id=ref,
                due=due,
                send_on=send_on,
                channel=req.channel,
                status="pending",
            )
            store.append(r)
            created.append(r)
        return ReminderPlan(
            created=len(created),
            already_scheduled=already,
            reminders=created,
            notice="Reminders are sent on the morning of the send date. Reply STOP or cancel here at any time.",
        )

    def list_reminders(self, p: Principal) -> list[ReminderOut]:
        return sorted(
            (r for r in self._state("_reminders") if r.id.startswith(p.user_id[:8])), key=lambda r: r.send_on
        )

    def cancel_reminders(self, p: Principal) -> int:
        store = self._state("_reminders")
        n = 0
        for i, r in enumerate(store):
            if r.id.startswith(p.user_id[:8]) and r.status == "pending":
                store[i] = r.model_copy(update={"status": "cancelled"})
                n += 1
        return n

    # ------------------------------------------------------------ outcomes
    def add_outcome(self, p: Principal, student_id: str, body: OutcomeIn) -> OutcomeOut:
        if student_id not in STUDENT_KEYS or p.role is Role.ADMIN:
            raise AppError(ErrorCode.FORBIDDEN, "You can only act for yourself or a student in your family")
        run = self._baseline()
        out = OutcomeOut(
            **body.model_dump(exclude={"run_id"}),
            run_id=body.run_id or run.run_id,
            id=_id("outcome", str(len(self._state("_outcomes")))),
            student_id=w.STUDENT_ID,
            followed_recommendation_rank=ft.followed_rank(run, body.chosen_career_id),
            created_at=w.NOW,
        )
        self._state("_outcomes").append(out)
        return out

    def list_outcomes(self, p: Principal, student_id: str) -> list[OutcomeOut]:
        if student_id not in STUDENT_KEYS:
            raise AppError(ErrorCode.FORBIDDEN, "You can only act for yourself or a student in your family")
        return list(reversed(self._state("_outcomes")))

    def outcomes_summary(self) -> OutcomeSummary:
        return ft.outcome_summary([o.model_dump() for o in self._state("_outcomes")])

    # ------------------------------------------------------------ mentors
    def list_mentors(
        self, career_id: str | None, region_code: str | None, pincode: str | None
    ) -> MentorDirectory:
        items = [
            m
            for m in self._state("_mentors")
            if (not career_id or career_id in (m.career.id, m.career.slug))
            and (not region_code or m.region_code == region_code)
        ]
        return MentorDirectory(items=items, notice=MENTOR_CONTACT if items else MENTOR_EMPTY)

    def add_mentor(self, p: Principal, body: MentorIn) -> MentorOut:
        c = next((c for c in b.catalog_input().careers if body.career_id in (c.id, c.slug)), None)
        if c is None:
            raise AppError(ErrorCode.NOT_FOUND, "Unknown career or region")
        m = MentorOut(
            id=_id("mentor", str(len(self._state("_mentors")))),
            display_name=body.display_name,
            career=CareerRef(**c.model_dump(include={"id", "slug", "name", "sector", "steam_tags"})),
            region_code=body.region_code,
            district=body.district,
            organisation=body.organisation,
            languages=body.languages,
            bio=body.bio,
            contact=MENTOR_CONTACT,
        )
        self._state("_mentors").append(m)
        return m

    # ------------------------------------------------------------ counsellor dashboard
    def educator_dashboard(self, p: Principal) -> EducatorDashboard:
        if p.role is not Role.EDUCATOR:
            raise AppError(ErrorCode.FORBIDDEN, "For school counsellors and teachers")
        run = self._view(self._baseline(), p)
        flags = ft.dashboard_flags(
            consent_status="granted",
            submissions=5,
            run=run,
            run_age_days=(
                datetime.combine(w.TODAY, datetime.min.time()) - run.created_at.replace(tzinfo=None)
            ).days,
            deadlines_soon=ft.deadlines(run, b.catalog_input(), w.TODAY, 14).items,
            has_outcome=bool(self._state("_outcomes")),
        )
        row = DashboardRow(
            student_id=w.STUDENT_ID,
            display_name=w.STUDENT["full_name"].split()[0],
            grade=11,
            latest_run_id=run.run_id,
            latest_run_at=run.created_at,
            top_career=run.recommendations[0].career.name,
            conflict_band=run.conflict.band.value,
            flags=flags,
        )
        counts: dict[str, int] = {}
        for f in flags:
            counts[f.code] = counts.get(f.code, 0) + 1
        return EducatorDashboard(educator_id=p.user_id, as_of=w.TODAY, students=[row], flag_counts=counts)
