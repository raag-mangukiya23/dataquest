// Journey helpers: traits/instrument queries, friendly trait names and the on-device questionnaire draft.
import { useQuery } from '@tanstack/react-query'
import { assessments, profile } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import type { Instrument, TraitProfile } from '@/api/types'

export const journeyKeys = {
  traits: (studentId?: string) => ['traits', studentId] as const,
  instruments: ['instruments'] as const,
  questions: (code?: string) => ['questions', code] as const,
  profile: ['student-profile'] as const,
}

/** The student's trait profile. null = no questionnaire answered yet (404). */
export function useTraits(studentId: string | undefined, enabled = true) {
  return useQuery<TraitProfile | null>({
    queryKey: journeyKeys.traits(studentId),
    enabled: !!studentId && enabled,
    retry: false,
    queryFn: async () => {
      try {
        return await profile.traits(studentId!)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null
        throw e
      }
    },
  })
}

export function useInstruments() {
  return useQuery<Instrument[]>({ queryKey: journeyKeys.instruments, queryFn: assessments.instruments, staleTime: 10 * 60_000 })
}

// ---------------------------------------------------------------- friendly names for the 19 dimensions
export const DIMS: Record<string, { label: string; hint: string }> = {
  riasec_r: { label: 'Realistic', hint: 'Hands-on work with tools, machines, plants or animals.' },
  riasec_i: { label: 'Investigative', hint: 'Finding out how things work, solving puzzles, science.' },
  riasec_a: { label: 'Artistic', hint: 'Creating, designing, writing, performing.' },
  riasec_s: { label: 'Social', hint: 'Helping, teaching and caring for people.' },
  riasec_e: { label: 'Enterprising', hint: 'Leading, persuading, starting things.' },
  riasec_c: { label: 'Conventional', hint: 'Organising, planning, working with records and numbers.' },
  apt_numerical: { label: 'Numbers', hint: 'Working with numbers and quantities.' },
  apt_verbal: { label: 'Words', hint: 'Understanding and using language.' },
  apt_logical: { label: 'Logic', hint: 'Spotting patterns and following rules.' },
  apt_spatial: { label: 'Shapes & space', hint: 'Picturing shapes and how they turn or fit.' },
  cog_analytical: { label: 'Analytical', hint: 'Breaking problems into parts and weighing evidence.' },
  cog_creative: { label: 'Creative', hint: 'Coming up with new ideas and approaches.' },
  cog_practical: { label: 'Practical', hint: 'Getting things done in the real world.' },
  val_security: { label: 'Security', hint: 'A steady, safe job matters to you.' },
  val_autonomy: { label: 'Freedom', hint: 'Deciding how you work matters to you.' },
  val_impact: { label: 'Making a difference', hint: 'Helping society matters to you.' },
  val_financial: { label: 'Earning well', hint: 'A high income matters to you.' },
  grit: { label: 'Grit', hint: 'Sticking with long, hard goals.' },
  risk_tolerance: { label: 'Comfort with risk', hint: 'How comfortable you are with uncertain paths.' },
}
export const dimLabel = (d: string) => DIMS[d]?.label ?? d

export const RIASEC_LETTERS: Record<string, { name: string; dim: string; color: string }> = {
  R: { name: 'Realistic', dim: 'riasec_r', color: 'rgb(var(--roi))' },
  I: { name: 'Investigative', dim: 'riasec_i', color: 'rgb(var(--market))' },
  A: { name: 'Artistic', dim: 'riasec_a', color: 'rgb(var(--fit))' },
  S: { name: 'Social', dim: 'riasec_s', color: 'rgb(var(--afford))' },
  E: { name: 'Enterprising', dim: 'riasec_e', color: 'rgb(var(--family))' },
  C: { name: 'Conventional', dim: 'riasec_c', color: 'rgb(var(--disrupt))' },
}

export const SPECTRUM = ['--fit', '--market', '--afford', '--roi', '--family', '--disrupt']

/** Reads a CSS colour token into a hex string (canvas-confetti needs plain colours). */
export function tokenHex(token: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim().split(/\s+/).map(Number)
    if (v.length === 3 && v.every((n) => !Number.isNaN(n))) return '#' + v.map((n) => n.toString(16).padStart(2, '0')).join('')
  } catch {
    /* ignore */
  }
  return '#8b7cff'
}

// ---------------------------------------------------------------- draft in localStorage
export interface DraftAnswer {
  value: string
  response_ms: number
}
export interface Draft {
  answers: Record<string, DraftAnswer>
  index: number
  client_submission_id: string
  /** seconds spent on a timed section */
  elapsed: number
  /** answers were submitted while offline and wait for upload */
  queued?: boolean
  /** reviewing after a submit: keep the same id until an answer changes */
  reviewing?: boolean
  updated: number
}
const draftKey = (code: string) => `prism-draft-${code}`

export function readDraft(code: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(code))
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}
export function writeDraft(code: string, d: Draft) {
  try {
    localStorage.setItem(draftKey(code), JSON.stringify({ ...d, updated: Date.now() }))
  } catch {
    /* storage full or blocked */
  }
}
export function clearDraft(code: string) {
  try {
    localStorage.removeItem(draftKey(code))
  } catch {
    /* ignore */
  }
}
export function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `cs-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

export type InstrumentStatus = 'done' | 'progress' | 'new'
export function instrumentStatus(code: string, completed: string[] | undefined): InstrumentStatus {
  if (completed?.includes(code)) return 'done'
  const d = readDraft(code)
  return d && (Object.keys(d.answers).length > 0 || d.queued) ? 'progress' : 'new'
}

export function firstName(full: string | undefined): string {
  return (full ?? '').trim().split(/\s+/)[0] || 'there'
}

/** Plain-words versions of the quality flags a submission can return. */
export function flagText(flag: string): string {
  if (flag === 'straight_lining') return 'Many answers were the same. That is fine if it is how you feel, but a quick look may help.'
  if (flag === 'speeding') return 'Some answers came very quickly. Answers given with a little thought count more.'
  if (flag === 'incomplete') return 'A few questions were skipped. Results are still made, with a little less certainty.'
  if (flag.startsWith('contradictory_answers')) {
    const d = flag.split(':')[1]
    return `A few answers${d ? ` about ${dimLabel(d).toLowerCase()}` : ''} pointed in different directions. That happens; you can review them if you like.`
  }
  return 'We noticed something unusual in the answers. You can review them if you like.'
}
