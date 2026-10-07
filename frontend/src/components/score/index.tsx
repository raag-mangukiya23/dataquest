// Score visuals shared by every results screen. The six spectrum colours mean the six score parts, always.
import { motion, animate, useInView } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleDashed, Lock } from 'lucide-react'
import type {
  AffordabilityClass,
  ConflictBand,
  Contribution,
  DataTrust,
  DateStatus,
  Provenance,
} from '@/api/types'
import { AFFORD, BAND, COMPONENTS, componentMeta, formatINR, pct } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { Badge, Tip, cx } from '@/components/ui'

/**
 * One bar split into the six score parts by contribution. Positive parts stack left to right; automation risk is
 * drawn as a hatched segment because it subtracts. Width of the whole bar = final score.
 */
export function ScoreBar({ contributions, height = 10, delay = 0, showLegend = false, className }: { contributions: Contribution[]; height?: number; delay?: number; showLegend?: boolean; className?: string }) {
  const { reducedMotion } = useSettings()
  const ordered = COMPONENTS.map((c) => contributions.find((x) => x.component === c.key)).filter(Boolean) as Contribution[]
  const pos = ordered.filter((c) => c.component !== 'disruption')
  const neg = ordered.find((c) => c.component === 'disruption')
  return (
    <div className={className}>
      <div className="relative flex w-full overflow-hidden rounded-full bg-surface-2" style={{ height }} role="img" aria-label={ordered.map((c) => `${componentMeta(c.component).label} ${(c.contribution * 100).toFixed(1)}`).join(', ')}>
        {pos.map((c, i) => (
          <Tip key={c.component} content={<SegmentTip c={c} />}>
            <motion.span
              className="h-full"
              style={{ background: componentMeta(c.component).color }}
              initial={reducedMotion ? false : { width: 0 }}
              animate={{ width: `${Math.max(0, c.contribution) * 100}%` }}
              transition={{ duration: 0.6, delay: delay + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            />
          </Tip>
        ))}
        {neg && Math.abs(neg.contribution) > 0.0005 && (
          <Tip content={<SegmentTip c={neg} />}>
            <motion.span
              className="hatch h-full opacity-80"
              initial={reducedMotion ? false : { width: 0 }}
              animate={{ width: `${Math.abs(neg.contribution) * 100}%` }}
              transition={{ duration: 0.5, delay: delay + 0.4 }}
            />
          </Tip>
        )}
      </div>
      {showLegend && <ScoreLegend className="mt-3" />}
    </div>
  )
}

function SegmentTip({ c }: { c: Contribution }) {
  const m = componentMeta(c.component)
  return (
    <span>
      <b style={{ color: m.color }}>{m.label}</b> · {pct(c.raw_value)} × weight {c.weight.toFixed(2)} ={' '}
      <span className="num">{(c.contribution >= 0 ? '+' : '') + (c.contribution * 100).toFixed(1)}</span> points
      <br />
      <span className="text-muted">{m.meaning}</span>
    </span>
  )
}

export function ScoreLegend({ className }: { className?: string }) {
  return (
    <ul className={cx('flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted', className)}>
      {COMPONENTS.map((c) => (
        <li key={c.key} className="inline-flex items-center gap-1.5">
          <span className={cx('h-2.5 w-2.5 rounded-full', c.key === 'disruption' && 'hatch')} style={c.key === 'disruption' ? undefined : { background: c.color }} />
          {c.label}
        </li>
      ))}
    </ul>
  )
}

/** A number that rolls up once when it first scrolls into view. */
export function CountUp({ value, decimals = 0, suffix = '', className }: { value: number; decimals?: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const { reducedMotion } = useSettings()
  const [shown, setShown] = useState(reducedMotion ? value : 0)
  useEffect(() => {
    if (reducedMotion) return setShown(value)
    if (!inView) return
    const ctl = animate(0, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: setShown })
    return () => ctl.stop()
  }, [inView, value, reducedMotion])
  return (
    <span ref={ref} className={cx('num', className)}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  )
}

export function FundingPill({ value, className }: { value: AffordabilityClass; className?: string }) {
  const a = AFFORD[value]
  return (
    <Tip content={a.hint}>
      <span className={className}>
        <Badge color={a.color}>{a.label}</Badge>
      </span>
    </Tip>
  )
}

export function BandPill({ value }: { value: ConflictBand }) {
  const b = BAND[value]
  return <Badge color={b.color}>{b.label}</Badge>
}

/** "71 · 59–84": the score and its likely range */
export function ConfidenceChip({ score, low, high, confidence }: { score: number; low: number; high: number; confidence?: number }) {
  return (
    <Tip content={`Likely between ${Math.round(low * 100)} and ${Math.round(high * 100)}.${confidence !== undefined ? ` Confidence ${pct(confidence)}: it falls when inputs are estimates, old or missing.` : ''}`}>
      <span className="num inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted hairline">
        {Math.round(score * 100)} · {Math.round(low * 100)}–{Math.round(high * 100)}
      </span>
    </Tip>
  )
}

export function TrustBadge({ trust }: { trust: DataTrust }) {
  const checked = trust.inputs.filter((i) => i.verification === 'verified' || i.verification === 'secondary').length
  const total = trust.inputs.length
  const good = total > 0 && checked / total >= 0.5
  return (
    <Tip content={`${checked} of ${total} inputs behind this result are checked against published sources; the rest are estimates.`}>
      <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs hairline', good ? 'text-ok' : 'text-muted')}>
        {good ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <CircleDashed className="h-3.5 w-3.5" aria-hidden />}
        {checked} of {total} checked
      </span>
    </Tip>
  )
}

export function ProvenanceBadge({ p }: { p: Provenance }) {
  const checked = !p.is_estimate && (p.verification === 'verified' || p.verification === 'secondary')
  return (
    <Tip content={`${p.source_name}${p.as_of ? ` · as of ${p.as_of}` : ''}${p.evidence ? ` · ${p.evidence}` : ''}`}>
      <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium hairline', checked ? 'text-ok' : 'text-muted')}>
        {checked ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <CircleDashed className="h-3 w-3" aria-hidden />}
        {checked ? 'Checked' : 'Estimate'}
      </span>
    </Tip>
  )
}

const DATE_STATUS: Record<DateStatus, { label: string; color: string; hint: string }> = {
  announced: { label: 'Announced', color: 'rgb(var(--ok))', hint: 'In the official information bulletin.' },
  tentative: { label: 'Tentative', color: 'rgb(var(--warn))', hint: 'In the official calendar, but may still move.' },
  estimated: { label: 'Estimated', color: 'rgb(var(--muted))', hint: 'Not announced yet; projected from earlier years.' },
}
export function DateStatusTag({ status }: { status: DateStatus }) {
  const s = DATE_STATUS[status]
  return (
    <Tip content={s.hint}>
      <span>
        <Badge color={s.color}>{s.label}</Badge>
      </span>
    </Tip>
  )
}

/** Rupees, or the privacy note when the backend hides family money from this viewer (null). */
export function Money({ value, compact = true, className }: { value: number | null | undefined; compact?: boolean; className?: string }) {
  if (value === null || value === undefined) {
    return (
      <Tip content="Your family's money details are visible to parents only, unless they choose to share them.">
        <span className={cx('inline-flex items-center gap-1 text-sm text-muted', className)}>
          <Lock className="h-3.5 w-3.5" aria-hidden /> Shared with parents only
        </span>
      </Tip>
    )
  }
  return <span className={cx('num', className)}>{formatINR(value, { compact })}</span>
}

/** A thin bar with a value (0–1), coloured. */
export function Meter({ value, color = 'rgb(var(--primary))', className, label }: { value: number; color?: string; className?: string; label?: string }) {
  const { reducedMotion } = useSettings()
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={reducedMotion ? false : { width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  )
}
