// Offline backup (VITE_DATA_MODE=fixtures): answers requests from the backend's saved sample responses
// (src/fixtures, copied by `npm run fixtures`). Role-dependent views (student vs parent) follow the signed-in role.
import type { Role } from './types'
import type { RequestOptions } from './client'

const files = import.meta.glob('../fixtures/*.json')
let role: Role = 'student'
export function setFixtureRole(r: Role) {
  role = r
}

type Pick = string | ((m: RegExpMatchArray, opts: RequestOptions) => string)
const RULES: [string, RegExp, Pick][] = [
  ['POST', /^\/api\/v1\/auth\/(login|register)$/, 'auth_login'],
  ['GET', /^\/api\/v1\/auth\/me$/, 'auth_me'],
  ['GET', /^\/api\/v1\/students\/me\/profile$/, 'student_profile'],
  ['PUT', /^\/api\/v1\/students\/me\/profile$/, 'student_profile'],
  ['GET', /^\/api\/v1\/students\/[^/]+\/traits$/, 'student_traits'],
  ['GET', /^\/api\/v1\/families\/me$/, 'family_me'],
  ['POST', /^\/api\/v1\/families$/, 'family_me'],
  ['POST', /^\/api\/v1\/families\/join$/, 'family_me'],
  ['POST', /^\/api\/v1\/families\/invites$/, 'family_invite'],
  ['GET', /^\/api\/v1\/families\/[^/]+\/finance$/, () => (role === 'student' ? 'family_finance_student_view' : 'family_finance_parent_view')],
  ['PUT', /^\/api\/v1\/families\/[^/]+\/finance$/, 'family_finance_parent_view'],
  ['GET', /^\/api\/v1\/families\/[^/]+\/preferences$/, 'parent_preferences'],
  ['PUT', /^\/api\/v1\/families\/[^/]+\/preferences$/, 'parent_preferences'],
  ['GET', /^\/api\/v1\/consents$/, 'consents'],
  ['GET', /^\/api\/v1\/assessments\/instruments$/, 'assessment_instruments'],
  ['GET', /^\/api\/v1\/assessments\/[^/]+\/questions$/, 'assessment_questions_riasec'],
  ['POST', /^\/api\/v1\/assessments\/[^/]+\/submit$/, 'assessment_submit'],
  ['GET', /^\/api\/v1\/analysis\/runs$/, 'analysis_runs_list'],
  ['POST', /^\/api\/v1\/analysis\/runs$/, () => (role === 'student' ? 'analysis_run_student_view' : 'analysis_run_parent_view')],
  ['GET', /^\/api\/v1\/analysis\/compare$/, 'analysis_compare'],
  ['POST', /^\/api\/v1\/analysis\/runs\/[^/]+\/what-if$/, 'analysis_what_if'],
  ['GET', /^\/api\/v1\/analysis\/runs\/[^/]+\/conflict$/, () => (role === 'student' ? 'conflict_student_view' : 'conflict_parent_view')],
  ['GET', /^\/api\/v1\/analysis\/runs\/[^/]+\/swot$/, 'swot'],
  ['GET', /^\/api\/v1\/analysis\/runs\/[^/]+\/roadmap$/, 'roadmap'],
  ['GET', /^\/api\/v1\/analysis\/runs\/[^/]+\/narrative$/, (_m, o) => `narrative_${['ta', 'hi'].includes(String(o.query?.lang)) ? o.query!.lang : 'en'}`],
  ['GET', /^\/api\/v1\/analysis\/runs\/[^/]+$/, () => (role === 'student' ? 'analysis_run_student_view' : 'analysis_run_parent_view')],
  ['GET', /^\/api\/v1\/students\/[^/]+\/deadlines$/, 'deadlines'],
  ['POST', /^\/api\/v1\/students\/[^/]+\/reminders$/, 'reminders_create'],
  ['GET', /^\/api\/v1\/me\/reminders$/, 'reminders_mine'],
  ['GET', /^\/api\/v1\/loans\/explain$/, 'loan_explain'],
  ['POST', /^\/api\/v1\/students\/[^/]+\/outcomes$/, 'outcome_create'],
  ['GET', /^\/api\/v1\/admin\/outcomes\/summary$/, 'outcomes_summary'],
  ['GET', /^\/api\/v1\/mentors$/, 'mentors'],
  ['GET', /^\/api\/v1\/educator\/dashboard$/, 'educator_dashboard'],
  ['GET', /^\/api\/v1\/system\/fairness$/, 'system_fairness'],
  ['GET', /^\/api\/v1\/careers$/, 'careers_list'],
  ['GET', /^\/api\/v1\/careers\/[^/]+\/alternatives$/, 'career_alternatives'],
  ['GET', /^\/api\/v1\/careers\/[^/]+$/, 'career_detail'],
  ['GET', /^\/api\/v1\/regions$/, 'regions'],
  ['GET', /^\/api\/v1\/market\/trends$/, 'market_trends'],
  ['GET', /^\/api\/v1\/pathways$/, 'pathways'],
  ['GET', /^\/api\/v1\/exams$/, 'exams'],
  ['GET', /^\/api\/v1\/scholarships$/, 'scholarships'],
  ['GET', /^\/api\/v1\/local-opportunities$/, 'local_opportunities'],
  ['GET', /^\/api\/v1\/admin\/analytics$/, 'admin_analytics'],
  ['POST', /^\/api\/v1\/admin\/data\/refresh$/, 'admin_refresh'],
  ['GET', /^\/api\/v1\/system\/health$/, 'system_health'],
  ['GET', /^\/api\/v1\/system\/methodology$/, 'system_methodology'],
  ['GET', /^\/api\/v1\/system\/data-status$/, 'system_data_status'],
  ['GET', /^\/api\/v1\/demo\/personas$/, 'demo_personas'],
  ['GET', /^\/api\/v1\/demo\/walkthrough$/, 'demo_walkthrough'],
  ['POST', /^\/api\/v1\/demo\/reset$/, 'demo_reset'],
]

// Writes without a saved response: acknowledge them so the offline demo keeps flowing.
const EMPTY: [string, RegExp, unknown][] = [
  ['DELETE', /^\/api\/v1\/me\/reminders$/, { cancelled: 0 }],
  ['GET', /^\/api\/v1\/students\/[^/]+\/outcomes$/, []],
]

export async function fixtureFor<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
  await new Promise((r) => setTimeout(r, 120))
  for (const [m, re, value] of EMPTY) if (m === method && re.test(path)) return value as T
  for (const [m, re, pick] of RULES) {
    const match = path.match(re)
    if (m !== method || !match) continue
    const name = typeof pick === 'function' ? pick(match, opts) : pick
    const load = files[`../fixtures/${name}.json`]
    if (!load) break
    const mod = (await load()) as { default: { data: unknown } }
    return structuredClone(mod.default.data) as T
  }
  const { ApiError } = await import('./client')
  throw new ApiError('OFFLINE', 'This needs the live PRISM server; it is not available in offline mode.', 0)
}
