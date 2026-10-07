// The six stages of the PRISM pipeline, in plain words. Formulas, weights and parameters are looked up by name in
// GET /system/methodology at render time; nothing numeric lives here.
import { Brain, ClipboardList, Compass, Sparkles, Users, Wallet, type LucideIcon } from 'lucide-react'

export interface Stage {
  key: string
  title: string
  /** short label under the node; `{dims}` is replaced with the live dimension count */
  short: string
  icon: LucideIcon
  plain: string
  inputs: string[]
  output: string
  formulas: string[]
  params: string[]
}

export const STAGES: Stage[] = [
  {
    key: 'answers',
    title: 'Your answers',
    short: 'Questionnaire',
    icon: ClipboardList,
    plain:
      'The student answers agreement questions (how much they like an activity) and short reasoning puzzles. Some questions are worded the other way round, so careless ticking shows up. Puzzles count harder questions more and allow for lucky guesses.',
    inputs: ['Interest and values questions', 'Timed reasoning puzzles'],
    output: 'A score from 0 to 1 for each trait',
    formulas: ['likert_trait', 'aptitude_trait'],
    params: [],
  },
  {
    key: 'profile',
    title: 'Your profile',
    short: '{dims}-dimension profile',
    icon: Brain,
    plain:
      'The trait scores form one profile: interests, aptitudes, thinking style, work values and grit. Each trait also gets a reliability, so a rushed or patchy section counts for less instead of misleading the result.',
    inputs: ['Trait scores', 'Answer-quality checks'],
    output: 'A profile with a reliability for each trait',
    formulas: ['trait_reliability'],
    params: ['psychometric_min_coverage', 'norm_group_min_n'],
  },
  {
    key: 'score',
    title: 'Six-part score',
    short: 'Six-part score',
    icon: Sparkles,
    plain:
      'Each career is compared with the profile (fit) and scored on job market, affordability, return, family hopes and automation risk. The parts are weighted and added up, and every part’s share is shown, so any one of them can be questioned.',
    inputs: ['Your profile', 'Career requirements', 'Job market data'],
    output: 'A ranked list, each score split into six parts',
    formulas: ['fit', 'final_score', 'robustness', 'recommendation_confidence'],
    params: ['ml_alpha', 'base_model_confidence', 'sensitivity_perturbation'],
  },
  {
    key: 'money',
    title: 'Financial solver',
    short: 'Money plan',
    icon: Wallet,
    plain:
      'For every course PRISM adds up the full cost with fee inflation, works out what the family can put aside, finds scholarships and checks how big a loan would be safe. Borrowing scores lower than paying outright, and a heavy monthly EMI lowers it further.',
    inputs: ['Family budget (private to parents)', 'Course fees', 'Scholarships and loan schemes'],
    output: 'A cost plan and a funding label for each course',
    formulas: ['total_cost', 'family_funds', 'loan_capacity', 'affordability', 'reachability', 'roi'],
    params: ['education_inflation', 'loan_rate', 'loan_tenor_months', 'loan_moratorium_months', 'discount_rate', 'roi_horizon_years'],
  },
  {
    key: 'conflict',
    title: 'Conflict index',
    short: 'Family talk',
    icon: Users,
    plain:
      'Parents and student often want different things. PRISM measures the gap on six themes, such as field, risk, place and budget, and suggests bridge careers you can both support, with gentle questions to talk about.',
    inputs: ['Student’s profile and wishes', 'Parents’ hopes and limits'],
    output: 'A 0–100 index, the biggest gaps and bridge careers',
    formulas: ['conflict_index'],
    params: ['conflict_bands'],
  },
  {
    key: 'roadmap',
    title: 'Roadmap',
    short: 'Roadmap',
    icon: Compass,
    plain:
      'The chosen path becomes a step-by-step plan: entrance exams, scholarship deadlines and local projects. Each date is labelled announced, tentative or estimated, and older data counts for less.',
    inputs: ['Your top careers', 'Exam and scholarship calendars', 'Local opportunities'],
    output: 'A roadmap with deadlines and reminders',
    formulas: ['freshness'],
    params: ['signal_half_life'],
  },
]

const NAMES: Record<string, string> = {
  likert_trait: 'Agreement questions → trait score',
  aptitude_trait: 'Reasoning puzzles → aptitude score',
  trait_reliability: 'How much to trust each trait',
  fit: 'Fit with a career',
  final_score: 'Final score',
  robustness: 'How stable the ranking is',
  recommendation_confidence: 'Confidence',
  total_cost: 'Total course cost',
  family_funds: 'What the family can fund',
  loan_capacity: 'Safe loan size',
  affordability: 'Affordability',
  reachability: 'Reachability',
  roi: 'Return on investment',
  conflict_index: 'Conflict index',
  freshness: 'Data freshness',
}
export const formulaTitle = (name: string) => NAMES[name] ?? name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

const PARAM_LABELS: Record<string, string> = {
  education_inflation: 'Fee inflation a year',
  loan_rate: 'Loan interest rate',
  loan_tenor_months: 'Loan repayment period',
  loan_moratorium_months: 'Repayment break after the course',
  discount_rate: 'Discount rate for future pay',
  roi_horizon_years: 'Years of pay counted',
  ml_alpha: 'Share of the learned model in fit',
  psychometric_min_coverage: 'Answers needed per trait',
  norm_group_min_n: 'Students needed before percentiles',
  base_model_confidence: 'Starting confidence',
  sensitivity_perturbation: 'Weight change tested',
  conflict_bands: 'Bands',
  signal_half_life: 'Half-life of market signals',
}
const PERCENT = new Set(['education_inflation', 'loan_rate', 'discount_rate', 'psychometric_min_coverage'])

/** A methodology parameter as a readable label and value (values come straight from the API). */
export function formatParam(key: string, value: number | string): { label: string; value: string } {
  const label = PARAM_LABELS[key] ?? key.replace(/_/g, ' ')
  if (typeof value === 'string') {
    if (key === 'conflict_bands') return { label, value: value.replace(/<=/g, ' ≤ ').replace(/</g, ' < ') }
    return { label, value }
  }
  if (PERCENT.has(key)) return { label, value: `${+(value * 100).toFixed(1)}%` }
  if (key === 'sensitivity_perturbation') return { label, value: `±${+(value * 100).toFixed(0)}%` }
  if (key.endsWith('_months')) return { label, value: `${value} months` }
  if (key.endsWith('_years')) return { label, value: `${value} years` }
  if (key === 'norm_group_min_n') return { label, value: `${value}` }
  return { label, value: String(value) }
}

export const GROUP_LABELS: Record<string, string> = {
  riasec: 'Interests',
  aptitude: 'Aptitudes',
  cognitive: 'Thinking style',
  work_values: 'Work values',
  disposition: 'Disposition',
}
