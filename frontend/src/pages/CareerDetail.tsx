// Career detail (/results/:careerId): why this score, can we afford it, how you match, data sources, similar
// paths, strengths and risks. Everything comes from the latest run plus catalogue and SWOT endpoints.
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Compass, SearchX } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { catalog } from '@/api/endpoints'
import { useLatestRun } from '@/api/queries'
import type { AnalysisRun, Recommendation } from '@/api/types'
import { AffordSection } from '@/components/results/AffordSection'
import { DataSources, FitGaps, SimilarPaths, SwotGrid } from '@/components/results/DetailSections'
import { Waterfall } from '@/components/results/Waterfall'
import { Roll } from '@/components/results/Roll'
import { BUCKET_ORDER, bucketMeta, findRec, useStudentLink } from '@/components/results/shared'
import { ConfidenceChip, FundingPill, ScoreLegend, TrustBadge } from '@/components/score'
import { Badge, EmptyState, ErrorState, InfoTip, Section, Skeleton } from '@/components/ui'
import { sectorLabel } from '@/lib/format'
import { useSession } from '@/state/session'

const NAV = [
  { id: 'why', label: 'Why this score' },
  { id: 'afford', label: 'Can we afford it' },
  { id: 'match', label: 'How you match' },
  { id: 'sources', label: 'Sources' },
  { id: 'similar', label: 'Similar paths' },
  { id: 'swot', label: 'Strengths and risks' },
]

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading career details">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="mt-4 h-40" />
      <Skeleton className="mt-6 h-10 w-full max-w-xl" />
      <Skeleton className="mt-6 h-72" />
      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-80 lg:col-span-7" />
        <Skeleton className="h-80 lg:col-span-5" />
      </div>
    </div>
  )
}

function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl pr-3 text-sm font-medium text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden /> All results
    </Link>
  )
}

function NotInRun({ careerId, run, back }: { careerId: string; run: AnalysisRun; back: string }) {
  const q = useQuery({ queryKey: ['career', careerId], queryFn: () => catalog.career(careerId), retry: false })
  const stretch = Object.values(run.buckets)
    .flat()
    .find((b) => b.career_id === careerId || b.career_id === q.data?.id)
  if (q.isLoading) return <DetailSkeleton />
  const name = q.data?.name ?? stretch?.career_name
  return (
    <div>
      <BackLink to={back} />
      <EmptyState
        icon={name ? <Compass className="h-6 w-6" aria-hidden /> : <SearchX className="h-6 w-6" aria-hidden />}
        title={name ? `${name} is outside the top ${run.recommendations.length}` : 'We could not find that career'}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to={back} className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-5 font-semibold text-primary-ink">
              Back to results
            </Link>
            {q.data && (
              <Link to={`/explore/${q.data.slug}`} className="inline-flex min-h-[44px] items-center rounded-xl bg-surface-2 px-5 font-semibold hairline">
                Explore this career
              </Link>
            )}
          </div>
        }
      >
        {name ? (
          <>
            {q.data?.short_description && <span className="block">{q.data.short_description}</span>}
            {stretch && <span className="mt-2 block">{stretch.reason}.</span>}
            <span className="mt-2 block">Full score details are shown for the ranked careers in these results.</span>
          </>
        ) : (
          'It may have been removed, or the link is incomplete. Your ranked careers are on the results page.'
        )}
      </EmptyState>
    </div>
  )
}

function Header({ rec }: { rec: Recommendation }) {
  const { user } = useSession()
  return (
    <header className="card relative overflow-hidden p-5 md:p-7">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num rounded-lg bg-surface-2 px-2 py-0.5 text-xs font-semibold hairline">#{rec.rank}</span>
            <span className="text-sm text-muted">{sectorLabel(rec.career.sector)}</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold leading-tight md:text-5xl">{rec.career.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <FundingPill value={rec.financial.affordability_class} />
            <ConfidenceChip score={rec.final_score} low={rec.ci_low} high={rec.ci_high} confidence={rec.confidence} />
            <InfoTip term="confidence" />
            <TrustBadge trust={rec.data_trust} />
          </div>
          {rec.buckets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {BUCKET_ORDER.filter((b) => rec.buckets.includes(b)).map((b) => (
                <Badge key={b} className="bg-surface-2 text-muted hairline">
                  {bucketMeta(b, user?.role).label}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 sm:text-right">
          <Roll value={rec.final_score * 100} className="block text-6xl font-semibold leading-none md:text-7xl" />
          <span className="mt-1 block text-xs text-muted">match score / 100</span>
        </div>
      </div>
    </header>
  )
}

export default function CareerDetail() {
  const { careerId } = useParams()
  const { user } = useSession()
  const latest = useLatestRun()
  const link = useStudentLink()
  const back = link('/results')

  if (latest.isLoading) return <DetailSkeleton />
  if (latest.error)
    return (
      <div>
        <BackLink to={back} />
        <ErrorState error={latest.error} onRetry={latest.refetch} title="This career could not load" />
      </div>
    )
  if (latest.isEmpty || !latest.run) {
    if (!latest.studentId && !latest.isEmpty) return <DetailSkeleton />
    return (
      <div>
        <BackLink to={back} />
        <EmptyState
          title="No results yet"
          action={
            <Link to={back} className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-5 font-semibold text-primary-ink">
              Go to results
            </Link>
          }
        >
          Career details appear once results have been made from the questionnaire and family budget.
        </EmptyState>
      </div>
    )
  }

  const run = latest.run
  const rec = findRec(run, careerId)
  if (!rec) return <NotInRun careerId={careerId ?? ''} run={run} back={back} />
  const you = user?.role === 'student' ? 'you' : 'the student'

  return (
    <div>
      <BackLink to={back} />
      <Header rec={rec} />

      <nav aria-label="On this page" className="no-scrollbar sticky top-16 z-10 -mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 py-2 md:mx-0 md:px-0">
        {NAV.map((n) => (
          <a key={n.id} href={`#${n.id}`} className="glass inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium text-muted hairline hover:text-ink">
            {n.label}
          </a>
        ))}
      </nav>

      <Section title="Why this score" subtitle="Six parts add up to the final score. Automation risk takes a little away." className="scroll-mt-32">
        <div id="why" className="grid scroll-mt-32 gap-4 lg:grid-cols-12">
          <div className="card p-5 lg:col-span-8">
            <Waterfall contributions={rec.contributions} finalScore={rec.final_score} />
            <ScoreLegend className="mt-4" />
          </div>
          <div className="card p-5 lg:col-span-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">In words</h3>
            <ul className="mt-3 space-y-3 text-[15px]">
              {rec.explanation.map((e, i) => (
                <li key={i} className="flex gap-2.5">
                  <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-neon/80" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Can we afford it?" subtitle="The cheapest sensible route PRISM found, and what it pays back." className="scroll-mt-32">
        <div id="afford" className="scroll-mt-32">
          <AffordSection f={rec.financial} alternatives={rec.alternative_pathways ?? []} link={link} />
        </div>
      </Section>

      <div className="mt-8 grid gap-x-6 lg:grid-cols-2">
        <Section title="How you match" subtitle={`Where ${you} ${you === 'you' ? 'are' : 'is'} below what this career usually needs.`}>
          <div id="match" className="scroll-mt-32">
            <FitGaps fit={rec.fit} you={you} />
          </div>
        </Section>
        <Section title="Where these numbers come from" subtitle="Checked figures come from published sources; the rest are estimates." className="lg:mt-0">
          <div id="sources" className="scroll-mt-32">
            <DataSources trust={rec.data_trust} />
          </div>
        </Section>
      </div>

      <Section title="Similar paths" subtitle="Careers that share skills with this one, in case plans change.">
        <div id="similar" className="scroll-mt-32">
          <SimilarPaths slug={rec.career.slug} run={run} link={link} />
        </div>
      </Section>

      <Section title="Strengths and risks">
        <div id="swot" className="scroll-mt-32">
          <SwotGrid runId={run.run_id} careerId={rec.career.id} />
        </div>
      </Section>
    </div>
  )
}
