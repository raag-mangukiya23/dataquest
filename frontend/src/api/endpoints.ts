// One typed function per backend endpoint (see docs/API_CONTRACT.md). Screens call these, never fetch().
import { api, apiBlob } from './client'
import type * as T from './types'

const enc = encodeURIComponent

export const auth = {
  login: (email: string, password: string) => api<T.AuthResult>('POST', '/api/v1/auth/login', { body: { email, password } }),
  register: (body: T.RegisterRequest) => api<T.AuthResult>('POST', '/api/v1/auth/register', { body }),
  me: () => api<T.UserOut>('GET', '/api/v1/auth/me'),
}

export const profile = {
  get: () => api<T.StudentProfileOut>('GET', '/api/v1/students/me/profile'),
  put: (body: T.StudentProfileIn) => api<T.StudentProfileOut>('PUT', '/api/v1/students/me/profile', { body }),
  traits: (studentId: string) => api<T.TraitProfile>('GET', `/api/v1/students/${enc(studentId)}/traits`),
}

export const family = {
  create: () => api<T.FamilyOut>('POST', '/api/v1/families'),
  me: () => api<T.FamilyOut>('GET', '/api/v1/families/me'),
  invite: () => api<T.InviteOut>('POST', '/api/v1/families/invites'),
  join: (body: T.JoinFamilyRequest) => api<T.FamilyOut>('POST', '/api/v1/families/join', { body }),
  /** Parents get FamilyFinanceOut; students get FamilyFinanceSummary unless the family shared the figures. */
  finance: (familyId: string) =>
    api<T.FamilyFinanceOut | T.FamilyFinanceSummary>('GET', `/api/v1/families/${enc(familyId)}/finance`),
  putFinance: (familyId: string, body: T.FamilyFinanceIn) =>
    api<T.FamilyFinanceOut>('PUT', `/api/v1/families/${enc(familyId)}/finance`, { body }),
  preferences: (familyId: string) => api<T.ParentPreferencesOut>('GET', `/api/v1/families/${enc(familyId)}/preferences`),
  putPreferences: (familyId: string, body: T.ParentPreferencesIn) =>
    api<T.ParentPreferencesOut>('PUT', `/api/v1/families/${enc(familyId)}/preferences`, { body }),
}

export const consents = {
  list: () => api<T.ConsentOut[]>('GET', '/api/v1/consents'),
  create: (body: T.ConsentIn) => api<T.ConsentOut>('POST', '/api/v1/consents', { body }),
}

export const assessments = {
  instruments: () => api<T.Instrument[]>('GET', '/api/v1/assessments/instruments'),
  questions: (code: string) => api<T.Question[]>('GET', `/api/v1/assessments/${enc(code)}/questions`),
  submit: (code: string, body: T.SubmitAnswersRequest) =>
    api<T.SubmitResult>('POST', `/api/v1/assessments/${enc(code)}/submit`, { body }),
}

export const analysis = {
  create: (studentId: string, options?: T.RunOptions) =>
    api<T.AnalysisRun>('POST', '/api/v1/analysis/runs', { body: { student_id: studentId, ...(options ? { options } : {}) } }),
  list: (studentId?: string, page = 1, pageSize = 20) =>
    api<T.Page<T.AnalysisRunSummary>>('GET', '/api/v1/analysis/runs', {
      query: { student_id: studentId, page, page_size: pageSize },
    }),
  get: (runId: string) => api<T.AnalysisRun>('GET', `/api/v1/analysis/runs/${enc(runId)}`),
  compare: (runA: string, runB: string) =>
    api<T.RunComparison>('GET', '/api/v1/analysis/compare', { query: { run_a: runA, run_b: runB } }),
  whatIf: (runId: string, body: T.WhatIfRequest) =>
    api<T.WhatIfResult>('POST', `/api/v1/analysis/runs/${enc(runId)}/what-if`, { body }),
  conflict: (runId: string) => api<T.ConflictReport>('GET', `/api/v1/analysis/runs/${enc(runId)}/conflict`),
  swot: (runId: string, careerId?: string) =>
    api<T.SwotReport>('GET', `/api/v1/analysis/runs/${enc(runId)}/swot`, { query: { career_id: careerId } }),
  roadmap: (runId: string, careerId?: string) =>
    api<T.Roadmap>('GET', `/api/v1/analysis/runs/${enc(runId)}/roadmap`, { query: { career_id: careerId } }),
  narrative: (runId: string, lang: Lang = 'en') =>
    api<T.Narrative>('GET', `/api/v1/analysis/runs/${enc(runId)}/narrative`, { query: { lang } }),
  /** The printable family report (HTML). Open with openBlob(). */
  report: (runId: string, lang: Lang = 'en') => apiBlob(`/api/v1/analysis/runs/${enc(runId)}/report`, { lang }),
}

export type Lang = 'en' | 'ta' | 'hi'

export const deadlines = {
  list: (studentId: string, horizonDays = 365) =>
    api<T.Deadlines>('GET', `/api/v1/students/${enc(studentId)}/deadlines`, { query: { horizon_days: horizonDays } }),
  /** Calendar file (.ics). Download with openBlob(blob, 'prism-deadlines.ics'). */
  ics: (studentId: string) => apiBlob(`/api/v1/students/${enc(studentId)}/deadlines.ics`),
  remind: (studentId: string, body: T.ReminderRequest) =>
    api<T.ReminderPlan>('POST', `/api/v1/students/${enc(studentId)}/reminders`, { body }),
  mine: () => api<T.ReminderOut[]>('GET', '/api/v1/me/reminders'),
  cancelAll: () => api<{ cancelled: number }>('DELETE', '/api/v1/me/reminders'),
}

export const loans = {
  explain: (q: { amount: number; course_years?: number; annual_income?: number; institution_tier?: number; rate?: number }) =>
    api<T.LoanExplanation>('GET', '/api/v1/loans/explain', { query: q }),
}

export const outcomes = {
  create: (studentId: string, body: T.OutcomeIn) =>
    api<T.OutcomeOut>('POST', `/api/v1/students/${enc(studentId)}/outcomes`, { body }),
  list: (studentId: string) => api<T.OutcomeOut[]>('GET', `/api/v1/students/${enc(studentId)}/outcomes`),
  summary: () => api<T.OutcomeSummary>('GET', '/api/v1/admin/outcomes/summary'),
}

export const mentors = {
  list: (q: { career_id?: string; region_code?: string; pincode?: string } = {}) =>
    api<T.MentorDirectory>('GET', '/api/v1/mentors', { query: q }),
  create: (body: T.MentorIn) => api<T.MentorOut>('POST', '/api/v1/mentors', { body }),
}

export const educator = {
  dashboard: () => api<T.EducatorDashboard>('GET', '/api/v1/educator/dashboard'),
}

export const catalog = {
  careers: (q: { sector?: string; steam_tag?: string; q?: string; page?: number; page_size?: number } = {}) =>
    api<T.Page<T.CareerSummary>>('GET', '/api/v1/careers', { query: { page_size: 100, ...q } }),
  career: (idOrSlug: string) => api<T.CareerDetail>('GET', `/api/v1/careers/${enc(idOrSlug)}`),
  alternatives: (idOrSlug: string) => api<T.CareerAlternative[]>('GET', `/api/v1/careers/${enc(idOrSlug)}/alternatives`),
  regions: () => api<T.Region[]>('GET', '/api/v1/regions'),
  market: (regionCode: string, sector?: string) =>
    api<T.MarketTrends>('GET', '/api/v1/market/trends', { query: { region_code: regionCode, sector } }),
  pathways: (q: { career_id?: string; max_annual_cost?: number; page?: number; page_size?: number } = {}) =>
    api<T.Page<T.Pathway>>('GET', '/api/v1/pathways', { query: { page_size: 100, ...q } }),
  exams: (q: { career_id?: string; upcoming_only?: boolean } = {}) => api<T.Exam[]>('GET', '/api/v1/exams', { query: q }),
  scholarships: (q: { eligible_only?: boolean; career_id?: string } = {}) =>
    api<T.ScholarshipMatch[]>('GET', '/api/v1/scholarships', { query: q }),
  localOpportunities: (pincode: string) =>
    api<T.LocalOpportunity[]>('GET', '/api/v1/local-opportunities', { query: { pincode } }),
}

export const admin = {
  analytics: () => api<T.AdminAnalytics>('GET', '/api/v1/admin/analytics'),
  refresh: (body: T.DataRefreshRequest) => api<T.RefreshResult>('POST', '/api/v1/admin/data/refresh', { body }),
}

export const system = {
  health: () => api<T.Health>('GET', '/api/v1/system/health'),
  methodology: () => api<T.Methodology>('GET', '/api/v1/system/methodology'),
  dataStatus: () => api<T.DataStatus>('GET', '/api/v1/system/data-status'),
  fairness: () => api<T.FairnessReport>('GET', '/api/v1/system/fairness'),
}

/** Developer / judging tools only (backend DEMO_MODE). Never call these from product screens. */
export const demo = {
  personas: () => api<T.DemoPersona[]>('GET', '/api/v1/demo/personas'),
  walkthrough: () => api<T.DemoWalkthrough>('GET', '/api/v1/demo/walkthrough'),
  reset: () => api<T.DemoResetResult>('POST', '/api/v1/demo/reset'),
}
