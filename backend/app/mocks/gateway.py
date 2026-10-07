"""MOCK_MODE implementation of the PrismGateway protocol. Every method returns the exact
schema the live implementation returns, built from the fixture world."""

from datetime import UTC, date, datetime, timedelta

from app.assessment import service as assessment
from app.assessment.bank import get_bank
from app.core.clock import today as clock_today
from app.core.config import ENGINE_VERSION, get_settings
from app.core.dimensions import DIMENSION_GROUP, DIMENSION_LABELS, DIMENSIONS, VECTOR_SPEC_VERSION
from app.core.errors import AppError, ErrorCode
from app.engine.compare import compare as compare_runs
from app.engine.config import DEFAULT_CONFIG, ScoringConfig
from app.engine.types import FamilyInput, StudentInput
from app.etl import quality
from app.etl.adapters.adzuna import AdzunaAdapter, plan_queries
from app.etl.sources import DATASETS, SOURCES
from app.ml.predictor import predict_domain_fit
from app.mocks import builders as b
from app.mocks import persona
from app.mocks import world as w
from app.schemas.admin import AdminAnalytics, CountRow, DataRefreshRequest, RefreshResult
from app.schemas.analysis import (
    AnalysisRun,
    AnalysisRunRequest,
    AnalysisRunSummary,
    BucketItem,
    ConflictReport,
    RunComparison,
    WhatIfOverrides,
    WhatIfRequest,
    WhatIfResult,
)
from app.schemas.assessment import (
    Instrument,
    Question,
    SubmitAnswersRequest,
    SubmitResult,
    TraitProfile,
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
from app.schemas.reports import (
    Roadmap,
    SwotReport,
)
from app.schemas.system import (
    DataIssue,
    DatasetStatus,
    DataSourceInfo,
    DataStatus,
    FeedStatus,
    Formula,
    Methodology,
)
from app.services.analysis import apply_overrides, roadmap_for, swot_for
from app.services.principal import Principal

MOCK_ACCESS = "mock.access.token"
MOCK_REFRESH = "mock.refresh.token"


def _tokens() -> TokenPair:
    return TokenPair(access_token=MOCK_ACCESS, refresh_token=MOCK_REFRESH, expires_in=1800)


def _paginate(items: list, page: int, page_size: int) -> Page:
    start = (page - 1) * page_size
    return Page(items=items[start : start + page_size], page=page, page_size=page_size, total=len(items))


class MockGateway:
    mock = True

    # ------------------------------------------------------------ auth
    def _user(self, role: Role) -> UserOut:
        if role is Role.PARENT:
            return UserOut(
                id=w.PARENT_USER_ID,
                email=w.PARENT["email"],
                full_name=w.PARENT["full_name"],
                role=Role.PARENT,
                is_minor=False,
                consent_status="not_required",
                family_id=w.FAMILY_ID,
                created_at=w.NOW,
            )
        return UserOut(
            id=w.STUDENT_USER_ID,
            email=w.STUDENT["email"],
            full_name=w.STUDENT["full_name"],
            role=role,
            is_minor=role is Role.STUDENT,
            consent_status="granted" if role is Role.STUDENT else "not_required",
            family_id=w.FAMILY_ID,
            created_at=w.NOW,
        )

    def register(self, req: RegisterRequest) -> AuthResult:
        if req.role is Role.ADMIN:
            raise AppError(ErrorCode.FORBIDDEN, "Admins cannot self-register")
        user = self._user(req.role).model_copy(update={"email": req.email, "full_name": req.full_name})
        return AuthResult(user=user, tokens=_tokens())

    def login(self, req: LoginRequest) -> AuthResult:
        role = Role.PARENT if req.email.startswith("parent") else Role.STUDENT
        return AuthResult(user=self._user(role), tokens=_tokens())

    def refresh(self, req: RefreshRequest) -> TokenPair:
        if not req.refresh_token:
            raise AppError(ErrorCode.UNAUTHORIZED, "Invalid refresh token")
        return _tokens()

    def me(self, p: Principal) -> UserOut:
        return self._user(p.role)

    # ------------------------------------------------------------ profiles
    def get_student_profile(self, p: Principal) -> StudentProfileOut:
        s = w.STUDENT
        return StudentProfileOut(
            student_id=w.STUDENT_ID,
            user_id=w.STUDENT_USER_ID,
            grade=s["grade"],
            board=s["board"],
            stream=s["stream"],
            pincode=s["pincode"],
            city=s["city"],
            state=s["state"],
            languages=s["languages"],
            interests=s["interests"],
            extracurriculars=s["extracurriculars"],
            recent_score_pct=s["recent_score_pct"],
            preferred_regions=["IN-TN-CBE", "IN-KA-BLR", "IN-TG-HYD"],
            willing_to_relocate=0.7,
            willing_abroad=0.3,
            region_code=s["region_code"],
            completeness=0.95,
            updated_at=w.NOW,
        )

    def put_student_profile(self, p: Principal, body: StudentProfileIn) -> StudentProfileOut:
        return StudentProfileOut(
            **body.model_dump(),
            student_id=w.STUDENT_ID,
            user_id=w.STUDENT_USER_ID,
            region_code="IN-TN-CBE" if body.pincode.startswith("64") else None,
            completeness=0.95,
            updated_at=w.NOW,
        )

    # ------------------------------------------------------------ family
    def _family(self) -> FamilyOut:
        return FamilyOut(
            id=w.FAMILY_ID,
            name="Raman family",
            members=[
                FamilyMember(
                    user_id=w.STUDENT_USER_ID,
                    full_name=w.STUDENT["full_name"],
                    role=Role.STUDENT,
                    relation="self",
                    joined_at=w.NOW,
                ),
                FamilyMember(
                    user_id=w.PARENT_USER_ID,
                    full_name=w.PARENT["full_name"],
                    role=Role.PARENT,
                    relation="father",
                    joined_at=w.NOW,
                ),
            ],
            has_finance=True,
            has_parent_preferences=True,
        )

    def create_family(self, p: Principal) -> FamilyOut:
        return self._family()

    def get_my_family(self, p: Principal) -> FamilyOut:
        return self._family()

    def create_invite(self, p: Principal) -> InviteOut:
        return InviteOut(invite_code="PRSM7K2Q", family_id=w.FAMILY_ID, expires_at=w.NOW + timedelta(days=7))

    def join_family(self, p: Principal, req: JoinFamilyRequest) -> FamilyOut:
        return self._family()

    def get_finance(self, p: Principal, family_id: str) -> FamilyFinanceOut | FamilyFinanceSummary:
        if p.role is Role.STUDENT:
            return FamilyFinanceSummary(
                family_id=family_id,
                budget_comfort="moderate",
                open_to_loans=True,
                open_to_relocation=False,
                open_to_abroad=False,
            )
        return FamilyFinanceOut(
            **w.FINANCE, family_id=family_id, updated_by=w.PARENT_USER_ID, updated_at=w.NOW
        )

    def put_finance(self, p: Principal, family_id: str, body: FamilyFinanceIn) -> FamilyFinanceOut:
        if p.role is Role.STUDENT:
            raise AppError(ErrorCode.FORBIDDEN, "Only a linked parent or guardian can edit family finances")
        return FamilyFinanceOut(
            **body.model_dump(), family_id=family_id, updated_by=w.PARENT_USER_ID, updated_at=w.NOW
        )

    def get_preferences(self, p: Principal, family_id: str) -> ParentPreferencesOut:
        return ParentPreferencesOut(
            family_id=family_id,
            parent_user_id=w.PARENT_USER_ID,
            updated_at=w.NOW,
            preferences=[
                RankedPreference(
                    rank=1, career_id=w.sid("career", "doctor-mbbs"), note="Respected and stable"
                ),
                RankedPreference(rank=2, career_id=w.sid("career", "biomedical-engineer")),
                RankedPreference(rank=3, domain="engineering"),
            ],
        )

    def put_preferences(
        self, p: Principal, family_id: str, body: ParentPreferencesIn
    ) -> ParentPreferencesOut:
        if p.role is Role.STUDENT:
            raise AppError(ErrorCode.FORBIDDEN, "Only a parent or guardian can set parent preferences")
        return ParentPreferencesOut(
            **body.model_dump(), family_id=family_id, parent_user_id=w.PARENT_USER_ID, updated_at=w.NOW
        )

    def create_consent(self, p: Principal, body: ConsentIn) -> ConsentOut:
        return ConsentOut(
            **body.model_dump(),
            id=w.sid("consent", body.consent_type.value),
            granted_by=p.user_id,
            granted_at=w.NOW,
            revoked_at=None if body.granted else w.NOW,
        )

    def list_consents(self, p: Principal) -> list[ConsentOut]:
        return [
            ConsentOut(
                id=w.sid("consent", "minor"),
                consent_type=ConsentType.MINOR_DATA_PROCESSING,
                subject_user_id=w.STUDENT_USER_ID,
                granted=True,
                granted_by=w.PARENT_USER_ID,
                granted_at=w.NOW,
            )
        ]

    # ------------------------------------------------------------ assessment
    def list_instruments(self) -> list[Instrument]:
        return assessment.instruments(get_bank())

    def get_questions(self, code: str) -> list[Question]:
        return assessment.public_questions(get_bank(), code)

    def submit(self, p: Principal, code: str, body: SubmitAnswersRequest) -> SubmitResult:
        # Real validation and scoring, even in MOCK_MODE; only persistence is missing.
        return assessment.score_submission(get_bank(), code, body.answers)

    def get_traits(self, p: Principal, student_id: str) -> TraitProfile:
        return TraitProfile(
            student_id=student_id,
            vector_spec_version=VECTOR_SPEC_VERSION,
            vector=persona.VECTOR,
            traits=[persona.TRAITS[d] for d in DIMENSIONS],
            completeness=persona.COMPLETENESS,
            instruments_completed=list(persona.SUBMISSIONS),
            top_riasec_code=persona.HOLLAND_CODE,
        )

    # ------------------------------------------------------------ analysis
    # Runs are computed by the real engine (app/services/analysis.py) on fixture data, then kept in memory so
    # they can be fetched, compared and used as a what-if baseline. Live mode stores them in the database.
    def __init__(self) -> None:
        self._runs: dict[str, tuple[AnalysisRun, StudentInput, FamilyInput, ScoringConfig]] = {}

    def _remember(
        self, run: AnalysisRun, st: StudentInput, fam: FamilyInput, cfg: ScoringConfig
    ) -> AnalysisRun:
        self._runs[run.run_id] = (run, st, fam, cfg)
        return run

    def _baseline(self) -> AnalysisRun:
        if w.RUN_ID not in self._runs:
            self._remember(b.analysis_run(), b.student_input(), b.family_input(), DEFAULT_CONFIG)
        return self._runs[w.RUN_ID][0]

    def _demo_what_if(self) -> None:
        if w.WHATIF_RUN_ID not in self._runs:
            self._baseline()
            overrides = WhatIfOverrides(
                allocatable_savings=w.FINANCE["allocatable_savings"] + 800_000, loan_tolerance=0.7
            )
            st, fam, cfg = apply_overrides(b.student_input(), b.family_input(), DEFAULT_CONFIG, overrides)
            run = b.analysis_run(
                run_id=w.WHATIF_RUN_ID,
                kind="what_if",
                parent_run_id=w.RUN_ID,
                student=st,
                family=fam,
                cfg=cfg,
                created_offset_min=5,
            )
            self._remember(run, st, fam, cfg)

    def _view(self, run: AnalysisRun, p: Principal) -> AnalysisRun:
        if p.role is not Role.STUDENT:
            return run
        _, st, fam, cfg = self._runs[run.run_id]
        summary = b.run_analysis(
            st,
            fam,
            b.catalog_input(),
            today=w.TODAY,
            now=run.created_at,
            cfg=cfg,
            kind=run.kind,
            parent_run_id=run.parent_run_id,
            run_id=run.run_id,
            full_conflict=False,
        ).conflict
        return run.model_copy(update={"conflict": summary})

    def create_run(self, p: Principal, req: AnalysisRunRequest) -> AnalysisRun:
        return self._view(self._baseline(), p)

    def get_run(self, p: Principal, run_id: str) -> AnalysisRun:
        self._baseline()
        if run_id == w.WHATIF_RUN_ID:
            self._demo_what_if()
        if run_id not in self._runs:
            raise AppError(ErrorCode.NOT_FOUND, "Analysis run not found", {"run_id": run_id})
        return self._view(self._runs[run_id][0], p)

    def list_runs(
        self, p: Principal, student_id: str | None, page: int, page_size: int
    ) -> Page[AnalysisRunSummary]:
        self._baseline()
        self._demo_what_if()
        rows = [
            AnalysisRunSummary(
                run_id=run.run_id,
                student_id=run.student_id,
                kind=run.kind,
                created_at=run.created_at,
                top_career=run.recommendations[0].career.name,
                top_score=run.recommendations[0].final_score,
                conflict_index=run.conflict.index,
                scoring_config_version=run.reproducibility.scoring_config_version,
            )
            for run, *_ in sorted(self._runs.values(), key=lambda t: t[0].created_at)
        ]
        return _paginate(rows, page, page_size)

    def compare(self, p: Principal, run_a: str, run_b: str) -> RunComparison:
        return compare_runs(self.get_run(p, run_a), self.get_run(p, run_b))

    def what_if(self, p: Principal, run_id: str, req: WhatIfRequest) -> WhatIfResult:
        base = self.get_run(p, run_id)
        _, st, fam, cfg = self._runs[run_id]
        st2, fam2, cfg2 = apply_overrides(st, fam, cfg, req.overrides)
        new = b.analysis_run(
            run_id=None,
            kind="what_if",
            parent_run_id=run_id,
            student=st2,
            family=fam2,
            cfg=cfg2,
            created_offset_min=5,
        )
        self._remember(new, st2, fam2, cfg2)
        new = self._view(new, p)
        return WhatIfResult(
            baseline_run_id=run_id,
            what_if_run_id=new.run_id,
            label=req.label,
            overrides=req.overrides,
            comparison=compare_runs(base, new),
            new_top=[
                BucketItem(
                    career_id=r.career.id,
                    career_name=r.career.name,
                    score=r.final_score,
                    reason=r.explanation[0],
                )
                for r in new.recommendations[:3]
            ],
        )

    def get_conflict(self, p: Principal, run_id: str) -> ConflictReport:
        return self.get_run(p, run_id).conflict

    def get_swot(self, p: Principal, run_id: str, career_id: str | None) -> SwotReport:
        run = self.get_run(p, run_id)
        return swot_for(run, self._runs[run_id][1], b.catalog_input(), career_id)

    def get_roadmap(self, p: Principal, run_id: str, career_id: str | None) -> Roadmap:
        run = self.get_run(p, run_id)
        return roadmap_for(run, self._runs[run_id][1], b.catalog_input(), career_id, w.TODAY)

    # ------------------------------------------------------------ catalog
    def list_careers(
        self, sector: str | None, steam_tag: str | None, q: str | None, page: int, page_size: int
    ) -> Page[CareerSummary]:
        rows = [b.career_summary(c[0]) for c in w.CAREERS]
        if sector:
            rows = [r for r in rows if r.sector == sector]
        if steam_tag:
            rows = [r for r in rows if steam_tag.upper() in r.steam_tags]
        if q:
            rows = [r for r in rows if q.lower() in r.name.lower()]
        return _paginate(rows, page, page_size)

    def _slug(self, career_id: str) -> str:
        for c in w.CAREERS:
            if career_id in (c[0], w.sid("career", c[0])):
                return c[0]
        raise AppError(ErrorCode.NOT_FOUND, "Career not found", {"career_id": career_id})

    def get_career(self, career_id: str) -> CareerDetail:
        return b.career_detail(self._slug(career_id))

    def get_alternatives(self, career_id: str) -> list[CareerAlternative]:
        return b.alternatives(self._slug(career_id))

    def list_regions(self) -> list[Region]:
        return b.regions()

    def market_trends(self, region_code: str, sector: str | None) -> MarketTrends:
        region = next((r for r in b.regions() if r.code == region_code), None)
        if region is None:
            raise AppError(ErrorCode.NOT_FOUND, "Region not found", {"region_code": region_code})
        k = b.REGION_DEMAND_FACTOR.get(region.type.value, 0.8)
        signals = [b.market_signal(c[0], region_code, k) for c in w.CAREERS if not sector or c[2] == sector]
        sectors: dict[str, list[float]] = {}
        for s in signals:
            sectors.setdefault(s.career.sector, []).append(s.demand_index)
        return MarketTrends(
            region=region,
            period="2026-Q3",
            sector_summary={k2: round(sum(v) / len(v), 3) for k2, v in sectors.items()},
            top_rising=sorted(signals, key=lambda s: -s.job_velocity)[:3],
            most_disrupted=sorted(signals, key=lambda s: -s.disruption_risk)[:3],
            signals=signals,
            is_live=False,
        )

    def list_pathways(
        self, career_id: str | None, max_annual_cost: int | None, page: int, page_size: int
    ) -> Page[Pathway]:
        rows = [b.pathway(p[0]) for p in w.PATHWAYS]
        if career_id:
            cid = w.sid("career", self._slug(career_id))
            rows = [r for r in rows if cid in r.career_ids]
        if max_annual_cost is not None:
            rows = [
                r
                for r in rows
                if r.tuition_per_year + r.hostel_per_year + r.living_per_year + r.misc_per_year
                <= max_annual_cost
            ]
        return _paginate(rows, page, page_size)

    def list_exams(self, career_id: str | None, upcoming_only: bool) -> list[Exam]:
        rows = [b.exam(e[0]) for e in w.EXAMS]
        if career_id:
            cid = w.sid("career", self._slug(career_id))
            rows = [r for r in rows if cid in r.career_ids]
        if upcoming_only:
            rows = [r for r in rows if r.next_window_start and r.next_window_start >= w.TODAY]
        return sorted(rows, key=lambda e: e.next_window_start or date.max)

    def list_scholarships(
        self, p: Principal, eligible_only: bool, career_id: str | None
    ) -> list[ScholarshipMatch]:
        rows = [b.scholarship_match(s[0]) for s in w.SCHOLARSHIPS]
        if eligible_only:
            rows = [r for r in rows if r.eligible is not False]
        return sorted(rows, key=lambda r: -r.expected_value)

    def local_opportunities(self, pincode: str) -> list[LocalOpportunity]:
        rows = [b.local_opportunity(r) for r in w.LOCAL_OPPORTUNITIES]
        exact = [r for r in rows if pincode in r.pincodes]
        # Fall back to the whole district/region when no exact pincode match exists.
        return exact + [r for r in rows if r not in exact] if pincode.startswith("64") else []

    # ------------------------------------------------------------ admin / system
    def admin_analytics(self) -> AdminAnalytics:
        return AdminAnalytics(
            generated_at=w.NOW,
            k_anonymity_threshold=5,
            students_total=128,
            families_linked=97,
            runs_total=342,
            median_run_ms=138.0,
            top_recommended_careers=[
                CountRow(key="Data Scientist", count=41),
                CountRow(key="Biomedical Engineer", count=27),
                CountRow(key="Robotics & Automation Engineer", count=22),
            ],
            affordability_class_distribution=[
                CountRow(key=k, count=c)
                for k, c in (
                    ("comfortable", 158),
                    ("stretch", 71),
                    ("loan_dependent", 64),
                    ("infeasible", 49),
                )
            ],
            conflict_band_distribution=[
                CountRow(key=k, count=c)
                for k, c in (("aligned", 31), ("mild", 44), ("moderate", 36), ("high", 17))
            ],
            riasec_code_distribution=[
                CountRow(key=k, count=c) for k, c in (("IRA", 19), ("ISR", 14), ("RIC", 11))
            ],
            region_distribution=[
                CountRow(key=k, count=c) for k, c in (("IN-TN-CBE", 38), ("IN-TN-CHN", 33), ("IN-KA-BLR", 29))
            ],
            suppressed_groups=6,
        )

    def data_refresh(self, req: DataRefreshRequest) -> RefreshResult:
        started = datetime.now(UTC)
        counts = {d: {"inserted": 0, "updated": 0, "skipped": 0} for d in req.datasets}
        warnings = ["MOCK_MODE: nothing is written; the database arrives in Phase 1."]
        if req.source == "adapter":
            feed = adzuna_adapter()
            if not feed.enabled:
                warnings.append(
                    "Adzuna feed disabled: set ADZUNA_APP_ID and ADZUNA_APP_KEY to fetch live postings."
                )
            elif not req.dry_run:
                careers = list(w.CAREER_KEYWORDS.items())
                queries = plan_queries(careers, list(w.CITY_NAMES.items()), budget=len(careers), day_index=0)
                result = feed.fetch(queries, clock_today(), max_calls=len(queries))
                counts["market_signals"] = {
                    "fetched": len(result.counts),
                    "errors": len(result.errors),
                    "calls": result.calls,
                }
                warnings += result.errors
        report = quality.audit(b.catalog(), clock_today())
        warnings += [f"{i.severity}: {i.dataset}/{i.key}: {i.message}" for i in report.issues]
        return RefreshResult(
            job_id=w.sid("refresh", ",".join(req.datasets) + req.source),
            status="dry_run" if req.dry_run else ("failed" if report.errors else "completed"),
            source=req.source,
            counts=counts,
            warnings=warnings,
            started_at=started,
            finished_at=datetime.now(UTC),
        )

    def data_status(self) -> DataStatus:
        return build_data_status(quality.audit(b.catalog(), clock_today()), w.DATASET_VERSION)

    def methodology(self) -> Methodology:
        return build_methodology(
            sources_rows={"careers": len(w.CAREERS), "scholarships": len(w.SCHOLARSHIPS)}
        )

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
        return CompatUser(id=w.STUDENT_USER_ID, name=req.name, email=req.email, role=req.role)

    def compat_get_user(self, user_id: str) -> CompatUser:
        if user_id == w.PARENT_USER_ID:
            return CompatUser(id=user_id, name=w.PARENT["full_name"], email=w.PARENT["email"], role="parent")
        if user_id != w.STUDENT_USER_ID:
            raise AppError(ErrorCode.NOT_FOUND, "User not found", {"user_id": user_id})
        return CompatUser(id=user_id, name=w.STUDENT["full_name"], email=w.STUDENT["email"], role="student")

    def compat_predict(self, req: CompatPredictRequest) -> CompatPredictResponse:
        pred = predict_domain_fit(req.vector or persona.VECTOR)
        run = b.analysis_run()
        top = run.recommendations[0]
        return CompatPredictResponse(
            id=run.run_id,
            score=round(100 * top.final_score, 1),
            result=top.career.name,
            confidence=top.confidence,
            domain_scores=pred["scores"],
        )

    def compat_result(self, result_id: str) -> CompatResult:
        if result_id != w.RUN_ID:
            raise AppError(ErrorCode.NOT_FOUND, "Result not found", {"id": result_id})
        base = self.compat_predict(CompatPredictRequest())
        run = b.analysis_run()
        return CompatResult(
            **base.model_dump(),
            top_careers=[
                {"career": r.career.name, "score": round(100 * r.final_score, 1)}
                for r in run.recommendations[:5]
            ],
        )


def build_methodology(report: quality.AuditReport) -> Methodology:
    """Formulas, weights, data provenance and limitations; shared by mock and live modes."""
    return Methodology(
        engine_version=ENGINE_VERSION,
        vector_spec_version=VECTOR_SPEC_VERSION,
        dimensions=[
            {"key": d, "label": DIMENSION_LABELS[d], "group": DIMENSION_GROUP[d].value} for d in DIMENSIONS
        ],
        scoring_config_version=DEFAULT_CONFIG.version,
        weights=DEFAULT_CONFIG.weights,
        parameters={
            "education_inflation": DEFAULT_CONFIG.edu_inflation,
            "loan_rate": DEFAULT_CONFIG.loan_rate,
            "loan_tenor_months": DEFAULT_CONFIG.loan_tenor_months,
            "loan_moratorium_months": 12,
            "discount_rate": 0.08,
            "roi_horizon_years": 10,
            "ml_alpha": 0.5,
            "signal_half_life": "one update cycle of the source",
            "psychometric_min_coverage": 0.5,
            "norm_group_min_n": 200,
            "base_model_confidence": DEFAULT_CONFIG.base_model_confidence,
            "sensitivity_perturbation": 0.2,
            "conflict_bands": "aligned<20<=mild<40<=moderate<60<=high",
        },
        formulas=[
            Formula(
                name="fit",
                expression="fit = a*ml + (1-a)*(0.5*cos_c(S,C) + 0.5*(1 - ||W(S-C)||/||W||))",
                explanation="Centred cosine plus weighted distance in the 19-dim space; ML blended with alpha.",
            ),
            Formula(
                name="total_cost",
                expression="sum_{t=1..n} (tuition+hostel+living+misc) * (1+i_edu)^(t-1)",
                explanation="Inflation-adjusted cost of the full course.",
            ),
            Formula(
                name="family_funds",
                expression="F = savings + sum_t income*(1+g)^(t-1)*share(dependents, debt)",
                explanation="Money the family can direct to education over the course.",
            ),
            Formula(
                name="loan_capacity",
                expression="L = EMI_max * (1-(1+r)^-n)/r",
                explanation="Present value of the maximum affordable EMI (annuity formula).",
            ),
            Formula(
                name="affordability",
                expression="min(1, (F + S + loan_tolerance*L) / total_cost)",
                explanation="S = expected value of the best stack-compatible scholarship set.",
            ),
            Formula(
                name="roi",
                expression="NPV_10y(salary - baseline) / total_cost",
                explanation="Earnings premium over a baseline path, discounted, per rupee spent.",
            ),
            Formula(
                name="conflict_index",
                expression="100 * sum_k w_k * gap_k",
                explanation="Weighted parent-student gaps on 6 dimensions; bands aligned/mild/moderate/high.",
            ),
            Formula(
                name="final_score",
                expression="w_fit*fit + w_mkt*market + w_aff*afford + w_roi*roi + w_align*align - w_risk*disruption",
                explanation="Weights from the versioned scoring config; per-component contributions returned.",
            ),
            Formula(
                name="robustness",
                expression="mean Kendall tau(top-k base, top-k perturbed) over +/-20% weights",
                explanation="How stable the ranking is to reasonable changes in priorities.",
            ),
            Formula(
                name="likert_trait",
                expression="keyed = 6 - v if reverse else v;  trait = (mean(keyed) - 1) / 4",
                explanation="Agreement items, half of them reverse-worded where it matters, scored to 0-1.",
            ),
            Formula(
                name="aptitude_trait",
                expression="p = sum(w*correct)/sum(w), w = 1/1.5/2 by difficulty;  trait = max(0, (p - 1/4) / (3/4))",
                explanation="Difficulty-weighted accuracy corrected for guessing on four-option questions.",
            ),
            Formula(
                name="trait_reliability",
                expression="coverage * (0.5 + 0.5 * (1 - sd(keyed)/2)), then x0.5 straight-lining, x0.7 speeding, "
                "x0.6 contradiction",
                explanation="How much to trust one student's score on one trait; feeds recommendation confidence.",
            ),
            Formula(
                name="freshness",
                expression="fresh if age <= cadence, aging if <= 2*cadence, else stale; weight = 0.5^(age/half_life)",
                explanation="Data is judged against how often its publisher updates it, and older data counts less.",
            ),
            Formula(
                name="recommendation_confidence",
                expression="0.85 * (0.7 + 0.3*checked_share) * freshness_factor * (1 - imputation_penalty)",
                explanation="Confidence falls when the inputs behind a recommendation are unverified, stale or imputed.",
            ),
        ],
        data_sources=[
            DataSourceInfo(
                dataset=key,
                source_name=", ".join(SOURCES[x].name for x in DATASETS[key].sources),
                source_url=None,
                as_of=st.newest.isoformat() if st.newest else "",
                rows=st.rows,
                share_estimated=round(st.estimates / st.rows, 4) if st.rows else 1.0,
            )
            for key, st in report.stats.items()
        ],
        fairness_safeguards=[
            "Gender, caste, religion and community are never used as scoring or model features.",
            "Recommendations are explained per component so families can challenge any single factor.",
            "Admin analytics are k-anonymised (groups smaller than k=5 are suppressed).",
        ],
        privacy_rules=[
            "Parents see financial/aspiration inputs and aggregate results, not the student's raw answers.",
            "Students see their own traits and a gentle conflict summary, not raw family finances.",
            "Raw answers or raw finances are shared only with explicit, revocable consent.",
            "Minors need recorded parental consent before data processing.",
        ],
        limitations=[
            "Figures not yet checked against a published source are labelled as estimates wherever they appear; "
            "each recommendation reports its checked share in data_trust.",
            "Recommendations are computed live, but market data is only as current as its source: daily with the "
            "Adzuna feed enabled, otherwise the dated snapshot shown in /system/data-status.",
            "Psychometric items are original and have not yet been validated on a large Indian sample; "
            "percentiles stay empty until 200 students in a grade band have taken them.",
            "Career requirement profiles are expert priors until mapped to O*NET occupational data.",
        ],
    )


def adzuna_adapter() -> AdzunaAdapter:
    s = get_settings()
    return AdzunaAdapter(s.adzuna_app_id, s.adzuna_app_key)


def build_data_status(report: quality.AuditReport, dataset_version: str) -> DataStatus:
    """Shared by mock and live modes: the honest state of every dataset, feed and quality check."""
    today = clock_today()
    feed = adzuna_adapter()
    rows = []
    for key, st in report.stats.items():
        spec = DATASETS[key]
        live = feed.enabled and "adzuna" in spec.sources
        rows.append(
            DatasetStatus(
                dataset=key,
                label=spec.label,
                rows=st.rows,
                cadence_days=spec.cadence_days,
                oldest_as_of=st.oldest.isoformat() if st.oldest else None,
                newest_as_of=st.newest.isoformat() if st.newest else None,
                freshness=st.freshness.value,
                next_refresh_due=(st.newest + timedelta(days=1 if live else spec.cadence_days)).isoformat()
                if st.newest
                else None,
                verified=st.verified,
                secondary=st.secondary,
                unverified=st.unverified,
                disputed=st.disputed,
                checked_share=st.checked_share,
                errors=sum(1 for i in report.errors if i.dataset == key),
                warnings=sum(1 for i in report.warnings if i.dataset == key),
                sources=[SOURCES[s].name for s in spec.sources],
                live_feed=live,
            )
        )
    total = sum(st.rows for st in report.stats.values())
    checked = sum(st.verified + st.secondary for st in report.stats.values())
    share = round(checked / total, 4) if total else 0.0
    market = report.stats.get("market_signals")
    market_line = (
        "Job-posting demand refreshes daily from the Adzuna API."
        if feed.enabled
        else f"No live market feed is configured, so market data is the snapshot dated "
        f"{market.newest.isoformat() if market and market.newest else 'unknown'}."
    )
    statement = (
        f"Recommendations are recomputed on every request from dataset {dataset_version}. {market_line} "
        f"{checked} of {total} figures ({share:.0%}) are checked against published sources; the rest are "
        f"labelled as estimates wherever they appear."
    )
    feeds = [
        FeedStatus(
            key="adzuna",
            name=SOURCES["adzuna"].name,
            access="api",
            enabled=feed.enabled,
            detail="Daily posting counts per career and city"
            if feed.enabled
            else "Disabled: set ADZUNA_APP_ID and ADZUNA_APP_KEY",
        ),
        FeedStatus(
            key="data_gov_in",
            name=SOURCES["data_gov_in"].name,
            access="api",
            enabled=False,
            detail="No adapter yet; district indicators are loaded from downloads by the ETL",
        ),
    ]
    return DataStatus(
        generated_at=datetime.now(UTC),
        today=today.isoformat(),
        dataset_version=dataset_version,
        computed_live=True,
        overall_checked_share=share,
        statement=statement,
        datasets=rows,
        feeds=feeds,
        issues=[
            DataIssue(dataset=i.dataset, key=i.key, rule=i.rule, severity=i.severity, message=i.message)
            for i in report.issues
        ],
    )
