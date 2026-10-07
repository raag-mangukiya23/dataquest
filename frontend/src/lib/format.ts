// Formatting shared by every screen. Money is Indian style: ₹6.6 L / ₹1.2 Cr in summaries, ₹6,56,991 in ledgers.
import type { AffordabilityClass, ConflictBand, ScoreComponent } from '@/api/types'

const full = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** ₹6,56,991 (full) or ₹6.6 L / ₹1.2 Cr / ₹45,000 (compact). null/undefined → '—'. */
export function formatINR(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = value < 0 ? '−' : ''
  const v = Math.abs(value)
  if (opts.compact) {
    if (v >= 1e7) return `${sign}₹${trim(v / 1e7)} Cr`
    if (v >= 1e5) return `${sign}₹${trim(v / 1e5)} L`
  }
  return `${sign}₹${full.format(Math.round(v))}`
}
const trim = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1).replace(/\.0$/, '') : n.toFixed(2).replace(/0$/, '').replace(/\.0$/, ''))

/** 0.7116 → "71%" */
export const pct = (x: number | null | undefined, digits = 0) =>
  x === null || x === undefined ? '—' : `${(x * 100).toFixed(digits)}%`
/** 0.7116 → 71 */
export const score100 = (x: number | null | undefined) => (x === null || x === undefined ? 0 : Math.round(x * 100))
export const num = (x: number | null | undefined, digits = 0) =>
  x === null || x === undefined ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(x)

const dateF = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? iso : dateF.format(d)
}
export function daysUntil(iso: string, today = new Date()): number {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

export const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

// ---------------------------------------------------------------- the six score parts
export const COMPONENTS: { key: ScoreComponent; label: string; short: string; color: string; meaning: string }[] = [
  { key: 'fit', label: 'Fit', short: 'Fit', color: 'rgb(var(--fit))', meaning: 'How well the career matches your interests, abilities and values.' },
  { key: 'market', label: 'Job market', short: 'Market', color: 'rgb(var(--market))', meaning: 'Demand for this career where you could work, and how fast it is growing.' },
  { key: 'affordability', label: 'Affordability', short: 'Afford', color: 'rgb(var(--afford))', meaning: "Whether your family can fund the course, counting scholarships, loans and the chance of admission." },
  { key: 'roi', label: 'Return on investment', short: 'ROI', color: 'rgb(var(--roi))', meaning: 'Extra lifetime earnings compared with the course cost.' },
  { key: 'family_alignment', label: 'Family alignment', short: 'Family', color: 'rgb(var(--family))', meaning: "How close the career is to your family's hopes." },
  { key: 'disruption', label: 'Automation risk', short: 'Risk', color: 'rgb(var(--disrupt))', meaning: 'The chance that automation changes this job; it lowers the score.' },
]
export const componentMeta = (k: ScoreComponent) => COMPONENTS.find((c) => c.key === k)!

export const AFFORD: Record<AffordabilityClass, { label: string; color: string; hint: string }> = {
  comfortable: { label: 'Comfortable', color: 'rgb(var(--ok))', hint: 'Family funds and scholarships cover it with room to spare.' },
  stretch: { label: 'Stretch', color: 'rgb(var(--warn))', hint: 'Covered, but only just; little cushion.' },
  loan_dependent: { label: 'Needs a loan', color: 'rgb(var(--loan))', hint: 'Possible with an education loan.' },
  infeasible: { label: 'Out of reach for now', color: 'rgb(var(--bad))', hint: 'Not affordable today even with a loan; see stretch options.' },
}

export const BAND: Record<ConflictBand, { label: string; color: string }> = {
  aligned: { label: 'Aligned', color: 'rgb(var(--ok))' },
  mild: { label: 'Mild differences', color: 'rgb(var(--afford))' },
  moderate: { label: 'Moderate differences', color: 'rgb(var(--warn))' },
  high: { label: 'Strong differences', color: 'rgb(var(--bad))' },
}

export const SECTORS: Record<string, string> = {
  computing_ai: 'Computing & AI',
  engineering: 'Engineering',
  health_life_sciences: 'Health & Life Sciences',
  design_arts: 'Design & Arts',
  business_finance: 'Business & Finance',
  law_policy: 'Law & Policy',
  education_research: 'Education & Research',
  media_communication: 'Media & Communication',
  agri_environment: 'Agriculture & Environment',
  energy_manufacturing: 'Energy & Manufacturing',
  aerospace_mobility: 'Aerospace & Mobility',
  hospitality_services: 'Hospitality & Services',
}
export const sectorLabel = (s: string) => SECTORS[s] ?? titleCase(s)
