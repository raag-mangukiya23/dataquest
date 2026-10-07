// The top match, and the screen's one hero moment ("spectrum decomposition"): a white beam sweeps across the
// score track, then refracts into the six score-part colours, which grow into the ScoreBar. The list below picks
// the colours up card by card (60 ms apart). Transform and opacity only; skipped with reduced motion.
import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import type { Recommendation } from '@/api/types'
import { ConfidenceChip, FundingPill, ScoreBar, ScoreLegend, TrustBadge } from '@/components/score'
import { COMPONENTS, sectorLabel } from '@/lib/format'
import { Roll } from './Roll'

/** Seconds after mount at which the hero's colours start to grow; the list follows this. */
export const SPLIT_AT = 0.42

export function BeamSplit({ height, length = 1 }: { height: number; length?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ height, width: `${Math.max(0.05, Math.min(1, length)) * 100}%` }}>
      {/* the white beam */}
      <motion.div
        className="absolute inset-0 origin-left rounded-full bg-neon dark:bg-white"
        style={{ boxShadow: '0 0 14px 3px rgb(255 255 255 / .55), 0 0 40px 6px rgb(var(--neon) / .25)' }}
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
        transition={{ duration: 0.72, times: [0, 0.55, 1], ease: [0.22, 1, 0.36, 1] }}
      />
      {/* six rays fan out of it, one per score part */}
      {COMPONENTS.map((c, i) => (
        <motion.span
          key={c.key}
          className="absolute inset-x-0 top-1/2 h-[2px] origin-right rounded-full"
          style={{ background: c.key === 'disruption' ? undefined : c.color, backgroundImage: c.key === 'disruption' ? 'repeating-linear-gradient(90deg, rgb(var(--disrupt)) 0 4px, transparent 4px 7px)' : undefined }}
          initial={{ opacity: 0, y: 0, scaleX: 1 }}
          animate={{ opacity: [0, 1, 0], y: [0, (i - 2.5) * 7], scaleX: [1, 0.55] }}
          transition={{ duration: 0.55, delay: SPLIT_AT - 0.06 + i * 0.06, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

export function TopMatchCard({ rec, to, reveal, label }: { rec: Recommendation; to: string; reveal: boolean; label: string }) {
  const barH = 14
  return (
    <article className="card relative overflow-hidden p-5 md:p-6" aria-labelledby="top-match-name">
      {reveal && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
          initial={{ x: '-100%' }}
          animate={{ x: '320%' }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neon">{label}</div>
          <h2 id="top-match-name" className="mt-2 text-2xl font-bold leading-tight md:text-4xl">
            {rec.career.name}
          </h2>
          <p className="mt-1 text-sm text-muted">{sectorLabel(rec.career.sector)}</p>
        </div>
        <div className="shrink-0 text-right">
          <Roll value={rec.final_score * 100} className="block text-5xl font-semibold leading-none md:text-6xl" />
          <span className="mt-1 block text-xs text-muted">match score / 100</span>
        </div>
      </div>

      <div className="relative mt-6">
        <ScoreBar contributions={rec.contributions} height={barH} delay={reveal ? SPLIT_AT : 0} />
        {reveal && <BeamSplit height={barH} length={rec.final_score} />}
      </div>
      <ScoreLegend className="relative mt-3" />

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <FundingPill value={rec.financial.affordability_class} />
        <ConfidenceChip score={rec.final_score} low={rec.ci_low} high={rec.ci_high} confidence={rec.confidence} />
        <TrustBadge trust={rec.data_trust} />
      </div>

      {rec.explanation.length > 0 && (
        <ul className="relative mt-4 space-y-1.5 text-[15px] text-ink/90">
          {rec.explanation.slice(0, 2).map((e, i) => (
            <li key={i} className="flex gap-2.5">
              <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-neon/80" />
              {e}
            </li>
          ))}
        </ul>
      )}
      <Link
        to={to}
        className="relative mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-surface-2 px-4 text-sm font-semibold hairline transition-colors hover:bg-primary/15"
      >
        Why this score and what it costs <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  )
}
