"""Live gateway: the same operations as MockGateway, backed by the database and the real engine.

Access rules (enforced here, tested in tests/test_live.py):
- a student sees their own data; parents and guardians in the same family see runs and finances;
- parents see a student's trait profile only with the student's share_raw_answers_with_parent consent;
- a minor's answers are processed only after a linked parent records minor_data_processing consent;
- educators see students assigned to them; admins see k-anonymised aggregates only.
"""

from __future__ import annotations

import uuid
from collections import Counter
from dataclasses import asdict, replace
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.assessment import service as assessment
from app.assessment.bank import get_bank
from app.core.clock import today
from app.core.config import get_settings
from app.core.dimensions import DIMENSIONS
from app.core.errors import AppError, ErrorCode
from app.core.security import (
    create_access_token,
    hash_password,
    new_invite_code,
    new_refresh_token,
    sha256,
    verify_password,
)
from app.engine import conflict as conflict_engine
from app.engine import eligibility
from app.engine import psychometrics as pm
from app.engine.compare import compare as compare_runs
from app.engine.config import DEFAULT_CONFIG, ScoringConfig
from app.engine.types import CatalogInput, FamilyInput, Preference, StudentInput
from app.etl import loader, quality
from app.etl.adapters.adzuna import plan_queries
from app.mocks.gateway import adzuna_adapter, build_data_status, build_methodology
from app.models import assessment as am
from app.models import catalog as cm
from app.models import identity as im
from app.models import outputs as om
from app.models import student as sm
from app.schemas.admin import AdminAnalytics, CountRow, DataRefreshRequest, RefreshResult
from app.schemas.analysis import (
    AnalysisRun,
    AnalysisRunRequest,
    AnalysisRunSummary,
    BucketItem,
    ConflictReport,
    RunComparison,
    WhatIfRequest,
    WhatIfResult,
)
from app.schemas.assessment import (
    Instrument,
    Question,
    SubmitAnswersRequest,
    SubmitResult,
    TraitProfile,
    TraitScore,
)
from app.schemas.auth import AuthResult, LoginRequest, RefreshRequest, RegisterRequest, TokenPair, UserOut
from app.schemas.catalog import (
    CareerAlternative,
    CareerDetail,
    CareerSummary,
    Exam,
    LocalOpportunity,
    MarketTrends,
    Pathway,
    Region,
    ScholarshipMatch,
)
from app.schemas.common import Page, Role
from app.schemas.compat import (
    CompatLoginRequest,
    CompatLoginResponse,
    CompatPredictRequest,
    CompatPredictResponse,
    CompatResult,
    CompatUser,
    CompatUserCreate,
)
from app.schemas.family import (
    ConsentIn,
    ConsentOut,
    ConsentType,
    FamilyFinanceIn,
    FamilyFinanceOut,
    FamilyFinanceSummary,
    FamilyMember,
    FamilyOut,
    InviteOut,
    JoinFamilyRequest,
    ParentPreferencesIn,
    ParentPreferencesOut,
    RankedPreference,
)
from app.schemas.profiles import StudentProfileIn, StudentProfileOut
from app.schemas.reports import Roadmap, SwotReport
from app.schemas.system import DataStatus, Methodology
from app.services.analysis import apply_overrides, hide_family_money, roadmap_for, run_analysis, swot_for
from app.services.catalog_db import invalidate, load_catalog, region_for_pincode
from app.services.engagement_live import EngagementMixin
from app.services.principal import Principal

K_ANONYMITY = 5
LOCKOUT_AFTER = 5
LOCKOUT_MINUTES = 15
INCOME_BAND_MIDPOINT = {
    "below_3l": 200_000,
    "3l_6l": 450_000,
    "6l_10l": 800_000,
    "10l_20l": 1_500_000,
    "20l_50l": 3_000_000,
    "above_50l": 6_000_000,
}
PLACEHOLDER_FAMILY = FamilyInput(
    family_id=None,
    annual_income=600_000,
    income_growth=0.05,
    savings=200_000,
    existing_emi=0,
    dependents=2,
    max_emi=8_000,
    loan_tolerance=0.4,
    risk_appetite=0.5,
    relocation=0.5,
    abroad=0.2,
    time_to_earn_years=5,
    prestige_vs_stability="balanced",
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _aware(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=UTC) if dt is not None and dt.tzinfo is None else dt


def _age(dob: date | None) -> int | None:
    if dob is None:
        return None
    t = today()
    return t.year - dob.year - ((t.month, t.day) < (dob.month, dob.day))


class LiveGateway(EngagementMixin):
    mock = False

    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------ helpers
    def _user(self, user_id: str) -> im.User:
        u = self.db.get(im.User, user_id)
        if u is None or u.deleted_at is not None:
            raise AppError(ErrorCode.NOT_FOUND, "User not found")
        return u

    def _family_link(self, user_id: str) -> im.FamilyLink | None:
        return self.db.scalar(
            select(im.FamilyLink).where(im.FamilyLink.user_id == user_id, im.FamilyLink.status == "active")
        )

    def _family_members(self, family_id: str) -> list[im.FamilyLink]:
        return list(
            self.db.scalars(
                select(im.FamilyLink).where(
                    im.FamilyLink.family_id == family_id, im.FamilyLink.status == "active"
                )
            )
        )

    def _students_of(self, p: Principal) -> list[str]:
        if p.role is Role.STUDENT:
            return [p.user_id]
        if p.role is Role.PARENT and p.family_id:
            return [m.user_id for m in self._family_members(p.family_id) if m.member_role == "student"]
        if p.role is Role.EDUCATOR:
            return list(
                self.db.scalars(
                    select(im.EducatorAssignment.student_user_id).where(
                        im.EducatorAssignment.educator_user_id == p.user_id,
                        im.EducatorAssignment.revoked_at.is_(None),
                    )
                )
            )
        return []

    def _student_for(self, p: Principal, student_id: str | None) -> str:
        allowed = self._students_of(p)
        sid = student_id if student_id and student_id not in ("me", "") else (allowed[0] if allowed else None)
        if p.role is Role.ADMIN:
            raise AppError(ErrorCode.FORBIDDEN, "Admins see aggregate analytics only")
        if sid is None or sid not in allowed:
            raise AppError(ErrorCode.FORBIDDEN, "You can only act for yourself or a student in your family")
        return sid

    def _consent(self, subject: str, kind: ConsentType) -> bool:
        row = self.db.scalar(
            select(im.ConsentRecord)
            .where(
                im.ConsentRecord.subject_user_id == subject,
                im.ConsentRecord.consent_type == kind.value,
            )
            .order_by(im.ConsentRecord.created_at.desc(), im.ConsentRecord.id.desc())
            .limit(1)
        )
        return bool(row and row.granted)

    def _consent_status(self, u: im.User) -> str:
        if u.role != "student" or (_age(u.date_of_birth) or 18) >= 18:
            return "not_required"
        return "granted" if self._consent(u.id, ConsentType.MINOR_DATA_PROCESSING) else "pending"

    def _require_processing_consent(self, student_id: str) -> None:
        u = self._user(student_id)
        if self._consent_status(u) == "pending":
            raise AppError(
                ErrorCode.CONSENT_REQUIRED,
                "A parent or guardian must approve before we process a minor's answers",
                {"how": "The parent joins the family and records 'minor_data_processing' consent"},
            )

    def _audit(
        self, actor: str | None, action: str, entity: str, entity_id: str | None, detail: dict | None = None
    ):
        from app.core.request_context import get_request_id

        self.db.add(
            im.AuditLog(
                created_at=_utcnow(),
                actor_user_id=actor,
                action=action,
                entity_type=entity,
                entity_id=entity_id,
                request_id=get_request_id(),
                detail=detail or {},
            )
        )

    def _user_out(self, u: im.User) -> UserOut:
        link = self._family_link(u.id)
        return UserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=Role(u.role),
            is_minor=u.role == "student" and (_age(u.date_of_birth) or 18) < 18,
            consent_status=self._consent_status(u),
            family_id=link.family_id if link else None,
            created_at=u.created_at,
        )

    def _tokens(self, u: im.User, family: str | None = None) -> TokenPair:
        access, ttl = create_access_token(u.id, u.role)
        raw = new_refresh_token()
        self.db.add(
            im.RefreshToken(
                user_id=u.id,
                token_family=family or str(uuid.uuid4()),
                token_hash=sha256(raw),
                expires_at=_utcnow() + timedelta(days=get_settings().refresh_token_ttl_days),
            )
        )
        return TokenPair(access_token=access, refresh_token=raw, expires_in=ttl)

    def principal(self, user_id: str) -> Principal:
        u = self._user(user_id)
        link = self._family_link(u.id)
        return Principal(
            user_id=u.id,
            role=Role(u.role),
            family_id=link.family_id if link else None,
            student_id=u.id if u.role == "student" else None,
        )

    def _catalog(self) -> CatalogInput:
        try:
            return load_catalog(self.db)
        except RuntimeError as e:
            raise AppError(ErrorCode.CONFLICT, str(e)) from e

    # ------------------------------------------------------------ auth
    def register(self, req: RegisterRequest) -> AuthResult:
        if req.role is Role.ADMIN:
            raise AppError(ErrorCode.FORBIDDEN, "Admins cannot self-register")
        if req.role is Role.STUDENT and req.date_of_birth is None:
            raise AppError(
                ErrorCode.VALIDATION_ERROR, "Students must give a date of birth (for parental consent)"
            )
        email = req.email.lower()
        if self.db.scalar(select(im.User).where(im.User.email == email)):
            raise AppError(ErrorCode.CONFLICT, "An account with this email already exists")
        u = im.User(
            email=email,
            password_hash=hash_password(req.password),
            full_name=req.full_name,
            role=req.role.value,
            date_of_birth=req.date_of_birth,
            preferred_language=req.preferred_language,
        )
        self.db.add(u)
        self.db.flush()
        self._audit(u.id, "user.register", "user", u.id)
        return AuthResult(user=self._user_out(u), tokens=self._tokens(u))

    def login(self, req: LoginRequest) -> AuthResult:
        u = self.db.scalar(
            select(im.User).where(im.User.email == req.email.lower(), im.User.deleted_at.is_(None))
        )
        if u and u.locked_until and _aware(u.locked_until) > _utcnow():
            raise AppError(ErrorCode.RATE_LIMITED, "Too many failed attempts; try again in a few minutes")
        if u is None or not verify_password(req.password, u.password_hash):
            if u:
                u.failed_logins += 1
                if u.failed_logins >= LOCKOUT_AFTER:
                    u.locked_until = _utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
                    u.failed_logins = 0
                self.db.commit()
            raise AppError(ErrorCode.UNAUTHORIZED, "Wrong email or password")
        u.failed_logins = 0
        u.locked_until = None
        return AuthResult(user=self._user_out(u), tokens=self._tokens(u))

    def refresh(self, req: RefreshRequest) -> TokenPair:
        row = self.db.scalar(
            select(im.RefreshToken).where(im.RefreshToken.token_hash == sha256(req.refresh_token))
        )
        if row is None or _aware(row.expires_at) < _utcnow():
            raise AppError(ErrorCode.UNAUTHORIZED, "Invalid or expired refresh token")
        if row.revoked_at is not None:
            # Reuse of a rotated token means it may have been stolen: revoke the whole family.
            self.db.execute(
                update(im.RefreshToken)
                .where(im.RefreshToken.token_family == row.token_family)
                .values(revoked_at=_utcnow())
                .execution_options(synchronize_session=False)
            )
            self.db.commit()
            raise AppError(ErrorCode.UNAUTHORIZED, "Refresh token reuse detected; please sign in again")
        row.revoked_at = _utcnow()
        return self._tokens(self._user(row.user_id), family=row.token_family)

    def me(self, p: Principal) -> UserOut:
        return self._user_out(self._user(p.user_id))

    # ------------------------------------------------------------ profiles
    def _profile_out(self, row: sm.StudentProfile) -> StudentProfileOut:
        filled = [
            row.board,
            row.stream,
            row.pincode,
            row.city,
            row.languages,
            row.interests,
            row.recent_score_pct,
        ]
        return StudentProfileOut(
            student_id=row.user_id,
            user_id=row.user_id,
            grade=row.grade,
            board=row.board,
            stream=row.stream,
            pincode=row.pincode,
            city=row.city,
            state=row.state,
            languages=row.languages,
            interests=row.interests,
            extracurriculars=row.extracurriculars,
            recent_score_pct=row.recent_score_pct,
            preferred_regions=row.preferred_regions,
            willing_to_relocate=row.willing_to_relocate,
            willing_abroad=row.willing_abroad,
            region_code=row.region_code,
            completeness=round(sum(1 for f in filled if f) / len(filled), 2),
            updated_at=row.updated_at,
        )

    def get_student_profile(self, p: Principal) -> StudentProfileOut:
        row = self.db.scalar(select(sm.StudentProfile).where(sm.StudentProfile.user_id == p.user_id))
        if row is None:
            raise AppError(ErrorCode.NOT_FOUND, "Profile not set up yet")
        return self._profile_out(row)

    def put_student_profile(self, p: Principal, body: StudentProfileIn) -> StudentProfileOut:
        row = self.db.scalar(select(sm.StudentProfile).where(sm.StudentProfile.user_id == p.user_id))
        values = body.model_dump()
        values["region_code"] = region_for_pincode(self.db, body.pincode)
        if row is None:
            row = sm.StudentProfile(user_id=p.user_id, **values)
            self.db.add(row)
        else:
            for k, v in values.items():
                setattr(row, k, v)
        self.db.flush()
        return self._profile_out(row)

    # ------------------------------------------------------------ family
    def _family_out(self, family_id: str) -> FamilyOut:
        fam = self.db.get(im.Family, family_id)
        members = [
            FamilyMember(
                user_id=m.user_id,
                full_name=self._user(m.user_id).full_name,
                role=Role(self._user(m.user_id).role),
                relation=m.relation,
                joined_at=m.created_at,
            )
            for m in self._family_members(family_id)
        ]
        has_fin = (
            self.db.scalar(
                select(func.count())
                .select_from(sm.FamilyFinance)
                .where(sm.FamilyFinance.family_id == family_id)
            )
            > 0
        )
        has_pref = (
            self.db.scalar(
                select(func.count())
                .select_from(sm.ParentCareerPreference)
                .where(sm.ParentCareerPreference.family_id == family_id)
            )
            > 0
        )
        return FamilyOut(
            id=fam.id, name=fam.name, members=members, has_finance=has_fin, has_parent_preferences=has_pref
        )

    def create_family(self, p: Principal) -> FamilyOut:
        if self._family_link(p.user_id):
            raise AppError(ErrorCode.CONFLICT, "You already belong to a family")
        u = self._user(p.user_id)
        fam = im.Family(name=f"{u.full_name.split()[-1]} family", created_by=u.id)
        self.db.add(fam)
        self.db.flush()
        self.db.add(
            im.FamilyLink(
                family_id=fam.id,
                user_id=u.id,
                member_role="student" if u.role == "student" else "parent",
                relation="self" if u.role == "student" else "parent",
            )
        )
        self.db.flush()
        return self._family_out(fam.id)

    def get_my_family(self, p: Principal) -> FamilyOut:
        link = self._family_link(p.user_id)
        if link is None:
            raise AppError(ErrorCode.NOT_FOUND, "You are not in a family yet; create one or join with a code")
        return self._family_out(link.family_id)

    def create_invite(self, p: Principal) -> InviteOut:
        link = self._family_link(p.user_id)
        if link is None:
            raise AppError(ErrorCode.CONFLICT, "Create a family first")
        code = new_invite_code()
        expires = _utcnow() + timedelta(days=7)
        self.db.add(
            im.FamilyInvite(
                family_id=link.family_id,
                code_hash=sha256(code),
                created_by=p.user_id,
                max_uses=3,
                expires_at=expires,
            )
        )
        return InviteOut(invite_code=code, family_id=link.family_id, expires_at=expires, max_uses=3)

    def join_family(self, p: Principal, req: JoinFamilyRequest) -> FamilyOut:
        if self._family_link(p.user_id):
            raise AppError(ErrorCode.CONFLICT, "You already belong to a family")
        inv = self.db.scalar(
            select(im.FamilyInvite).where(im.FamilyInvite.code_hash == sha256(req.invite_code))
        )
        if inv is None:
            raise AppError(ErrorCode.NOT_FOUND, "Invite code not found")
        # Atomic: only succeeds while uses < max_uses and the code has not expired.
        claimed = self.db.execute(
            update(im.FamilyInvite)
            .where(
                im.FamilyInvite.id == inv.id,
                im.FamilyInvite.uses < im.FamilyInvite.max_uses,
                im.FamilyInvite.expires_at > _utcnow(),
            )
            .values(uses=im.FamilyInvite.uses + 1)
            .execution_options(synchronize_session=False)
        )
        if claimed.rowcount != 1:
            raise AppError(ErrorCode.CONFLICT, "This invite code has expired or been used up")
        u = self._user(p.user_id)
        self.db.add(
            im.FamilyLink(
                family_id=inv.family_id,
                user_id=u.id,
                member_role="student"
                if u.role == "student"
                else ("guardian" if req.relation == "guardian" else "parent"),
                relation=req.relation,
            )
        )
        self.db.flush()
        self._audit(u.id, "family.join", "family", inv.family_id)
        return self._family_out(inv.family_id)

    def _check_family(self, p: Principal, family_id: str) -> None:
        if p.family_id != family_id:
            raise AppError(ErrorCode.FORBIDDEN, "Not your family")

    def _current_finance(self, family_id: str) -> sm.FamilyFinance | None:
        return self.db.scalar(
            select(sm.FamilyFinance).where(
                sm.FamilyFinance.family_id == family_id, sm.FamilyFinance.is_current.is_(True)
            )
        )

    def _finance_out(self, f: sm.FamilyFinance) -> FamilyFinanceOut:
        return FamilyFinanceOut(
            income_band=f.income_band,
            annual_income=f.annual_income,
            income_growth_rate=f.income_growth_rate,
            allocatable_savings=f.allocatable_savings,
            existing_debt_emi=f.existing_debt_emi,
            dependents=f.dependents,
            max_affordable_emi=f.max_affordable_emi,
            loan_tolerance=f.loan_tolerance,
            risk_appetite=f.risk_appetite,
            relocation_willingness=f.relocation_willingness,
            abroad_willingness=f.abroad_willingness,
            time_to_earn_years=f.time_to_earn_years,
            prestige_vs_stability=f.prestige_vs_stability,
            preferred_regions=f.preferred_regions,
            family_id=f.family_id,
            updated_by=f.updated_by or "",
            updated_at=f.updated_at,
        )

    def get_finance(self, p: Principal, family_id: str) -> FamilyFinanceOut | FamilyFinanceSummary:
        self._check_family(p, family_id)
        f = self._current_finance(family_id)
        if f is None:
            raise AppError(ErrorCode.NOT_FOUND, "No family budget yet")
        if p.role is Role.STUDENT and not self._consent(
            p.user_id, ConsentType.SHARE_RAW_FINANCE_WITH_STUDENT
        ):
            income = f.annual_income or INCOME_BAND_MIDPOINT[f.income_band]
            comfort = "modest" if income < 500_000 else "moderate" if income < 1_500_000 else "comfortable"
            return FamilyFinanceSummary(
                family_id=family_id,
                budget_comfort=comfort,
                open_to_loans=f.loan_tolerance >= 0.4,
                open_to_relocation=f.relocation_willingness >= 0.5,
                open_to_abroad=f.abroad_willingness >= 0.5,
            )
        return self._finance_out(f)

    def put_finance(self, p: Principal, family_id: str, body: FamilyFinanceIn) -> FamilyFinanceOut:
        self._check_family(p, family_id)
        if p.role is Role.STUDENT:
            raise AppError(ErrorCode.FORBIDDEN, "Only a linked parent or guardian can edit family finances")
        prev = self._current_finance(family_id)
        version = (prev.version + 1) if prev else 1
        if prev:
            prev.is_current = False
            self.db.flush()
        row = sm.FamilyFinance(
            family_id=family_id, version=version, is_current=True, updated_by=p.user_id, **body.model_dump()
        )
        self.db.add(row)
        self.db.flush()
        self._audit(p.user_id, "finance.update", "family", family_id, {"version": version})
        return self._finance_out(row)

    def get_preferences(self, p: Principal, family_id: str) -> ParentPreferencesOut:
        self._check_family(p, family_id)
        rows = list(
            self.db.scalars(
                select(sm.ParentCareerPreference)
                .where(sm.ParentCareerPreference.family_id == family_id)
                .order_by(sm.ParentCareerPreference.rank)
            )
        )
        if not rows:
            raise AppError(ErrorCode.NOT_FOUND, "No preferences yet")
        return ParentPreferencesOut(
            preferences=[
                RankedPreference(rank=r.rank, career_id=r.career_id, domain=r.domain, note=r.note)
                for r in rows
            ],
            family_id=family_id,
            parent_user_id=rows[0].parent_user_id,
            updated_at=rows[0].updated_at,
        )

    def put_preferences(
        self, p: Principal, family_id: str, body: ParentPreferencesIn
    ) -> ParentPreferencesOut:
        self._check_family(p, family_id)
        if p.role is Role.STUDENT:
            raise AppError(ErrorCode.FORBIDDEN, "Only a parent or guardian can set parent preferences")
        for r in list(
            self.db.scalars(
                select(sm.ParentCareerPreference).where(
                    sm.ParentCareerPreference.family_id == family_id,
                    sm.ParentCareerPreference.parent_user_id == p.user_id,
                )
            )
        ):
            self.db.delete(r)
        self.db.flush()
        for pref in body.preferences:
            career_id = pref.career_id
            if career_id and self.db.get(cm.Career, career_id) is None:
                career_id = self.db.scalar(select(cm.Career.id).where(cm.Career.slug == career_id))
                if career_id is None:
                    raise AppError(ErrorCode.VALIDATION_ERROR, f"Unknown career '{pref.career_id}'")
            self.db.add(
                sm.ParentCareerPreference(
                    family_id=family_id,
                    parent_user_id=p.user_id,
                    rank=pref.rank,
                    career_id=career_id,
                    domain=None if career_id else pref.domain,
                    note=pref.note,
                )
            )
        self.db.flush()
        return self.get_preferences(p, family_id)

    def create_consent(self, p: Principal, body: ConsentIn) -> ConsentOut:
        subject = self._user(body.subject_user_id)
        link = None
        if body.consent_type is ConsentType.MINOR_DATA_PROCESSING:
            if p.role is not Role.PARENT:
                raise AppError(ErrorCode.FORBIDDEN, "Only a parent or guardian can give consent for a minor")
            link = self._family_link(p.user_id)
            subject_link = self._family_link(subject.id)
            if not link or not subject_link or link.family_id != subject_link.family_id:
                raise AppError(ErrorCode.FORBIDDEN, "You must be linked to this student's family first")
        elif body.subject_user_id != p.user_id and p.role is not Role.PARENT:
            raise AppError(ErrorCode.FORBIDDEN, "You can only change consent about your own data")
        row = im.ConsentRecord(
            subject_user_id=subject.id,
            granted_by=p.user_id,
            granted_by_link_id=link.id if link else None,
            consent_type=body.consent_type.value,
            granted=body.granted,
        )
        self.db.add(row)
        self.db.flush()
        self._audit(
            p.user_id,
            "consent.record",
            "user",
            subject.id,
            {"type": body.consent_type.value, "granted": body.granted},
        )
        return ConsentOut(
            consent_type=body.consent_type,
            subject_user_id=subject.id,
            granted=body.granted,
            id=row.id,
            granted_by=p.user_id,
            granted_at=row.created_at,
            revoked_at=None if body.granted else row.created_at,
        )

    def list_consents(self, p: Principal) -> list[ConsentOut]:
        subjects = {p.user_id, *self._students_of(p)}
        rows = self.db.scalars(
            select(im.ConsentRecord)
            .where(im.ConsentRecord.subject_user_id.in_(subjects))
            .order_by(im.ConsentRecord.created_at)
        )
        return [
            ConsentOut(
                consent_type=ConsentType(r.consent_type),
                subject_user_id=r.subject_user_id,
                granted=r.granted,
                id=r.id,
                granted_by=r.granted_by,
                granted_at=r.created_at,
                revoked_at=None if r.granted else r.created_at,
            )
            for r in rows
        ]

    # ------------------------------------------------------------ assessment
    def list_instruments(self) -> list[Instrument]:
        return assessment.instruments(get_bank())

    def get_questions(self, code: str) -> list[Question]:
        return assessment.public_questions(get_bank(), code)

    def submit(self, p: Principal, code: str, body: SubmitAnswersRequest) -> SubmitResult:
        self._require_processing_consent(p.user_id)
        inst = self.db.scalar(select(am.AssessmentInstrument).where(am.AssessmentInstrument.code == code))
        if inst is None:
            raise AppError(ErrorCode.NOT_FOUND, f"Unknown instrument '{code}'")
        if body.client_submission_id:
            prior = self.db.scalar(
                select(am.AssessmentSubmission).where(
                    am.AssessmentSubmission.student_user_id == p.user_id,
                    am.AssessmentSubmission.client_submission_id == body.client_submission_id,
                )
            )
            if prior is not None:
                return self._submission_out(prior, code)
        result = assessment.score_submission(get_bank(), code, body.answers)
        sub = am.AssessmentSubmission(
            student_user_id=p.user_id,
            instrument_id=inst.id,
            client_submission_id=body.client_submission_id,
            flags=result.flags,
            answered=result.answered,
        )
        self.db.add(sub)
        self.db.flush()
        qids = {
            q.public_id: q.id
            for q in self.db.scalars(select(am.Question).where(am.Question.instrument_id == inst.id))
        }
        for a in body.answers:
            self.db.add(
                am.Response(
                    submission_id=sub.id,
                    question_id=qids[a.question_id],
                    instrument_id=inst.id,
                    value=a.value,
                    response_ms=a.response_ms,
                )
            )
        for t in result.scored:
            self.db.add(
                am.TraitScore(
                    submission_id=sub.id,
                    student_user_id=p.user_id,
                    dimension=t.dimension,
                    raw=t.raw,
                    normalized=t.normalized,
                    reliability=t.reliability,
                    answered=t.answered,
                    imputed=t.imputed,
                )
            )
        self.db.flush()
        return result.model_copy(update={"submission_id": sub.id})

    def _submission_out(self, sub: am.AssessmentSubmission, code: str) -> SubmitResult:
        traits = self.db.scalars(select(am.TraitScore).where(am.TraitScore.submission_id == sub.id))
        inst = get_bank().instrument(code)
        return SubmitResult(
            instrument_code=code,
            submission_id=sub.id,
            answered=sub.answered,
            total_items=len(inst.items) if inst else sub.answered,
            scored=[
                TraitScore(
                    dimension=t.dimension,
                    raw=t.raw,
                    normalized=t.normalized,
                    reliability=t.reliability,
                    answered=t.answered,
                    imputed=t.imputed,
                )
                for t in traits
            ],
            flags=sub.flags,
            submitted_at=sub.created_at,
        )

    def _latest_traits(self, student_id: str) -> dict[str, am.TraitScore]:
        rows = self.db.scalars(
            select(am.TraitScore)
            .where(am.TraitScore.student_user_id == student_id)
            .order_by(am.TraitScore.created_at)
        )
        latest: dict[str, am.TraitScore] = {}
        for r in rows:
            latest[r.dimension] = r
        return latest

    def get_traits(self, p: Principal, student_id: str) -> TraitProfile:
        sid = self._student_for(p, student_id)
        if p.role is Role.PARENT and not self._consent(sid, ConsentType.SHARE_RAW_ANSWERS_WITH_PARENT):
            raise AppError(
                ErrorCode.CONSENT_REQUIRED,
                "The student has not chosen to share their trait profile",
                {"consent_type": ConsentType.SHARE_RAW_ANSWERS_WITH_PARENT.value},
            )
        latest = self._latest_traits(sid)
        vec = pm.build_vector(
            {
                d: pm.DimensionResult(
                    d, t.raw, t.normalized, t.reliability, t.answered, t.answered, t.imputed
                )
                for d, t in latest.items()
            }
        )
        codes = {
            c
            for (c,) in self.db.execute(
                select(am.AssessmentInstrument.code)
                .join(
                    am.AssessmentSubmission,
                    am.AssessmentSubmission.instrument_id == am.AssessmentInstrument.id,
                )
                .where(am.AssessmentSubmission.student_user_id == sid)
            )
        }
        return TraitProfile(
            student_id=sid,
            vector_spec_version="vec-1",
            vector=vec.vector,
            traits=[
                TraitScore(
                    dimension=d,
                    raw=latest[d].raw,
                    normalized=latest[d].normalized,
                    percentile=None,
                    reliability=latest[d].reliability,
                    answered=latest[d].answered,
                    imputed=latest[d].imputed,
                )
                if d in latest
                else TraitScore(
                    dimension=d, raw=3.0, normalized=0.5, reliability=0.0, answered=0, imputed=True
                )
                for d in DIMENSIONS
            ],
            completeness=vec.completeness,
            instruments_completed=sorted(codes),
            top_riasec_code=pm.holland_code(vec.vector),
        )

    # ------------------------------------------------------------ analysis inputs
    def _student_input(self, sid: str) -> StudentInput:
        latest = self._latest_traits(sid)
        if not latest:
            raise AppError(
                ErrorCode.CONFLICT, "Take at least one questionnaire section before running an analysis"
            )
        vec = pm.build_vector(
            {
                d: pm.DimensionResult(
                    d, t.raw, t.normalized, t.reliability, t.answered, t.answered, t.imputed
                )
                for d, t in latest.items()
            }
        )
        prof = self.db.scalar(select(sm.StudentProfile).where(sm.StudentProfile.user_id == sid))
        flags = tuple(
            sorted(
                {
                    f
                    for s in self.db.scalars(
                        select(am.AssessmentSubmission).where(am.AssessmentSubmission.student_user_id == sid)
                    )
                    for f in s.flags
                }
            )
        )
        return StudentInput(
            student_id=sid,
            vector=vec.vector,
            reliability={d: (latest[d].reliability if d in latest else 0.0) for d in DIMENSIONS},
            imputed=tuple(vec.imputed),
            completeness=vec.completeness,
            grade=prof.grade if prof else 12,
            region_code=prof.region_code if prof else None,
            state=prof.state if prof else None,
            willing_to_relocate=prof.willing_to_relocate if prof else 0.5,
            willing_abroad=prof.willing_abroad if prof else 0.2,
            preferred_regions=tuple(prof.preferred_regions) if prof else (),
            recent_score_pct=prof.recent_score_pct if prof else None,
            quality_flags=flags,
        )

    def _family_input(self, sid: str) -> tuple[FamilyInput, str | None, list[str]]:
        warnings: list[str] = []
        link = self._family_link(sid)
        fin = self._current_finance(link.family_id) if link else None
        if fin is None:
            warnings.append(
                "No family budget yet: affordability uses a placeholder (Rs 6 lakh income, Rs 2 lakh "
                "savings). Results will change once a parent adds real figures."
            )
            base = PLACEHOLDER_FAMILY
        else:
            base = FamilyInput(
                family_id=fin.family_id,
                annual_income=fin.annual_income or INCOME_BAND_MIDPOINT[fin.income_band],
                income_growth=fin.income_growth_rate,
                savings=fin.allocatable_savings,
                existing_emi=fin.existing_debt_emi,
                dependents=fin.dependents,
                max_emi=fin.max_affordable_emi,
                loan_tolerance=fin.loan_tolerance,
                risk_appetite=fin.risk_appetite,
                relocation=fin.relocation_willingness,
                abroad=fin.abroad_willingness,
                time_to_earn_years=fin.time_to_earn_years,
                prestige_vs_stability=fin.prestige_vs_stability,
                preferred_regions=tuple(fin.preferred_regions),
                finance_version=fin.version,
            )
        prefs: list[Preference] = []
        if link:
            rows = self.db.scalars(
                select(sm.ParentCareerPreference)
                .where(sm.ParentCareerPreference.family_id == link.family_id)
                .order_by(sm.ParentCareerPreference.rank)
            )
            # Two parents' lists are merged with a Borda count (rank 1 of 10 scores 10 points).
            points: Counter[tuple[str | None, str | None]] = Counter()
            for r in rows:
                points[(r.career_id, r.domain)] += 11 - r.rank
            prefs = [
                Preference(rank=i, career_id=c, domain=d)
                for i, ((c, d), _) in enumerate(
                    sorted(points.items(), key=lambda kv: (-kv[1], str(kv[0]))), 1
                )
            ]
        if not prefs:
            warnings.append("Parents have not ranked any careers yet; family alignment is neutral.")
        return (
            replace(base, family_id=link.family_id if link else None, preferences=tuple(prefs)),
            fin.id if fin else None,
            warnings,
        )

    def _persist(
        self,
        run: AnalysisRun,
        st: StudentInput,
        fam: FamilyInput,
        cfg: ScoringConfig,
        requested_by: str,
        finance_id: str | None,
    ) -> None:
        self.db.add(
            om.AnalysisRunRow(
                id=run.run_id,
                student_user_id=st.student_id,
                family_id=fam.family_id,
                requested_by=requested_by,
                family_finance_id=finance_id,
                scoring_config_version=cfg.version,
                dataset_version=run.reproducibility.dataset_version,
                kind=run.kind,
                parent_run_id=run.parent_run_id,
                engine_version=run.reproducibility.engine_version,
                input_hash=run.reproducibility.input_hash,
                input_snapshot={"student": asdict(st), "family": asdict(fam), "config": asdict(cfg)},
                output=run.model_dump(mode="json"),
                conflict_index=run.conflict.index,
                robustness_score=run.sensitivity.robustness_score if run.sensitivity else None,
                duration_ms=run.duration_ms,
            )
        )
        self.db.flush()
        for r in run.recommendations:
            rec_id = str(uuid.uuid4())
            self.db.add(
                om.RecommendationRow(
                    id=rec_id,
                    run_id=run.run_id,
                    career_id=r.career.id,
                    pathway_id=r.financial.pathway_id,
                    rank=r.rank,
                    final_score=r.final_score,
                    confidence=r.confidence,
                    affordability_class=r.financial.affordability_class.value,
                    buckets=[b.value for b in r.buckets],
                )
            )
            self.db.flush()
            for c in r.contributions:
                self.db.add(
                    om.RecommendationBreakdown(
                        recommendation_id=rec_id,
                        component=c.component.value,
                        raw_value=c.raw_value,
                        weight=c.weight,
                        contribution=c.contribution,
                    )
                )
        self.db.add(
            om.ConflictReportRow(
                run_id=run.run_id,
                index=run.conflict.index,
                band=run.conflict.band.value,
                dimensions=[d.model_dump(mode="json") for d in run.conflict.dimensions],
            )
        )
        self.db.flush()

    def _run_now(
        self,
        st: StudentInput,
        fam: FamilyInput,
        cfg: ScoringConfig,
        *,
        kind: str = "baseline",
        parent: str | None = None,
        warnings: list[str] | None = None,
    ) -> AnalysisRun:
        run = run_analysis(
            st,
            fam,
            self._catalog(),
            today=today(),
            now=_utcnow(),
            cfg=cfg,
            kind=kind,
            parent_run_id=parent,
            run_id=str(uuid.uuid4()),
        )
        if warnings:
            run = run.model_copy(
                update={
                    "data_quality": run.data_quality.model_copy(
                        update={"warnings": [*run.data_quality.warnings, *warnings]}
                    )
                }
            )
        return run

    def _view(self, run: AnalysisRun, p: Principal) -> AnalysisRun:
        latest = self._catalog().dataset_version
        repro = run.reproducibility.model_copy(
            update={
                "latest_dataset_version": latest,
                "is_outdated": run.reproducibility.dataset_version != latest,
            }
        )
        run = run.model_copy(update={"reproducibility": repro})
        if p.role is Role.STUDENT:
            run = run.model_copy(update={"conflict": conflict_engine.student_view(run.conflict)})
            if not self._consent(p.user_id, ConsentType.SHARE_RAW_FINANCE_WITH_STUDENT):
                run = hide_family_money(run)
        elif p.role is Role.EDUCATOR:
            run = hide_family_money(run)  # counsellors need the affordability class, not the family's money
        return run

    def _load_run(self, p: Principal, run_id: str) -> tuple[om.AnalysisRunRow, AnalysisRun]:
        row = self.db.get(om.AnalysisRunRow, run_id)
        if row is None:
            raise AppError(ErrorCode.NOT_FOUND, "Analysis run not found", {"run_id": run_id})
        if row.student_user_id not in self._students_of(p):
            raise AppError(ErrorCode.FORBIDDEN, "You cannot see this run")
        return row, AnalysisRun.model_validate(row.output)

    @staticmethod
    def _inputs(row: om.AnalysisRunRow) -> tuple[StudentInput, FamilyInput, ScoringConfig]:
        s = dict(row.input_snapshot["student"])
        for k in ("imputed", "preferred_regions", "quality_flags"):
            s[k] = tuple(s[k])
        f = dict(row.input_snapshot["family"])
        f["preferences"] = tuple(Preference(**x) for x in f["preferences"])
        f["preferred_regions"] = tuple(f["preferred_regions"])
        return StudentInput(**s), FamilyInput(**f), ScoringConfig(**row.input_snapshot["config"])

    # ------------------------------------------------------------ analysis
    def create_run(self, p: Principal, req: AnalysisRunRequest) -> AnalysisRun:
        sid = self._student_for(p, req.student_id)
        self._require_processing_consent(sid)
        st = self._student_input(sid)
        fam, finance_id, warnings = self._family_input(sid)
        run = self._run_now(st, fam, DEFAULT_CONFIG, warnings=warnings)
        self._persist(run, st, fam, DEFAULT_CONFIG, p.user_id, finance_id)
        self._audit(p.user_id, "run.create", "analysis_run", run.run_id)
        return self._view(run, p)

    def get_run(self, p: Principal, run_id: str) -> AnalysisRun:
        return self._view(self._load_run(p, run_id)[1], p)

    def list_runs(
        self, p: Principal, student_id: str | None, page: int, page_size: int
    ) -> Page[AnalysisRunSummary]:
        sids = [self._student_for(p, student_id)] if student_id else self._students_of(p)
        q = select(om.AnalysisRunRow).where(om.AnalysisRunRow.student_user_id.in_(sids))
        total = self.db.scalar(select(func.count()).select_from(q.subquery()))
        rows = self.db.scalars(
            q.order_by(om.AnalysisRunRow.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
        items = []
        for r in rows:
            top = r.output["recommendations"][0] if r.output["recommendations"] else None
            items.append(
                AnalysisRunSummary(
                    run_id=r.id,
                    student_id=r.student_user_id,
                    kind=r.kind,
                    created_at=r.created_at,
                    top_career=top["career"]["name"] if top else "",
                    top_score=top["final_score"] if top else 0.0,
                    conflict_index=r.conflict_index,
                    scoring_config_version=r.scoring_config_version,
                )
            )
        return Page(items=items, page=page, page_size=page_size, total=total or 0)

    def compare(self, p: Principal, run_a: str, run_b: str) -> RunComparison:
        return compare_runs(self.get_run(p, run_a), self.get_run(p, run_b))

    def what_if(self, p: Principal, run_id: str, req: WhatIfRequest) -> WhatIfResult:
        row, base = self._load_run(p, run_id)
        st, fam, cfg = self._inputs(row)
        st2, fam2, cfg2 = apply_overrides(st, fam, cfg, req.overrides)
        new = self._run_now(st2, fam2, cfg2, kind="what_if", parent=run_id)
        self._persist(new, st2, fam2, cfg2, p.user_id, row.family_finance_id)
        self.db.add(
            om.WhatIfRun(
                result_run_id=new.run_id,
                baseline_run_id=run_id,
                label=req.label,
                overrides=req.overrides.model_dump(mode="json"),
            )
        )
        new_v = self._view(new, p)
        return WhatIfResult(
            baseline_run_id=run_id,
            what_if_run_id=new.run_id,
            label=req.label,
            overrides=req.overrides,
            comparison=compare_runs(self._view(base, p), new_v),
            new_top=[
                BucketItem(
                    career_id=r.career.id,
                    career_name=r.career.name,
                    score=r.final_score,
                    reason=r.explanation[0],
                )
                for r in new_v.recommendations[:3]
            ],
        )

    def get_conflict(self, p: Principal, run_id: str) -> ConflictReport:
        return self.get_run(p, run_id).conflict

    def get_swot(self, p: Principal, run_id: str, career_id: str | None) -> SwotReport:
        row, run = self._load_run(p, run_id)
        run = self._view(run, p)
        return swot_for(run, self._inputs(row)[0], self._catalog(), career_id)

    def get_roadmap(self, p: Principal, run_id: str, career_id: str | None) -> Roadmap:
        row, run = self._load_run(p, run_id)
        run = self._view(run, p)
        return roadmap_for(run, self._inputs(row)[0], self._catalog(), career_id, today())

    # ------------------------------------------------------------ catalog
    def _career(self, career_id: str) -> CareerDetail:
        for c in self._catalog().careers:
            if career_id in (c.id, c.slug):
                return c
        raise AppError(ErrorCode.NOT_FOUND, "Career not found", {"career_id": career_id})

    def list_careers(
        self, sector: str | None, steam_tag: str | None, q: str | None, page: int, page_size: int
    ) -> Page[CareerSummary]:
        rows = [
            CareerSummary(**c.model_dump(include=set(CareerSummary.model_fields)))
            for c in self._catalog().careers
        ]
        if sector:
            rows = [r for r in rows if r.sector == sector]
        if steam_tag:
            rows = [r for r in rows if steam_tag.upper() in r.steam_tags]
        if q:
            rows = [r for r in rows if q.lower() in r.name.lower()]
        start = (page - 1) * page_size
        return Page(items=rows[start : start + page_size], page=page, page_size=page_size, total=len(rows))

    def get_career(self, career_id: str) -> CareerDetail:
        return self._career(career_id)

    def get_alternatives(self, career_id: str) -> list[CareerAlternative]:
        c = self._career(career_id)
        cat = self._catalog()
        by_id = {x.id: x for x in cat.careers}
        from app.services.analysis import _ref

        return [
            CareerAlternative(
                career=_ref(by_id[e.to_id]),
                skill_overlap=e.skill_overlap,
                transition_difficulty=e.transition_difficulty,
                interdisciplinary=by_id[e.to_id].sector != c.sector,
                why=e.why,
            )
            for e in cat.edges
            if e.from_id == c.id and e.to_id in by_id
        ]

    def list_regions(self) -> list[Region]:
        return sorted(self._catalog().regions.values(), key=lambda r: r.code)

    def market_trends(self, region_code: str, sector: str | None) -> MarketTrends:
        cat = self._catalog()
        region = cat.regions.get(region_code)
        if region is None:
            raise AppError(ErrorCode.NOT_FOUND, "Region not found", {"region_code": region_code})
        signals = [
            s
            for s in cat.signals
            if s.region_code == region_code and (not sector or s.career.sector == sector)
        ]
        sectors: dict[str, list[float]] = {}
        for s in signals:
            sectors.setdefault(s.career.sector, []).append(s.demand_index)
        return MarketTrends(
            region=region,
            period=signals[0].period if signals else "",
            sector_summary={k: round(sum(v) / len(v), 3) for k, v in sectors.items()},
            top_rising=sorted(signals, key=lambda s: -s.job_velocity)[:5],
            most_disrupted=sorted(signals, key=lambda s: -s.disruption_risk)[:5],
            signals=signals,
            is_live=adzuna_adapter().enabled,
        )

    def list_pathways(
        self, career_id: str | None, max_annual_cost: int | None, page: int, page_size: int
    ) -> Page[Pathway]:
        rows = self._catalog().pathways
        if career_id:
            cid = self._career(career_id).id
            rows = [r for r in rows if cid in r.career_ids]
        if max_annual_cost is not None:
            rows = [
                r
                for r in rows
                if r.tuition_per_year + r.hostel_per_year + r.living_per_year + r.misc_per_year
                <= max_annual_cost
            ]
        start = (page - 1) * page_size
        return Page(items=rows[start : start + page_size], page=page, page_size=page_size, total=len(rows))

    def list_exams(self, career_id: str | None, upcoming_only: bool) -> list[Exam]:
        rows = list(self._catalog().exams.values())
        if career_id:
            cid = self._career(career_id).id
            rows = [r for r in rows if cid in r.career_ids]
        if upcoming_only:
            rows = [
                r
                for r in rows
                if any((s.exam_end or s.exam_start or date.min) >= today() for s in r.sessions)
            ]
        return sorted(rows, key=lambda e: e.next_window_start or date.max)

    def list_scholarships(
        self, p: Principal, eligible_only: bool, career_id: str | None
    ) -> list[ScholarshipMatch]:
        facts: dict = {}
        sids = self._students_of(p)
        if sids:
            st = self.db.scalar(select(sm.StudentProfile).where(sm.StudentProfile.user_id == sids[0]))
            link = self._family_link(sids[0])
            fin = self._current_finance(link.family_id) if link else None
            if st:
                facts |= {"recent_score_pct": st.recent_score_pct, "state": st.state, "grade": st.grade}
            if fin:
                facts["annual_income"] = fin.annual_income or INCOME_BAND_MIDPOINT[fin.income_band]
        out = []
        for s in self._catalog().scholarships:
            verdict, checks = eligibility.evaluate(s.eligibility_rules, facts)
            total = sum(s.year_amounts) if s.year_amounts else s.amount_per_year * s.max_years
            out.append(
                ScholarshipMatch(
                    scholarship=s,
                    eligible=verdict,
                    checks=checks,
                    expected_value=int(total * s.probability) if verdict is not False else 0,
                )
            )
        if eligible_only:
            out = [m for m in out if m.eligible is not False]
        return sorted(out, key=lambda m: (-m.expected_value, m.scholarship.name))

    def local_opportunities(self, pincode: str) -> list[LocalOpportunity]:
        cat = self._catalog()
        district = cat.district_of_pincode.get(pincode)
        region = region_for_pincode(self.db, pincode)
        exact = [o for o in cat.local_opportunities if pincode in o.pincodes]
        same_district = [
            o for o in cat.local_opportunities if o not in exact and district and o.district == district
        ]
        same_region = [
            o
            for o in cat.local_opportunities
            if o not in exact and o not in same_district and region and o.region_code == region
        ]
        return exact + same_district + same_region

    # ------------------------------------------------------------ admin / system
    def admin_analytics(self) -> AdminAnalytics:
        def rows(stmt) -> tuple[list[CountRow], int]:
            data = [(str(k), int(n)) for k, n in self.db.execute(stmt)]
            kept = [
                CountRow(key=k, count=n) for k, n in sorted(data, key=lambda x: -x[1]) if n >= K_ANONYMITY
            ]
            return kept, len(data) - len(kept)

        latest = select(om.AnalysisRunRow.id).where(om.AnalysisRunRow.kind == "baseline")
        top, s1 = rows(
            select(cm.Career.name, func.count())
            .join(om.RecommendationRow, om.RecommendationRow.career_id == cm.Career.id)
            .where(om.RecommendationRow.rank == 1, om.RecommendationRow.run_id.in_(latest))
            .group_by(cm.Career.name)
        )
        afford, s2 = rows(
            select(om.RecommendationRow.affordability_class, func.count())
            .where(om.RecommendationRow.run_id.in_(latest))
            .group_by(om.RecommendationRow.affordability_class)
        )
        bands, s3 = rows(select(om.ConflictReportRow.band, func.count()).group_by(om.ConflictReportRow.band))
        region, s4 = rows(
            select(sm.StudentProfile.region_code, func.count()).group_by(sm.StudentProfile.region_code)
        )
        durations = sorted(d for (d,) in self.db.execute(select(om.AnalysisRunRow.duration_ms)))
        return AdminAnalytics(
            generated_at=_utcnow(),
            k_anonymity_threshold=K_ANONYMITY,
            students_total=self.db.scalar(
                select(func.count()).select_from(im.User).where(im.User.role == "student")
            ),
            families_linked=self.db.scalar(select(func.count()).select_from(im.Family)),
            runs_total=self.db.scalar(select(func.count()).select_from(om.AnalysisRunRow)),
            median_run_ms=durations[len(durations) // 2] if durations else 0.0,
            top_recommended_careers=top,
            affordability_class_distribution=afford,
            conflict_band_distribution=bands,
            riasec_code_distribution=[],
            region_distribution=region,
            suppressed_groups=s1 + s2 + s3 + s4,
        )

    def data_refresh(self, req: DataRefreshRequest, actor: str | None = None) -> RefreshResult:
        started = _utcnow()
        warnings: list[str] = []
        counts: dict[str, dict[str, int]] = {}
        status = "completed"
        if req.dry_run:
            report = loader.validate(loader.read_bundle(), today())
            warnings = [f"{i.severity}: {i.dataset}/{i.key}: {i.message}" for i in report.issues]
            status = "dry_run"
        elif req.source == "seed":
            res = loader.load(self.db, today(), source="seed")
            status, warnings = res["status"], res.get("errors", []) + res["warnings"]
            counts = {
                k: {"inserted": v, "updated": 0, "skipped": 0} for k, v in res.get("counts", {}).items()
            }
            invalidate()
        elif req.source == "csv":
            from app.etl.market_csv import import_market_csv

            res = import_market_csv(self.db, today())
            status, warnings, counts = res["status"], res["warnings"], res["counts"]
            invalidate()
        else:
            feed = adzuna_adapter()
            if not feed.enabled:
                status = "failed"
                warnings.append(
                    "Adzuna feed disabled: set ADZUNA_APP_ID and ADZUNA_APP_KEY, or use source 'csv'."
                )
            else:
                careers = list(self.db.scalars(select(cm.Career)))
                cities = [
                    (r.code, r.name)
                    for r in self.db.scalars(select(cm.Region).where(cm.Region.country == "India"))
                ]
                queries = plan_queries(
                    [(c.slug, c.search_keywords) for c in careers],
                    cities,
                    get_settings().adzuna_daily_budget,
                    today().toordinal(),
                )
                result = feed.fetch(queries, today(), get_settings().adzuna_daily_budget)
                from app.etl.market_csv import API_SOURCE, store_counts

                res = store_counts(
                    self.db, [(pc, API_SOURCE, None) for pc in result.counts], today(), "adzuna"
                )
                status = res["status"] if result.counts else "failed"
                counts = res["counts"]
                warnings += res["warnings"]
                invalidate()
                warnings += result.errors
        self.db.add(
            om.DataRefreshJob(
                triggered_by=actor,
                source=req.source,
                status=status,
                counts=counts,
                warnings=warnings[:50],
                finished_at=_utcnow(),
            )
        )
        return RefreshResult(
            job_id=str(uuid.uuid4()),
            status=status,
            source=req.source,
            counts=counts,
            warnings=warnings,
            started_at=started,
            finished_at=_utcnow(),
        )

    def _quality_catalog(self) -> quality.Catalog:
        cat = self._catalog()
        slug = {c.id: c.slug for c in cat.careers}
        return quality.Catalog(
            market_signals=cat.signals,
            salary_bands=[(slug[cid], b) for cid, bands in cat.salaries.items() for b in bands],
            pathways=cat.pathways,
            exams=list(cat.exams.values()),
            scholarships=cat.scholarships,
            local_opportunities=cat.local_opportunities,
        )

    def data_status(self) -> DataStatus:
        return build_data_status(
            quality.audit(self._quality_catalog(), today()), self._catalog().dataset_version
        )

    def methodology(self) -> Methodology:
        return build_methodology(quality.audit(self._quality_catalog(), today()))

    # ------------------------------------------------------------ compat (team aliases)
    def compat_login(self, req: CompatLoginRequest) -> CompatLoginResponse:
        r = self.login(LoginRequest(email=req.email, password=req.password))
        return CompatLoginResponse(
            access_token=r.tokens.access_token,
            refresh_token=r.tokens.refresh_token,
            user_id=r.user.id,
            role=r.user.role.value,
        )

    def compat_create_user(self, req: CompatUserCreate) -> CompatUser:
        role = Role(req.role) if req.role in {r.value for r in Role} - {"admin"} else Role.PARENT
        dob = date(2008, 1, 1) if role is Role.STUDENT else None
        r = self.register(
            RegisterRequest(
                email=req.email, password=req.password, full_name=req.name, role=role, date_of_birth=dob
            )
        )
        return CompatUser(id=r.user.id, name=r.user.full_name, email=r.user.email, role=r.user.role.value)

    def compat_get_user(self, user_id: str) -> CompatUser:
        u = self._user(user_id)
        return CompatUser(id=u.id, name=u.full_name, email=u.email, role=u.role)

    def compat_predict(self, req: CompatPredictRequest) -> CompatPredictResponse:
        uid = req.student_id or req.user_id
        if not uid:
            raise AppError(ErrorCode.VALIDATION_ERROR, "user_id or student_id is required in live mode")
        p = self.principal(uid)
        run = self.create_run(p, AnalysisRunRequest(student_id=uid))
        from app.ml.predictor import predict_domain_fit

        top = run.recommendations[0]
        return CompatPredictResponse(
            id=run.run_id,
            score=round(100 * top.final_score, 1),
            result=top.career.name,
            confidence=top.confidence,
            domain_scores=predict_domain_fit(run.student_vector)["scores"],
        )

    def compat_result(self, result_id: str) -> CompatResult:
        row = self.db.get(om.AnalysisRunRow, result_id)
        if row is None:
            raise AppError(ErrorCode.NOT_FOUND, "Result not found", {"id": result_id})
        run = AnalysisRun.model_validate(row.output)
        from app.ml.predictor import predict_domain_fit

        top = run.recommendations[0]
        return CompatResult(
            id=run.run_id,
            score=round(100 * top.final_score, 1),
            result=top.career.name,
            confidence=top.confidence,
            domain_scores=predict_domain_fit(run.student_vector)["scores"],
            top_careers=[
                {"career": r.career.name, "score": round(100 * r.final_score, 1)}
                for r in run.recommendations[:5]
            ],
        )

    # ------------------------------------------------------------ demo support
    def demo_ids(self) -> dict[str, tuple[str, str | None]]:
        from app.mocks import demo_families as df

        out = {}
        for f in df.FAMILIES:
            uid = self.db.scalar(select(im.User.id).where(im.User.email == df.student_email(f["key"])))
            if uid:
                run = self.db.scalar(
                    select(om.AnalysisRunRow.id)
                    .where(om.AnalysisRunRow.student_user_id == uid, om.AnalysisRunRow.kind == "baseline")
                    .order_by(om.AnalysisRunRow.created_at.desc())
                    .limit(1)
                )
                out[f["key"]] = (uid, run)
        return out

    def demo_context(self) -> dict:
        ids = self.demo_ids()
        key = "creative_risk_averse"
        if key not in ids or ids[key][1] is None:
            raise AppError(
                ErrorCode.CONFLICT, "Demo families are not seeded; run scripts/seed.py or POST /demo/reset"
            )
        sid, run_id = ids[key]
        row = self.db.get(om.AnalysisRunRow, run_id)
        return {"run": AnalysisRun.model_validate(row.output), "student_id": sid, "family_id": row.family_id}

    def demo_reset(self) -> int:
        from scripts.seed import seed_demo  # local import: the seed script owns demo content

        return seed_demo(self.db, reset=True)
