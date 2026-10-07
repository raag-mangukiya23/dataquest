// Parent mode: large type, money first, four sections (Top careers, Can we afford it, Talk together, Important
// dates). Every figure comes from the run, the deadlines endpoint or the narrative.
import { ArrowRight, CalendarDays, HandCoins, MessagesSquare, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useDeadlines } from '@/api/queries'
import type { AnalysisRun, Recommendation } from '@/api/types'
import { BandPill, DateStatusTag, FundingPill, Money } from '@/components/score'
import { EmptyState, ErrorState, InfoTip, Skeleton } from '@/components/ui'
import { formatDate, sectorLabel } from '@/lib/format'
import { NarrativeCard } from './NarrativeCard'
import { s100 } from './shared'

function Block({ id, icon, title, children, action }: { id: string; icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="card p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2.5 text-xl font-semibold md:text-2xl">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function MoneyRow({ label, value, info, strong }: { label: ReactNode; value: number | null | undefined; info?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 hairline-b last:border-b-0">
      <dt className="flex items-center gap-1 text-base text-muted">
        {label}
        {info && <InfoTip term={info} />}
      </dt>
      <dd className={strong ? 'text-2xl font-semibold' : 'text-lg font-medium'}>
        <Money value={value} compact={false} />
      </dd>
    </div>
  )
}

function AffordCard({ rec, link }: { rec: Recommendation; link: (p: string) => string }) {
  const f = rec.financial
  return (
    <article className="rounded-2xl bg-surface-2/60 p-4 hairline md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold">{rec.career.name}</h3>
          <p className="text-sm text-muted">
            {f.pathway_name} · {f.duration_years} years
          </p>
        </div>
        <FundingPill value={f.affordability_class} />
      </div>
      <dl className="mt-3">
        <MoneyRow label="Total cost" value={f.total_cost} strong />
        <MoneyRow label="Family money for it" value={f.family_funds} />
        <MoneyRow label="Scholarships (likely)" value={f.scholarship_expected} />
        <MoneyRow label="Loan needed" value={f.loan_required} />
        <MoneyRow label="Monthly EMI" value={f.monthly_emi} info="emi" />
        {(f.funding_gap ?? 0) > 0 && <MoneyRow label="Still missing" value={f.funding_gap} />}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {(f.loan_required ?? 0) > 0 && (
          <Link to={link(`/loans?amount=${f.loan_required}&years=${f.duration_years}`)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-surface px-4 text-base font-semibold hairline hover:bg-primary/15">
            Explain this loan <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
        <Link to={link(`/results/${rec.career.slug}`)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-base font-semibold text-primary hover:underline">
          Full details <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  )
}

function Dates({ studentId, link }: { studentId: string; link: (p: string) => string }) {
  const q = useDeadlines(studentId)
  if (q.isLoading)
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    )
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Dates could not load" />
  const items = (q.data?.items ?? []).filter((d) => d.days_left >= 0).slice(0, 4)
  if (!items.length)
    return (
      <EmptyState title="No dates in the next year">
        When exams or scholarships for these careers open, they will appear here. <Link to={link('/exams')} className="font-semibold text-primary">See the exam calendar</Link>.
      </EmptyState>
    )
  return (
    <ul className="space-y-2">
      {items.map((d) => (
        <li key={d.ref_id} className="flex items-center gap-4 rounded-2xl bg-surface-2/60 p-4 hairline">
          <div className="w-16 shrink-0 text-center leading-none">
            <span className="num block text-3xl font-semibold">{d.days_left}</span>
            <span className="block pt-1 text-xs text-muted">{d.days_left === 1 ? 'day left' : 'days left'}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium">{d.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              {formatDate(d.due)} <DateStatusTag status={d.date_status} />
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ParentView({ run, studentId, link }: { run: AnalysisRun; studentId: string; link: (p: string) => string }) {
  const top = run.recommendations.slice(0, 3)
  const first = top[0]
  const c = run.conflict
  return (
    <div className="space-y-5 text-[17px]">
      {first && (
        <section aria-label="Money summary" className="card relative overflow-hidden p-5 md:p-7">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-afford/10 blur-3xl" />
          <p className="relative text-sm font-semibold uppercase tracking-[0.16em] text-neon">Top choice</p>
          <h2 className="relative mt-1 text-3xl font-bold md:text-4xl">{first.career.name}</h2>
          <div className="relative mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <p className="text-base text-muted">Total cost of the course</p>
              <Money value={first.financial.total_cost} className="text-4xl font-semibold md:text-5xl" />
            </div>
            <FundingPill value={first.financial.affordability_class} />
          </div>
          <p className="relative mt-3 text-base text-muted">
            {first.financial.pathway_name} at {first.financial.institution_name}, {first.financial.duration_years} years.
          </p>
        </section>
      )}

      <NarrativeCard runId={run.run_id} large />

      <Block id="pm-top" icon={<Trophy className="h-5 w-5" aria-hidden />} title="Top careers">
        <ol className="space-y-2">
          {top.map((r) => (
            <li key={r.career.id}>
              <Link to={link(`/results/${r.career.slug}`)} className="flex min-h-[64px] items-center gap-4 rounded-2xl bg-surface-2/60 p-4 hairline hover:bg-surface-2">
                <span className="num grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-lg font-semibold hairline">{r.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{r.career.name}</span>
                  <span className="block text-sm text-muted">{sectorLabel(r.career.sector)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <Money value={r.financial.total_cost} className="block text-lg font-semibold" />
                  <span className="text-xs text-muted">score {s100(r.final_score)}/100</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Block>

      <Block id="pm-afford" icon={<HandCoins className="h-5 w-5" aria-hidden />} title="Can we afford it?">
        <div className="grid gap-3 lg:grid-cols-3">
          {top.map((r) => (
            <AffordCard key={r.career.id} rec={r} link={link} />
          ))}
        </div>
      </Block>

      <Block
        id="pm-talk"
        icon={<MessagesSquare className="h-5 w-5" aria-hidden />}
        title="Talk together"
        action={<BandPill value={c.band} />}
      >
        <p className="text-lg">{c.summary}</p>
        {c.top_drivers.length > 0 && (
          <ul className="mt-4 space-y-2">
            {c.top_drivers.map((d) => (
              <li key={d.dimension} className="rounded-2xl bg-surface-2/60 p-4 text-lg hairline">
                “{d.conversation_prompt}”
              </li>
            ))}
          </ul>
        )}
        <Link to={link('/family/meeting')} className="mt-4 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-ink">
          Start a family meeting <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </Block>

      <Block id="pm-dates" icon={<CalendarDays className="h-5 w-5" aria-hidden />} title="Important dates">
        <Dates studentId={studentId} link={link} />
      </Block>
    </div>
  )
}
