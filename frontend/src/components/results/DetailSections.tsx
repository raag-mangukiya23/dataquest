// Career detail sections: how you match, where the numbers come from, similar paths, strengths and risks.
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, CircleDashed, Lightbulb, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { analysis, catalog } from '@/api/endpoints'
import type { AnalysisRun, DataTrust, FitDetail, SwotItem, TrustInput } from '@/api/types'
import { Meter } from '@/components/score'
import { Badge, EmptyState, ErrorState, InfoTip, Skeleton } from '@/components/ui'
import { formatDate, pct, sectorLabel } from '@/lib/format'
import { recById } from './shared'

// ---------------------------------------------------------------- how you match
export function FitGaps({ fit, you }: { fit: FitDetail; you: string }) {
  if (!fit.gaps.length) {
    return (
      <div className="card p-5">
        <p className="text-sm text-muted">No big gaps: {you} already match{you === 'you' ? '' : 'es'} what this career usually needs.</p>
      </div>
    )
  }
  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full bg-fit" aria-hidden /> {you === 'you' ? 'You' : 'Student'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded bg-ink" aria-hidden /> Usually needed
        </span>
      </div>
      <ul className="space-y-4">
        {fit.gaps.map((g) => (
          <li key={g.dimension}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{g.label}</span>
              <span className="num shrink-0 text-xs text-muted">
                {Math.round(g.student * 100)} <span aria-hidden>→</span>
                <span className="sr-only">compared with</span> {Math.round(g.required * 100)}
              </span>
            </div>
            <div className="relative mt-2 h-3 rounded-full bg-surface-2" role="img" aria-label={`${g.label}: ${Math.round(g.student * 100)} now, ${Math.round(g.required * 100)} usually needed`}>
              <div className="absolute inset-y-0 left-0 rounded-full bg-fit" style={{ width: `${Math.min(1, g.student) * 100}%` }} />
              <div className="absolute -top-1 h-5 w-0.5 rounded bg-ink" style={{ left: `calc(${Math.min(1, g.required) * 100}% - 1px)` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">Gaps like these are normal at this age and usually close with practice and experience.</p>
    </div>
  )
}

// ---------------------------------------------------------------- where the numbers come from
function TrustRow({ i }: { i: TrustInput }) {
  const checked = !i.is_estimate && (i.verification === 'verified' || i.verification === 'secondary')
  const disputed = i.verification === 'disputed'
  return (
    <li className="flex items-start gap-3 py-3 hairline-b last:border-b-0">
      {checked ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium first-letter:uppercase">{i.name}</p>
        <p className="text-xs text-muted">
          {i.source_name} · as of {formatDate(i.as_of)}
        </p>
      </div>
      <Badge color={disputed ? 'rgb(var(--bad))' : checked ? 'rgb(var(--ok))' : 'rgb(var(--muted))'}>{disputed ? 'Disputed' : checked ? 'Checked' : 'Estimate'}</Badge>
    </li>
  )
}

const FRESH: Record<DataTrust['freshness'], { label: string; color: string }> = {
  fresh: { label: 'Up to date', color: 'rgb(var(--ok))' },
  aging: { label: 'Getting old', color: 'rgb(var(--warn))' },
  stale: { label: 'Out of date', color: 'rgb(var(--bad))' },
}

export function DataSources({ trust }: { trust: DataTrust }) {
  const f = FRESH[trust.freshness]
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={f.color}>{f.label}</Badge>
        <span className="flex items-center gap-1 text-xs text-muted">
          {pct(trust.verified_share)} checked <InfoTip term="checked" />
        </span>
      </div>
      <ul className="mt-2">
        {trust.inputs.map((i) => (
          <TrustRow key={i.name} i={i} />
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-muted">{trust.note}</p>
      <Link to="/app/trust" className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        How PRISM checks its data <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------- similar paths
const difficulty = (d: number) => (d < 0.34 ? 'Easy switch' : d < 0.67 ? 'Some retraining' : 'Big change')

export function SimilarPaths({ slug, run, link }: { slug: string; run: AnalysisRun; link: (p: string) => string }) {
  const q = useQuery({ queryKey: ['career-alternatives', slug], queryFn: () => catalog.alternatives(slug), staleTime: 10 * 60_000 })
  if (q.isLoading)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    )
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Similar paths could not load" />
  const items = q.data ?? []
  if (!items.length)
    return (
      <EmptyState title="No close neighbours yet">
        This career does not share many skills with others in PRISM.{' '}
        <Link to="/explore" className="font-semibold text-primary">
          Explore all careers
        </Link>
      </EmptyState>
    )
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.slice(0, 6).map((a) => {
        const inRun = recById(run, a.career.id)
        return (
          <li key={a.career.id}>
            <Link to={inRun ? link(`/results/${a.career.slug}`) : `/explore/${a.career.slug}`} className="card flex h-full flex-col gap-2 p-4 transition-colors hover:bg-surface-2/60">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{a.career.name}</p>
                  <p className="text-xs text-muted">{sectorLabel(a.career.sector)}</p>
                </div>
                {inRun && <span className="num shrink-0 text-xs text-muted">#{inRun.rank}</span>}
              </div>
              <p className="text-sm text-ink/85">{a.why}</p>
              <div className="mt-auto space-y-1.5 pt-1">
                <div className="flex justify-between text-xs text-muted">
                  <span>Shared skills</span>
                  <span className="num">{pct(a.skill_overlap)}</span>
                </div>
                <Meter value={a.skill_overlap} label="Shared skills" />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Badge className="bg-surface-2 text-muted hairline">{difficulty(a.transition_difficulty)}</Badge>
                  {a.interdisciplinary && <Badge className="bg-surface-2 text-muted hairline">Cross-field</Badge>}
                </div>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------- strengths and risks
const QUAD: { key: 'strengths' | 'weaknesses' | 'opportunities' | 'threats'; title: string; icon: typeof Sparkles; color: string }[] = [
  { key: 'strengths', title: 'Strengths', icon: Sparkles, color: 'rgb(var(--ok))' },
  { key: 'weaknesses', title: 'To work on', icon: Lightbulb, color: 'rgb(var(--warn))' },
  { key: 'opportunities', title: 'Opportunities', icon: TrendingUp, color: 'rgb(var(--neon))' },
  { key: 'threats', title: 'Risks', icon: ShieldAlert, color: 'rgb(var(--bad))' },
]

export function SwotGrid({ runId, careerId }: { runId: string; careerId: string }) {
  const q = useQuery({ queryKey: ['swot', runId, careerId], queryFn: () => analysis.swot(runId, careerId), staleTime: 5 * 60_000 })
  if (q.isLoading)
    return (
      <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
        {QUAD.map((x) => (
          <Skeleton key={x.key} className="h-40" />
        ))}
      </div>
    )
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Strengths and risks could not load" />
  const s = q.data
  if (!s) return null
  const total = QUAD.reduce((n, x) => n + s[x.key].length, 0)
  if (!total) return <EmptyState title="Nothing stands out yet">With more questionnaire answers, PRISM can say more here.</EmptyState>
  return (
    <div>
      {s.headline && <p className="mb-3 text-[15px] text-ink/90">{s.headline}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {QUAD.map(({ key, title, icon: Icon, color }) => {
          const items: SwotItem[] = s[key]
          return (
            <section key={key} aria-label={title} className="card p-5" style={{ boxShadow: `inset 3px 0 0 0 ${color}` }}>
              <h3 className="flex items-center gap-2 font-semibold">
                <Icon className="h-4 w-4" style={{ color }} aria-hidden /> {title}
              </h3>
              {items.length ? (
                <ul className="mt-3 space-y-3">
                  {items.map((it, i) => (
                    <li key={i}>
                      <p className="text-sm font-medium">{it.title}</p>
                      <p className="text-sm text-muted">{it.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">Nothing notable here.</p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
