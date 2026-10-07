// Small pieces shared by the system screens (trust, counsellor, admin, settings, outcomes).
import { AlertOctagon, AlertTriangle, Check, Info, X } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Badge, cx } from '@/components/ui'
import { useSettings } from '@/state/settings'
import type { FlagSeverity } from '@/api/types'

export const SEVERITY: Record<FlagSeverity, { label: string; color: string; icon: typeof Info; order: number }> = {
  urgent: { label: 'Urgent', color: 'rgb(var(--bad))', icon: AlertOctagon, order: 0 },
  warn: { label: 'Check soon', color: 'rgb(var(--warn))', icon: AlertTriangle, order: 1 },
  info: { label: 'For info', color: 'rgb(var(--muted))', icon: Info, order: 2 },
}

export function SeverityChip({ severity, children }: { severity: FlagSeverity; children?: ReactNode }) {
  const s = SEVERITY[severity] ?? SEVERITY.info
  const Icon = s.icon
  return (
    <Badge color={s.color} className="!whitespace-normal text-left">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{s.label}: </span>
      {children ?? s.label}
    </Badge>
  )
}

const FRESH: Record<string, { label: string; color: string; hint: string }> = {
  fresh: { label: 'Fresh', color: 'rgb(var(--ok))', hint: 'Updated within its normal refresh cycle.' },
  aging: { label: 'Aging', color: 'rgb(var(--warn))', hint: 'Close to its next refresh date.' },
  stale: { label: 'Stale', color: 'rgb(var(--bad))', hint: 'Past its refresh date. Treat with care.' },
}
export function FreshnessPill({ value }: { value: string }) {
  const f = FRESH[value] ?? { label: value, color: 'rgb(var(--muted))', hint: '' }
  return (
    <Badge color={f.color} title={f.hint}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: f.color }} aria-hidden />
      {f.label}
    </Badge>
  )
}

/** A row that "checks itself" when it scrolls into view. */
export function CheckRow({ passed, title, children, index = 0 }: { passed: boolean; title: ReactNode; children?: ReactNode; index?: number }) {
  const { reducedMotion } = useSettings()
  const color = passed ? 'rgb(var(--ok))' : 'rgb(var(--bad))'
  return (
    <motion.li
      className="flex gap-3 rounded-xl bg-surface-2/60 p-4 hairline"
      initial={reducedMotion ? false : { y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
    >
      <motion.span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
        initial={reducedMotion ? false : { scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 18, delay: index * 0.08 + 0.15 }}
      >
        {passed ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : <X className="h-4 w-4" strokeWidth={3} aria-hidden />}
      </motion.span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-medium">
          {title}
          <span className="sr-only">{passed ? '(passed)' : '(failed)'}</span>
        </div>
        {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      </div>
    </motion.li>
  )
}

export function Stars({ value, onChange, label = 'How happy are you with this choice?' }: { value: number | null; onChange: (v: number) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = (value ?? 0) >= n
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} of 5`}
            onClick={() => onChange(n)}
            className={cx('grid h-11 w-11 place-items-center rounded-xl text-2xl transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon', on ? 'text-family' : 'text-muted/50')}
          >
            {on ? '★' : '☆'}
          </button>
        )
      })}
    </div>
  )
}

export const SPECTRUM = ['--fit', '--market', '--afford', '--roi', '--family', '--disrupt'].map((v) => `rgb(var(${v}))`)

export function humanKey(s: string) {
  return s.replace(/[_.-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** Collapse near-duplicate engine warnings: digits stripped to find the pattern. */
export function groupIssues<T extends { dataset: string; message: string; severity: string }>(issues: T[]) {
  const map = new Map<string, { dataset: string; severity: string; sample: string; count: number }>()
  for (const i of issues) {
    const key = i.dataset + '|' + i.severity + '|' + i.message.replace(/[-+]?\d+(\.\d+)?/g, '#')
    const g = map.get(key)
    if (g) g.count++
    else map.set(key, { dataset: i.dataset, severity: i.severity, sample: i.message, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

/** Plain-language version of a grouped warning. */
export function plainIssue(g: { dataset: string; sample: string; count: number }) {
  const m = g.sample.match(/^(?:\w+:\s*)?(\w+) .*outlier/i)
  if (m) return `${g.count} unusual ${m[1].replace(/_/g, ' ')} value${g.count > 1 ? 's' : ''} flagged for review`
  return g.count > 1 ? `${g.sample} (and ${g.count - 1} similar)` : g.sample
}
