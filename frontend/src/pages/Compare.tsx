// Compare (/compare): two or three careers from the latest run, side by side. The best value in each row is
// marked with a subtle tint and a "Best" label (never colour alone).
import { useQueries } from '@tanstack/react-query'
import { Check, Crown, GitCompareArrows, Sparkles, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { catalog } from '@/api/endpoints'
import { useLatestRun } from '@/api/queries'
import type { Recommendation } from '@/api/types'
import { Roll } from '@/components/results/Roll'
import { AFFORD_ORDER, s100, useStudentLink } from '@/components/results/shared'
import { FundingPill, Money, ScoreBar, ScoreLegend, TrustBadge } from '@/components/score'
import { Badge, EmptyState, ErrorState, InfoTip, PageHeader, Skeleton, cx } from '@/components/ui'
import { COMPONENTS, pct, sectorLabel } from '@/lib/format'

type Exams = Record<string, { codes: string[] | undefined; loading: boolean; failed: boolean }>

interface RowDef {
  key: string
  label: ReactNode
  /** ids of the best career(s) in this row; empty = no "best" */
  best: (recs: Recommendation[]) => string[]
  cell: (r: Recommendation) => ReactNode
}

const checkedCount = (r: Recommendation) => r.data_trust.inputs.filter((i) => !i.is_estimate && (i.verification === 'verified' || i.verification === 'secondary')).length

/** ids whose value equals the best value (ties all win); nothing when every value is the same. */
function bestBy(recs: Recommendation[], value: (r: Recommendation) => number | null, higher: boolean): string[] {
  const vals = recs.map((r) => value(r))
  const present = vals.filter((v): v is number => v !== null)
  if (!present.length) return []
  const target = higher ? Math.max(...present) : Math.min(...present)
  const winners = recs.filter((_, i) => vals[i] !== null && Math.abs((vals[i] as number) - target) < 1e-9)
  return winners.length === recs.length ? [] : winners.map((r) => r.career.id)
}

function rowsFor(exams: Exams): RowDef[] {
  return [
    {
      key: 'final',
      label: 'Match score',
      best: (rs) => bestBy(rs, (r) => r.final_score, true),
      cell: (r) => (
        <span className="text-3xl font-semibold leading-none">
          <Roll value={r.final_score * 100} />
          <span className="text-xs font-normal text-muted"> /100</span>
        </span>
      ),
    },
    {
      key: 'split',
      label: (
        <span className="inline-flex items-center gap-1">
          Six-part split <InfoTip text="Points each part adds to the match score. Automation risk takes a little away." />
        </span>
      ),
      best: () => [],
      cell: (r) => <SplitCell r={r} />,
    },
    {
      key: 'funding',
      label: 'Funding',
      best: (rs) => bestBy(rs, (r) => -AFFORD_ORDER.indexOf(r.financial.affordability_class), true),
      cell: (r) => <FundingPill value={r.financial.affordability_class} />,
    },
    {
      key: 'cost',
      label: 'Total cost',
      best: (rs) => bestBy(rs, (r) => r.financial.total_cost, false),
      cell: (r) => (
        <span>
          <Money value={r.financial.total_cost} className="text-lg font-semibold" />
          <span className="block text-xs text-muted">
            {r.financial.pathway_name} · {r.financial.duration_years} yrs
          </span>
        </span>
      ),
    },
    {
      key: 'salary',
      label: 'First-year pay',
      best: (rs) => bestBy(rs, (r) => r.financial.roi.starting_salary, true),
      cell: (r) => (
        <span>
          <Money value={r.financial.roi.starting_salary} className="text-lg font-semibold" />
          <span className="text-xs text-muted"> /yr</span>
        </span>
      ),
    },
    {
      key: 'payback',
      label: (
        <span className="inline-flex items-center gap-1">
          Pays back in <InfoTip term="roi" />
        </span>
      ),
      best: (rs) => bestBy(rs, (r) => r.financial.roi.payback_years ?? Number.POSITIVE_INFINITY, false),
      cell: (r) =>
        r.financial.roi.payback_years === null ? (
          <span className="text-sm text-warn">Not within 10 years</span>
        ) : (
          <span className="text-lg font-semibold">
            <span className="num">{r.financial.roi.payback_years}</span> <span className="text-xs font-normal text-muted">years</span>
          </span>
        ),
    },
    {
      key: 'admission',
      label: (
        <span className="inline-flex items-center gap-1">
          Admission chance <InfoTip term="admission" />
        </span>
      ),
      best: (rs) => bestBy(rs, (r) => r.financial.admission_chance, true),
      cell: (r) => <span className={cx('num text-lg font-semibold', r.financial.admission_chance < 0.6 && 'text-warn')}>{pct(r.financial.admission_chance)}</span>,
    },
    {
      key: 'exams',
      label: 'Entrance exams',
      best: () => [],
      cell: (r) => {
        const e = exams[r.career.slug]
        if (!e || e.loading) return <Skeleton className="h-6 w-32" />
        if (e.failed || !e.codes) return <span className="text-sm text-muted">Not available right now</span>
        if (!e.codes.length) return <span className="text-sm text-muted">No entrance exam listed</span>
        return (
          <span className="flex flex-wrap gap-1.5">
            {e.codes.map((c) => (
              <Badge key={c} className="num bg-surface-2 text-ink hairline">
                {c.replace(/_/g, ' ')}
              </Badge>
            ))}
          </span>
        )
      },
    },
    {
      key: 'trust',
      label: (
        <span className="inline-flex items-center gap-1">
          Data checked <InfoTip term="checked" />
        </span>
      ),
      best: (rs) => bestBy(rs, (r) => (r.data_trust.inputs.length ? checkedCount(r) / r.data_trust.inputs.length : 0), true),
      cell: (r) => <TrustBadge trust={r.data_trust} />,
    },
  ]
}

function SplitCell({ r }: { r: Recommendation }) {
  return (
    <div className="w-full">
      <ScoreBar contributions={r.contributions} height={10} />
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
        {COMPONENTS.map((c) => {
          const v = r.contributions.find((x) => x.component === c.key)
          return (
            <div key={c.key} className="flex items-center justify-between gap-2 text-xs">
              <dt className="flex min-w-0 items-center gap-1.5 text-muted">
                <span className={cx('h-2 w-2 shrink-0 rounded-full', c.key === 'disruption' && 'hatch')} style={c.key === 'disruption' ? undefined : { background: c.color }} aria-hidden />
                <span className="truncate">{c.short}</span>
              </dt>
              <dd className="num">{v ? `${v.contribution >= 0 ? '+' : '−'}${Math.abs(v.contribution * 100).toFixed(1)}` : '—'}</dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

function BestMark() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">
      <Crown className="h-3 w-3" aria-hidden /> Best
    </span>
  )
}

function CompareSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-2/3 max-w-md" />
      <Skeleton className="mt-3 h-4 w-1/2 max-w-sm" />
      <div className="mt-6 flex gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-36" />
        ))}
      </div>
      <Skeleton className="mt-6 h-[28rem]" />
    </div>
  )
}

export default function Compare() {
  const latest = useLatestRun()
  const link = useStudentLink()
  const recs = latest.run?.recommendations ?? []
  const [picked, setPicked] = useState<string[] | null>(null)
  const chosenIds = picked ?? recs.slice(0, 3).map((r) => r.career.id)
  const chosen = recs.filter((r) => chosenIds.includes(r.career.id))

  const examQs = useQueries({
    queries: chosen.map((r) => ({
      queryKey: ['career', r.career.slug],
      queryFn: () => catalog.career(r.career.slug),
      staleTime: 10 * 60_000,
      retry: false,
    })),
  })
  const exams: Exams = {}
  chosen.forEach((r, i) => {
    const q = examQs[i]
    exams[r.career.slug] = { codes: q?.data?.related_exam_codes, loading: !!q?.isLoading, failed: !!q?.error }
  })
  const rows = rowsFor(exams)

  const header = <PageHeader eyebrow="Compare" title="Careers side by side" subtitle="Pick two or three careers from your results. The best value in each row is marked." />

  if (latest.isLoading) return <CompareSkeleton />
  if (latest.error)
    return (
      <div>
        {header}
        <ErrorState error={latest.error} onRetry={latest.refetch} title="Your results could not load" />
      </div>
    )
  if (latest.isEmpty || !latest.run || recs.length < 2) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<GitCompareArrows className="h-6 w-6" aria-hidden />}
          title={latest.isEmpty || !latest.run ? 'No results to compare yet' : 'Only one career to show'}
          action={
            <Link to={link('/results')} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-ink">
              <Sparkles className="h-4 w-4" aria-hidden /> Go to results
            </Link>
          }
        >
          Comparing needs at least two ranked careers. They come from the questionnaire and the family budget.
        </EmptyState>
      </div>
    )
  }

  const toggle = (id: string) => {
    const cur = chosenIds
    if (cur.includes(id)) setPicked(cur.filter((x) => x !== id))
    else if (cur.length < 3) setPicked([...cur, id])
  }
  const bests = Object.fromEntries(rows.map((row) => [row.key, chosen.length >= 2 ? row.best(chosen) : []]))

  return (
    <div>
      {header}

      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">
          Choose careers <span className="text-muted">({chosen.length} of 3)</span>
        </legend>
        <div className="no-scrollbar relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {recs.map((r) => {
            const on = chosenIds.includes(r.career.id)
            const disabled = !on && chosenIds.length >= 3
            return (
              <button
                key={r.career.id}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggle(r.career.id)}
                title={disabled ? 'You can compare up to three. Remove one first.' : undefined}
                className={cx(
                  'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors',
                  on ? 'bg-primary/15 text-ink ring-1 ring-primary/60' : 'bg-surface-2 text-muted hairline hover:text-ink',
                  disabled && 'cursor-not-allowed opacity-45 hover:text-muted',
                )}
              >
                {on ? <Check className="h-4 w-4 text-primary" aria-hidden /> : <span className="num text-xs">#{r.rank}</span>}
                {r.career.name}
              </button>
            )
          })}
        </div>
      </fieldset>

      {chosen.length < 2 ? (
        <div className="mt-6">
          <EmptyState icon={<GitCompareArrows className="h-6 w-6" aria-hidden />} title="Pick one more career">
            Choose at least two careers above to see them side by side.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* desktop: a real table */}
          <div className="card mt-6 hidden overflow-hidden md:block">
            <table className="w-full table-fixed border-collapse text-left">
              <caption className="sr-only">Comparison of {chosen.map((c) => c.career.name).join(', ')}</caption>
              <colgroup>
                <col className="w-44" />
                {chosen.map((c) => (
                  <col key={c.career.id} />
                ))}
              </colgroup>
              <thead>
                <tr className="hairline-b">
                  <th scope="col" className="p-4 align-bottom text-xs font-medium uppercase tracking-wider text-muted">
                    Career
                  </th>
                  {chosen.map((c) => (
                    <th key={c.career.id} scope="col" className="p-4 align-top">
                      <ColumnHead r={c} to={link(`/results/${c.career.slug}`)} onRemove={chosen.length > 2 ? () => toggle(c.career.id) : undefined} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="hairline-b last:border-b-0">
                    <th scope="row" className="p-4 align-top text-sm font-medium text-muted">
                      {row.label}
                    </th>
                    {chosen.map((c) => {
                      const isBest = bests[row.key].includes(c.career.id)
                      return (
                        <td key={c.career.id} className={cx('p-4 align-top', isBest && 'bg-ok/[0.06]')}>
                          <div className="flex flex-col items-start gap-1.5">
                            {row.cell(c)}
                            {isBest && <BestMark />}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hairline-t p-4">
              <ScoreLegend />
            </div>
          </div>

          {/* phones: swipeable cards */}
          <p className="mt-5 text-xs text-muted md:hidden">Swipe to see each career.</p>
          <ul className="no-scrollbar relative -mx-4 mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Careers being compared">
            {chosen.map((c) => (
              <li key={c.career.id} className="card w-[84%] shrink-0 snap-center p-4">
                <ColumnHead r={c} to={link(`/results/${c.career.slug}`)} onRemove={chosen.length > 2 ? () => toggle(c.career.id) : undefined} />
                <dl className="mt-3">
                  {rows.map((row) => {
                    const isBest = bests[row.key].includes(c.career.id)
                    return (
                      <div key={row.key} className={cx('-mx-2 rounded-xl px-2 py-3 hairline-b last:border-b-0', isBest && 'bg-ok/[0.06]')}>
                        <dt className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wider text-muted">
                          <span>{row.label}</span>
                          {isBest && <BestMark />}
                        </dt>
                        <dd>{row.cell(c)}</dd>
                      </div>
                    )
                  })}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ColumnHead({ r, to, onRemove }: { r: Recommendation; to: string; onRemove?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <span className="num text-xs text-muted">#{r.rank}</span>
        <Link to={to} className="block text-lg font-semibold leading-snug hover:text-primary hover:underline">
          {r.career.name}
        </Link>
        <span className="block text-xs font-normal text-muted">{sectorLabel(r.career.sector)}</span>
        <span className="sr-only">score {s100(r.final_score)}</span>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${r.career.name} from the comparison`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

