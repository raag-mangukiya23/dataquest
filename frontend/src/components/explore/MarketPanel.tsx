// Job-market snapshot for a region: sector demand, fastest-rising careers and the ones most exposed to automation.
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Bot, CalendarClock, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { catalog } from '@/api/endpoints'
import { Badge, Card, EmptyState, ErrorState, Field, InfoTip, Select, Skeleton } from '@/components/ui'
import { ProvenanceBadge } from '@/components/score'
import { pct, sectorLabel } from '@/lib/format'
import { useSettings } from '@/state/settings'
import type { MarketSignal, Region } from '@/api/types'

export function MarketPanel({ regions, region, onRegion }: { regions: Region[]; region: string; onRegion: (code: string) => void }) {
  const { reducedMotion } = useSettings()
  const q = useQuery({ queryKey: ['market', region], queryFn: () => catalog.market(region), enabled: !!region })
  const m = q.data
  const sectors = m ? Object.entries(m.sector_summary).sort((a, b) => b[1] - a[1]) : []

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Field label="Region" htmlFor="market-region">
            <Select id="market-region" value={region} onChange={(e) => onRegion(e.target.value)}>
              {regions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                  {r.state ? `, ${r.state}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {m && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <CalendarClock className="h-4 w-4" aria-hidden />
            <Badge color={m.is_live ? 'rgb(var(--ok))' : 'rgb(var(--muted))'}>{m.is_live ? 'Latest data feed' : 'Snapshot'}</Badge>
            <span>
              {m.region.name} · period <span className="num text-ink">{m.period}</span>
            </span>
            <InfoTip text="These figures are a periodic snapshot, not a live count. They are refreshed when new data is published." />
          </div>
        )}
      </div>

      {q.isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      )}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} title="We could not load the job market" />}
      {m && sectors.length === 0 && m.signals.length === 0 && (
        <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="No market data for this region yet">
          Try a nearby city from the list above.
        </EmptyState>
      )}
      {m && (sectors.length > 0 || m.signals.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="min-w-0">
            <h3 className="flex items-center gap-1 font-semibold">
              Demand by sector <InfoTip term="market" />
            </h3>
            <p className="mb-4 text-xs text-muted">0 = few openings, 100 = many</p>
            <ul className="space-y-3">
              {sectors.map(([s, v], i) => (
                <li key={s}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="truncate">{sectorLabel(s)}</span>
                    <span className="num text-muted">{Math.round(v * 100)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className="h-full origin-left rounded-full"
                      style={{ background: 'linear-gradient(90deg, rgb(var(--market)), rgb(var(--neon)))', width: `${Math.max(0, Math.min(1, v)) * 100}%` }}
                      initial={reducedMotion ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <SignalList title="Rising fastest" icon={<TrendingUp className="h-4 w-4 text-ok" aria-hidden />} items={m.top_rising} metric={(s) => `+${pct(s.job_velocity)}`} metricLabel="growth in openings" color="rgb(var(--ok))" />
          <SignalList title="Most exposed to automation" icon={<Bot className="h-4 w-4 text-[rgb(var(--disrupt))]" aria-hidden />} items={m.most_disrupted} metric={(s) => pct(s.disruption_risk)} metricLabel="automation risk" color="rgb(var(--disrupt))" />
        </div>
      )}
    </div>
  )
}

function SignalList({ title, icon, items, metric, metricLabel, color }: { title: string; icon: ReactNode; items: MarketSignal[]; metric: (s: MarketSignal) => string; metricLabel: string; color: string }) {
  return (
    <Card className="min-w-0">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing to show for this region.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((s, i) => (
            <li key={s.career.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2.5 hairline">
              <span className="num w-5 text-center text-sm text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link to={`/explore/${s.career.slug}`} className="block truncate text-sm font-medium hover:text-primary">
                  {s.career.name}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  <span>
                    <span className="num font-semibold" style={{ color }}>
                      {metric(s)}
                    </span>{' '}
                    {metricLabel}
                  </span>
                </div>
              </div>
              <ProvenanceBadge p={s.provenance} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
