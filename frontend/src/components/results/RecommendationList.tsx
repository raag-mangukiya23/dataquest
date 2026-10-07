// The full ranked list and the six bucket tabs.
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AnalysisRun, Bucket, BucketItem, Recommendation, Role } from '@/api/types'
import { ConfidenceChip, FundingPill, Money, ScoreBar, TrustBadge } from '@/components/score'
import { Badge, EmptyState, InfoTip, TabPanel, Tabs, cx } from '@/components/ui'
import { sectorLabel } from '@/lib/format'
import { GLOSSARY } from '@/lib/glossary'
import { useSettings } from '@/state/settings'
import { Roll } from './Roll'
import { BUCKET_ORDER, bucketMeta, recById, s100 } from './shared'

/**
 * A ScoreBar whose colours arrive in sequence. `startAt` is the page clock (performance.now()) at which this bar
 * should start, so bars follow the hero 60 ms apart. Always mounted, so nothing is left empty off-screen.
 */
export function SequencedScoreBar({ contributions, startAt, height = 10 }: { contributions: Recommendation['contributions']; startAt: number; height?: number }) {
  const { reducedMotion } = useSettings()
  const [delay] = useState(() => Math.min(1.6, Math.max(0, (startAt - performance.now()) / 1000)))
  return <ScoreBar contributions={contributions} height={height} delay={reducedMotion ? 0 : delay} />
}

export function RecCard({ rec, to, role, stretchReason, startAt }: { rec: Recommendation; to: string; role: Role | undefined; stretchReason?: string; startAt: number }) {
  return (
    <Link
      to={to}
      className="card group block p-4 transition-colors hover:bg-surface-2/60 md:p-5"
      aria-label={`Rank ${rec.rank}: ${rec.career.name}, score ${s100(rec.final_score)} out of 100. Open details.`}
    >
      <div className="flex items-start gap-3 md:gap-4">
        <span className="num grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-sm font-semibold hairline" aria-hidden>
          {rec.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-snug md:text-lg">{rec.career.name}</h3>
              <p className="text-xs text-muted">{sectorLabel(rec.career.sector)}</p>
            </div>
            <div className="shrink-0 text-right leading-none">
              <Roll value={rec.final_score * 100} className="text-2xl font-semibold md:text-3xl" />
              <span className="block pt-1 text-[11px] text-muted">/ 100</span>
            </div>
          </div>
          <div className="mt-3">
            <SequencedScoreBar contributions={rec.contributions} startAt={startAt} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <FundingPill value={rec.financial.affordability_class} />
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span className="text-muted">Total cost</span>
              <Money value={rec.financial.total_cost} className="font-medium" />
            </span>
            <ConfidenceChip score={rec.final_score} low={rec.ci_low} high={rec.ci_high} confidence={rec.confidence} />
            <TrustBadge trust={rec.data_trust} />
          </div>
          {rec.buckets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {BUCKET_ORDER.filter((b) => rec.buckets.includes(b)).map((b) => (
                <Badge key={b} className="bg-surface-2 text-muted hairline">
                  {bucketMeta(b, role).tag}
                </Badge>
              ))}
            </div>
          )}
          {stretchReason && <p className="mt-2 text-sm text-muted">Stretch: {stretchReason}</p>}
        </div>
        <ChevronRight className="mt-2 hidden h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
      </div>
    </Link>
  )
}

export function RecommendationList({ run, link, role, startAt }: { run: AnalysisRun; link: (p: string) => string; role: Role | undefined; startAt: number }) {
  const stretch = new Map((run.buckets.stretch_goals ?? []).map((b) => [b.career_id, b.reason]))
  if (run.recommendations.length === 0) {
    return (
      <EmptyState title="No careers to show yet">
        PRISM could not rank careers from this result. Finishing more of the questionnaire usually fixes this.
      </EmptyState>
    )
  }
  return (
    <ol className="space-y-3">
      {run.recommendations.map((rec, i) => (
        <li key={rec.career.id}>
          <RecCard rec={rec} to={link(`/results/${rec.career.slug}`)} role={role} stretchReason={stretch.get(rec.career.id)} startAt={startAt + i * 60} />
        </li>
      ))}
    </ol>
  )
}

function BucketRow({ item, run, link, scoreLabel, showReason }: { item: BucketItem; run: AnalysisRun; link: (p: string) => string; scoreLabel: string; showReason: boolean }) {
  const rec = recById(run, item.career_id)
  const to = link(`/results/${rec ? rec.career.slug : item.career_id}`)
  return (
    <li>
      <Link to={to} className="flex min-h-[56px] items-center gap-3 rounded-xl bg-surface-2/50 px-3.5 py-3 hairline transition-colors hover:bg-surface-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{item.career_name}</span>
            {rec ? (
              <span className="num text-xs text-muted">#{rec.rank}</span>
            ) : (
              <Badge className="bg-surface text-muted hairline">Outside the top {run.recommendations.length}</Badge>
            )}
            {rec && <FundingPill value={rec.financial.affordability_class} />}
          </div>
          {showReason && <p className="mt-1 text-sm text-muted">{item.reason}</p>}
        </div>
        <div className="shrink-0 text-right leading-none">
          <span className="num text-xl font-semibold">{s100(item.score)}</span>
          <span className="block pt-1 text-[11px] text-muted">{scoreLabel}</span>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  )
}

export function BucketTabs({ run, link, role }: { run: AnalysisRun; link: (p: string) => string; role: Role | undefined }) {
  const available = BUCKET_ORDER.filter((b) => (run.buckets[b]?.length ?? 0) > 0)
  const [tab, setTab] = useState<Bucket>(available[0] ?? 'best_overall')
  if (available.length === 0) return null
  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      label="Career groups"
      tabs={available.map((b) => ({
        value: b,
        label: (
          <span className="inline-flex items-center gap-1.5">
            {bucketMeta(b, role).label}
            <span className="num rounded-md bg-surface px-1.5 text-[11px] text-muted hairline">{run.buckets[b].length}</span>
          </span>
        ),
      }))}
    >
      {available.map((b) => {
        const meta = bucketMeta(b, role)
        const items = run.buckets[b]
        const sameReason = items.every((x) => x.reason === items[0].reason)
        return (
          <TabPanel key={b} value={b} className="focus:outline-none">
            <p className={cx('mb-3 flex items-center gap-1 text-sm text-muted')}>
              {sameReason ? items[0].reason : meta.label}
              {meta.term && GLOSSARY[meta.term] && <InfoTip term={meta.term} />}
            </p>
            <ul className="space-y-2">
              {items.map((item) => (
                <BucketRow key={item.career_id} item={item} run={run} link={link} scoreLabel={meta.scoreLabel} showReason={!sameReason} />
              ))}
            </ul>
          </TabPanel>
        )
      })}
    </Tabs>
  )
}
