// Family-group helpers: conflict query, labels and the child-view preview rules.
import { useQuery } from '@tanstack/react-query'
import { analysis } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import type { ConflictReport, FamilyFinanceIn, FamilyFinanceOut, FamilyFinanceSummary, IncomeBand } from '@/api/types'

export const conflictKey = (runId?: string) => ['conflict', runId] as const

export function useConflict(runId: string | undefined) {
  return useQuery<ConflictReport>({
    queryKey: conflictKey(runId),
    enabled: !!runId,
    queryFn: () => analysis.conflict(runId!),
    retry: (n, e) => !(e instanceof ApiError && e.status > 0 && e.status < 500) && n < 2,
  })
}

/** Plain-language names for the conflict dimensions the engine reports. */
export const DIMENSION: Record<string, { label: string; short: string }> = {
  domain_preference: { label: 'Career fields', short: 'Which careers' },
  risk_appetite: { label: 'Comfort with risk', short: 'Risk' },
  geography: { label: 'Moving away to study', short: 'Moving away' },
  budget: { label: 'Budget', short: 'Budget' },
  time_to_earn: { label: 'Time until earning', short: 'Time to earn' },
  prestige_stability: { label: 'Prestige or stability', short: 'Prestige vs stability' },
}
export const dimensionLabel = (d: string) => DIMENSION[d]?.label ?? d.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export const RELATIONS = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'self', label: 'I am the student' },
  { value: 'other', label: 'Other family' },
] as const

export const INCOME_BANDS: { value: IncomeBand; label: string }[] = [
  { value: 'below_3l', label: 'Below ₹3 L a year' },
  { value: '3l_6l', label: '₹3 L to ₹6 L' },
  { value: '6l_10l', label: '₹6 L to ₹10 L' },
  { value: '10l_20l', label: '₹10 L to ₹20 L' },
  { value: '20l_50l', label: '₹20 L to ₹50 L' },
  { value: 'above_50l', label: 'Above ₹50 L' },
]

export function isFullFinance(f: FamilyFinanceOut | FamilyFinanceSummary | null | undefined): f is FamilyFinanceOut {
  return !!f && 'income_band' in f
}

/** Band midpoints and thresholds mirrored from the backend's student-summary rule (services/live.py get_finance),
 *  so the parent's "what your child sees" preview matches what the API will actually return to the student. */
const BAND_MID: Record<IncomeBand, number> = {
  below_3l: 200_000,
  '3l_6l': 450_000,
  '6l_10l': 800_000,
  '10l_20l': 1_500_000,
  '20l_50l': 3_000_000,
  above_50l: 6_000_000,
}
export function previewSummary(f: Pick<FamilyFinanceIn, 'income_band' | 'annual_income' | 'loan_tolerance' | 'relocation_willingness' | 'abroad_willingness'>) {
  const income = f.annual_income || BAND_MID[f.income_band]
  return {
    budget_comfort: income < 500_000 ? 'modest' : income < 1_500_000 ? 'moderate' : 'comfortable',
    open_to_loans: f.loan_tolerance >= 0.4,
    open_to_relocation: f.relocation_willingness >= 0.5,
    open_to_abroad: f.abroad_willingness >= 0.5,
  }
}

export const COMFORT_WORDS: Record<string, { title: string; line: string }> = {
  modest: { title: 'Careful with money', line: 'Your family has a modest budget. Scholarships and low-cost colleges matter a lot.' },
  moderate: { title: 'A middle budget', line: 'Your family can fund a fair amount. Some costly courses may still need help.' },
  comfortable: { title: 'Comfortable', line: 'Your family can fund most courses without strain.' },
}

export function meetingKey(runId: string) {
  return `prism-meeting-${runId}`
}
export type MeetingAnswer = 'agree' | 'later'
export function readMeeting(runId: string | undefined): Record<string, MeetingAnswer> {
  if (!runId) return {}
  try {
    return JSON.parse(localStorage.getItem(meetingKey(runId)) || '{}') as Record<string, MeetingAnswer>
  } catch {
    return {}
  }
}
export function writeMeeting(runId: string, v: Record<string, MeetingAnswer>) {
  try {
    localStorage.setItem(meetingKey(runId), JSON.stringify(v))
  } catch {
    /* private mode */
  }
}

/** Map a 422 response's details.errors to {field: message}; a model-level error lands on '_form'. */
export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!(e instanceof ApiError)) return out
  const errs = (e.details?.errors as { loc?: (string | number)[]; msg?: string }[] | undefined) ?? []
  for (const er of errs) {
    const loc = (er.loc ?? []).filter((x) => x !== 'body')
    const key = loc.length ? String(loc[0]) : '_form'
    let msg = (er.msg ?? 'Please check this value').replace(/^Value error, /, '')
    if (/existing_debt_emi \+ max_affordable_emi exceeds monthly income/.test(msg))
      msg = 'Current EMIs plus the new loan EMI are more than your monthly income. Lower the EMI or check the income.'
    out[key] = msg
  }
  return out
}
