# PRISM Engine — API Contract (v1)

- Live, always-current schema: **`GET /docs`** (Swagger) and **`GET /openapi.json`**; a frozen copy is in
  `backend/contracts/openapi.json`.
- Example response for every endpoint (exactly what MOCK_MODE returns): `backend/contracts/fixtures/<name>.json`.
- All `/api/v1` responses use the envelope `{success, data, error, meta}` — see `ARCHITECTURE.md §3`.
- Auth: `Authorization: Bearer <access_token>` (JWT, 30 min) + refresh token (14 days, rotated).
  In MOCK_MODE auth is not enforced; send `X-Mock-Role: parent|student|educator|admin` to switch views.
- Pagination: `?page=1&page_size=20` → `data = {items, page, page_size, total}`.

## Endpoints

| Method | Path | Request body | `data` | Who | Fixture |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/register` | RegisterRequest | AuthResult | public | — |
| POST | `/api/v1/auth/login` | LoginRequest | AuthResult | public | `auth_login` |
| POST | `/api/v1/auth/refresh` | RefreshRequest | TokenPair | public | — |
| GET | `/api/v1/auth/me` | — | UserOut | any | `auth_me` |
| GET | `/api/v1/students/me/profile` | — | StudentProfileOut | student | `student_profile` |
| PUT | `/api/v1/students/me/profile` | StudentProfileIn | StudentProfileOut | student | — |
| GET | `/api/v1/students/{student_id}/traits` | — | TraitProfile | student; parent with consent | `student_traits` |
| POST | `/api/v1/families` | — | FamilyOut | any | — |
| GET | `/api/v1/families/me` | — | FamilyOut | member | `family_me` |
| POST | `/api/v1/families/invites` | — | InviteOut | member | `family_invite` |
| POST | `/api/v1/families/join` | JoinFamilyRequest | FamilyOut | any | — |
| GET | `/api/v1/families/{family_id}/finance` | — | FamilyFinanceOut (parent) / FamilyFinanceSummary (student) | member | `family_finance_parent_view`, `family_finance_student_view` |
| PUT | `/api/v1/families/{family_id}/finance` | FamilyFinanceIn | FamilyFinanceOut | parent | — |
| GET | `/api/v1/families/{family_id}/preferences` | — | ParentPreferencesOut | parent | `parent_preferences` |
| PUT | `/api/v1/families/{family_id}/preferences` | ParentPreferencesIn | ParentPreferencesOut | parent | — |
| POST | `/api/v1/consents` | ConsentIn | ConsentOut | any | — |
| GET | `/api/v1/consents` | — | ConsentOut[] | any | `consents` |
| GET | `/api/v1/assessments/instruments` | — | Instrument[] | any | `assessment_instruments` |
| GET | `/api/v1/assessments/{code}/questions` | — | Question[] | any | `assessment_questions_riasec` |
| POST | `/api/v1/assessments/{code}/submit` | SubmitAnswersRequest | SubmitResult | student | `assessment_submit` |
| POST | `/api/v1/analysis/runs` | AnalysisRunRequest | AnalysisRun | member | `analysis_run_parent_view` |
| GET | `/api/v1/analysis/runs` | — | Page[AnalysisRunSummary] | member | `analysis_runs_list` |
| GET | `/api/v1/analysis/runs/{run_id}` | — | AnalysisRun | member | `analysis_run_student_view` |
| GET | `/api/v1/analysis/compare?run_a=&run_b=` | — | RunComparison | member | `analysis_compare` |
| POST | `/api/v1/analysis/runs/{run_id}/what-if` | WhatIfRequest | WhatIfResult | member | `analysis_what_if` |
| GET | `/api/v1/analysis/runs/{run_id}/conflict` | — | ConflictReport (full / summary by role) | member | `conflict_parent_view`, `conflict_student_view` |
| GET | `/api/v1/analysis/runs/{run_id}/swot?career_id=` | — | SwotReport | member | `swot` |
| GET | `/api/v1/analysis/runs/{run_id}/roadmap?career_id=` | — | Roadmap | member | `roadmap` |
| GET | `/api/v1/careers?sector=&steam_tag=&q=` | — | Page[CareerSummary] | public | `careers_list` |
| GET | `/api/v1/careers/{id_or_slug}` | — | CareerDetail | public | `career_detail` |
| GET | `/api/v1/careers/{id_or_slug}/alternatives` | — | CareerAlternative[] | public | `career_alternatives` |
| GET | `/api/v1/regions` | — | Region[] | public | `regions` |
| GET | `/api/v1/market/trends?region_code=&sector=` | — | MarketTrends | public | `market_trends` |
| GET | `/api/v1/pathways?career_id=&max_annual_cost=` | — | Page[Pathway] | public | `pathways` |
| GET | `/api/v1/exams?career_id=&upcoming_only=` | — | Exam[] | public | `exams` |
| GET | `/api/v1/scholarships?eligible_only=&career_id=` | — | ScholarshipMatch[] | any | `scholarships` |
| GET | `/api/v1/local-opportunities?pincode=` | — | LocalOpportunity[] | public | `local_opportunities` |
| GET | `/api/v1/admin/analytics` | — | AdminAnalytics (k-anonymised) | admin | `admin_analytics` |
| POST | `/api/v1/admin/data/refresh` | DataRefreshRequest | RefreshResult | admin | `admin_refresh` |
| GET | `/api/v1/system/health` | — | Health | public | `system_health` |
| GET | `/api/v1/system/methodology` | — | Methodology | public | `system_methodology` |
| GET | `/api/v1/demo/personas` | — | DemoPersona[] | public, DEMO_MODE only | `demo_personas` |
| GET | `/api/v1/demo/walkthrough` | — | DemoWalkthrough (scripted steps + presenter lines) | public, DEMO_MODE only | `demo_walkthrough` |
| POST | `/api/v1/demo/reset` | — | DemoResetResult | public, DEMO_MODE only | `demo_reset` |

### Team alias routes (bare JSON on success)

| Method | Path | Body | Returns | Fixture |
|---|---|---|---|---|
| POST | `/api/login` | `{email, password}` | `{access_token, refresh_token, token_type, user_id, role}` | `compat_login` |
| POST | `/api/users` | `{name, email, password, role}` | `{id, name, email, role}` | — |
| GET | `/api/users/{id}` | — | `{id, name, email, role}` | `compat_get_user` |
| POST | `/api/predict` | `{user_id?, student_id?, vector?}` | `{id, score (0-100), result, confidence (0-1), domain_scores}` | `compat_predict` |
| GET | `/api/results/{id}` | — | predict payload + `top_careers` | `compat_result` |

## Key examples

**Request — run an analysis**
```json
POST /api/v1/analysis/runs
{ "student_id": "132394f2-e097-5d31-8e5b-bfa2fade9b38",
  "options": { "top_k": 10, "include_sensitivity": true } }
```

**Response — one recommendation (abridged from `analysis_run_parent_view.json`)**
```json
{
  "rank": 1,
  "career": { "id": "…", "slug": "data-scientist", "name": "Data Scientist", "sector": "computing_ai", "steam_tags": ["S","T","M"] },
  "final_score": 0.771, "confidence": 0.78, "ci_low": 0.711, "ci_high": 0.831,
  "contributions": [
    { "component": "fit",              "raw_value": 0.86, "weight": 0.30, "contribution": 0.258 },
    { "component": "market",           "raw_value": 0.84, "weight": 0.15, "contribution": 0.126 },
    { "component": "affordability",    "raw_value": 1.0,  "weight": 0.20, "contribution": 0.2 },
    { "component": "roi",              "raw_value": 0.78, "weight": 0.15, "contribution": 0.117 },
    { "component": "family_alignment", "raw_value": 0.55, "weight": 0.15, "contribution": 0.0825 },
    { "component": "disruption",       "raw_value": 0.25, "weight": 0.05, "contribution": -0.0125 }
  ],
  "financial": {
    "pathway_name": "B.Tech Computer Science (Data Science)",
    "institution_name": "Government College of Technology, Coimbatore",
    "total_cost": 608325, "family_funds": 940000, "scholarship_expected": 30000,
    "loan_capacity": 908000, "loan_required": 0, "monthly_emi": 0, "funding_gap": 0,
    "affordability": 1.0, "affordability_class": "comfortable",
    "roi": { "npv_earnings_premium": "…", "roi_ratio": "…", "roi_norm": 0.78, "payback_years": "…" }
  },
  "family": { "student_fit": 0.86, "parent_acceptance": 0.55, "bridge_score": 0.6709 },
  "buckets": ["best_overall", "best_for_student"],
  "explanation": ["Strong match on …", "B.Tech … is comfortable for your family …", "Demand outlook 84% …"]
}
```

**Request — what-if**
```json
POST /api/v1/analysis/runs/{run_id}/what-if
{ "label": "Add savings + accept loan",
  "overrides": { "allocatable_savings": 1400000, "loan_tolerance": 0.7, "weights": { "affordability": 0.25 } } }
```
→ `data.comparison.deltas[]` gives per-career `base_rank → new_rank`, `score_delta`, and
`base_class → new_class`; `rank_correlation` is Kendall τ between the two rankings.

**Error**
```json
{ "success": false, "data": null,
  "error": { "code": "NOT_FOUND", "message": "Analysis run not found", "details": { "run_id": "unknown" } },
  "meta": { "request_id": "…", "version": "v1/0.1.0", "mock": false } }
```

## Privacy matrix

| Data | Student | Parent | Educator | Admin |
|---|---|---|---|---|
| Student raw answers | ✅ | only with `share_raw_answers_with_parent` consent | ❌ | ❌ |
| Student trait scores | ✅ | aggregate in runs | ✅ (linked) | ❌ |
| Family raw finances | `FamilyFinanceSummary` only (unless `share_raw_finance_with_student`) | ✅ | ❌ | ❌ |
| Conflict report | `visibility=summary` (gentle, no per-dimension gaps) | `visibility=full` | full | ❌ |
| Analytics | ❌ | ❌ | ❌ | k-anonymised aggregates only |
