// Plan (/plan): the student's path for one career: a metro-map roadmap, deadlines with reminders, SWOT,
// pathways, scholarships and skills, the family report, and a print-ready 2-page version.
import { useQuery } from '@tanstack/react-query'
import { Award, BookOpen, Download, ExternalLink, GitBranch, Map as MapIcon, Printer, Route, School, ShieldAlert, Sparkles, TrendingUp, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { analysis, type Lang } from '@/api/endpoints'
import { openBlob } from '@/api/client'
import { useDeadlines, useLatestRun } from '@/api/queries'
import type { AffordabilityClass, Roadmap, SwotItem, SwotReport } from '@/api/types'
import { DeadlineList } from '@/components/plan/Deadlines'
import { MetroMap, MilestoneLegend, MILESTONE } from '@/components/plan/Metro'
import { FundingPill, Money } from '@/components/score'
import { Badge, Button, Card, EmptyState, ErrorState, Field, PageHeader, PageSkeleton, Section, Select, Skeleton, Term, useToast } from '@/components/ui'
import { AFFORD, formatDate, sectorLabel } from '@/lib/format'
import { useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

export default function Plan() {
  const { user } = useSession()
  const latest = useLatestRun()
  const run = latest.run
  const top = run?.recommendations.slice(0, 10) ?? []
  const [careerId, setCareerId] = useState<string | undefined>()
  useEffect(() => {
    if (!careerId && top[0]) setCareerId(top[0].career.id)
  }, [careerId, top])

  const roadmap = useQuery({
    queryKey: ['roadmap', run?.run_id, careerId],
    enabled: !!run && !!careerId,
    queryFn: () => analysis.roadmap(run!.run_id, careerId),
  })
  const swot = useQuery({
    queryKey: ['swot', run?.run_id, careerId],
    enabled: !!run && !!careerId,
    queryFn: () => analysis.swot(run!.run_id, careerId),
  })

  if (latest.isLoading) return <PageSkeleton />
  if (latest.error) return <ErrorState error={latest.error} onRetry={latest.refetch} />
  if (!latest.studentId && user?.role === 'parent')
    return (
      <EmptyState icon={<MapIcon className="h-6 w-6" />} title="Link your child first" action={<Link to="/family"><Button>Go to Family</Button></Link>}>
        The plan is built from your child's results.
      </EmptyState>
    )
  if (latest.isEmpty || !run)
    return (
      <EmptyState
        icon={<MapIcon className="h-6 w-6" />}
        title="Your plan appears after your results"
        action={
          <Button onClick={() => latest.create.mutate()} loading={latest.create.isPending}>
            Create my results
          </Button>
        }
      >
        Finish the questions first. Then we turn your top career into a year-by-year plan with real deadlines.
      </EmptyState>
    )

  const selected = top.find((r) => r.career.id === careerId) ?? top[0]

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Your plan"
        title={selected ? `The road to ${selected.career.name}` : 'Your road ahead'}
        subtitle="Year by year: what to study, which exams to sit, which deadlines to watch, and where the money comes from."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <ReportButton runId={run.run_id} />
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
          </div>
        }
      />

      <div className="no-print max-w-md">
        <Field label="Career to plan for" htmlFor="plan-career" hint="Starts with your top match. Pick another to compare paths.">
          <Select id="plan-career" value={careerId ?? ''} onChange={(e) => setCareerId(e.target.value)}>
            {top.map((r) => (
              <option key={r.career.id} value={r.career.id}>
                #{r.rank} · {r.career.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* ---- interactive screen ---- */}
      <div className="space-y-10 print:hidden">
        <Section title="Roadmap" subtitle="Each stop is a step. A dashed ring means the date is estimated from earlier years.">
          {roadmap.isLoading ? (
            <Card>
              <Skeleton className="h-6 w-40" />
              <div className="mt-6 flex gap-6 overflow-hidden">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-48 shrink-0 space-y-3">
                    <Skeleton className="h-11 w-11 rounded-full" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </div>
            </Card>
          ) : roadmap.error ? (
            <ErrorState error={roadmap.error} onRetry={() => void roadmap.refetch()} title="The roadmap did not load" />
          ) : roadmap.data && roadmap.data.phases.some((p) => p.milestones.length) ? (
            <Card className="space-y-5">
              <MetroMap phases={roadmap.data.phases} />
              <div className="border-t border-[rgb(var(--line)/var(--line-alpha))] pt-4">
                <MilestoneLegend />
              </div>
            </Card>
          ) : (
            <EmptyState icon={<Route className="h-6 w-6" />} title="No steps for this career yet">
              Try another career from the list above.
            </EmptyState>
          )}
        </Section>

        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <Section title="Coming up" subtitle="Deadlines for your top careers, nearest first.">
            {latest.studentId && <DeadlineList studentId={latest.studentId} />}
          </Section>
          <div className="space-y-10">
            {roadmap.data && <Pathways r={roadmap.data} />}
            {roadmap.data && <Scholarships r={roadmap.data} />}
          </div>
        </div>

        <Section title={`Strengths, weaknesses, chances and risks`} subtitle={swot.data?.headline}>
          {swot.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : swot.error ? (
            <ErrorState error={swot.error} onRetry={() => void swot.refetch()} title="SWOT did not load" />
          ) : swot.data ? (
            <Swot s={swot.data} />
          ) : null}
        </Section>

        {roadmap.data && (
          <div className="grid gap-10 lg:grid-cols-2">
            <Skills r={roadmap.data} />
            <PlanB r={roadmap.data} />
          </div>
        )}
      </div>

      {/* ---- print-only document ---- */}
      {roadmap.data && <PrintPlan r={roadmap.data} studentId={latest.studentId} />}
    </div>
  )
}

// ------------------------------------------------------------------ report
function ReportButton({ runId }: { runId: string }) {
  const { settings } = useSettings()
  const toast = useToast()
  const [lang, setLang] = useState<Lang>(settings.language)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      openBlob(await analysis.report(runId, lang), `prism-family-report-${lang}.html`)
      toast('ok', 'Family report downloaded.')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not make the report.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-stretch gap-1">
      <label htmlFor="report-lang" className="sr-only">
        Report language
      </label>
      <Select id="report-lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="w-[92px]">
        <option value="en">English</option>
        <option value="ta">தமிழ்</option>
        <option value="hi">हिन्दी</option>
      </Select>
      <Button magnetic icon={<Download className="h-4 w-4" />} loading={busy} onClick={() => void go()}>
        Family report
      </Button>
    </div>
  )
}

// ------------------------------------------------------------------ side panels
function Pathways({ r }: { r: Roadmap }) {
  if (!r.ranked_pathways.length) return null
  return (
    <Section title="Ways in" subtitle="Courses that lead here, best first.">
      <ol className="space-y-3">
        {r.ranked_pathways.slice(0, 5).map((p) => (
          <Card key={p.pathway_id} as="article" className="flex gap-3 p-4">
            <div className="num grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-sm font-semibold hairline">{p.rank}</div>
            <div className="min-w-0 flex-1">
              <div className="font-medium leading-snug">{p.name}</div>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <School className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{p.institution_name}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {p.affordability_class in AFFORD && <FundingPill value={p.affordability_class as AffordabilityClass} />}
                <span className="text-muted">
                  Total cost <Money value={p.total_cost} className="text-ink" />
                </span>
                {p.entrance_exam_codes.map((c) => (
                  <Badge key={c} color="rgb(var(--market))">
                    {c.replace(/_/g, '-')}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </ol>
    </Section>
  )
}

function Scholarships({ r }: { r: Roadmap }) {
  return (
    <Section title="Scholarship deadlines">
      {r.scholarship_deadlines.length === 0 ? (
        <Card className="text-sm text-muted">
          No scholarship deadlines for this path right now. Look at <Link className="text-primary underline" to="/scholarships">all scholarships</Link>.
        </Card>
      ) : (
        <ul className="space-y-2">
          {r.scholarship_deadlines.map((m, i) => (
            <li key={`${m.title}-${i}`}>
              <Card className="flex gap-3 p-4">
                <Award className="mt-0.5 h-5 w-5 shrink-0 text-afford" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-snug">{m.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {m.due && <span className="num">{formatDate(m.due)}</span>}
                    {m.date_is_estimate && <Badge color="rgb(var(--muted))">Estimated</Badge>}
                    <span>{m.detail}</span>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Skills({ r }: { r: Roadmap }) {
  return (
    <Section title="Skills to build" subtitle="Small weekly habits that close the biggest gaps.">
      {r.skill_actions.length === 0 ? (
        <Card className="text-sm text-muted">No big gaps for this career. Keep doing what you are doing.</Card>
      ) : (
        <ul className="space-y-3">
          {r.skill_actions.map((s, i) => (
            <li key={i}>
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-roi" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{s.dimension_or_skill}</div>
                    <p className="mt-0.5 text-sm text-muted">{s.action}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge className="bg-surface-2 hairline">{s.weeks} weeks</Badge>
                      {s.resource_name &&
                        (s.resource_url ? (
                          <a href={s.resource_url} target="_blank" rel="noreferrer" className="inline-flex min-h-[32px] items-center gap-1 text-primary hover:underline">
                            <BookOpen className="h-3.5 w-3.5" aria-hidden /> {s.resource_name} <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <BookOpen className="h-3.5 w-3.5" aria-hidden /> {s.resource_name}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function PlanB({ r }: { r: Roadmap }) {
  if (!r.plan_b.length) return null
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" aria-hidden /> <Term id="plan_b">Plan B</Term> careers
        </span>
      }
      subtitle="Close cousins of this career that use the same strengths, in case plans change."
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {r.plan_b.map((c) => (
          <li key={c.id}>
            <Link to={`/careers/${c.slug}`} className="card flex min-h-[64px] flex-col justify-center p-4 transition-colors hover:bg-surface-2">
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted">{sectorLabel(c.sector)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ------------------------------------------------------------------ SWOT
const QUAD = [
  { key: 'strengths', label: 'Strengths', hint: 'What you already have going for you', Icon: TrendingUp, color: 'rgb(var(--ok))' },
  { key: 'weaknesses', label: 'Weaknesses', hint: 'What to work on', Icon: TriangleAlert, color: 'rgb(var(--warn))' },
  { key: 'opportunities', label: 'Opportunities', hint: 'Doors that are open', Icon: Sparkles, color: 'rgb(var(--market))' },
  { key: 'threats', label: 'Threats', hint: 'Things that could get in the way', Icon: ShieldAlert, color: 'rgb(var(--bad))' },
] as const

function Swot({ s }: { s: SwotReport }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {QUAD.map(({ key, label, hint, Icon, color }) => {
        const items = s[key] as SwotItem[]
        return (
          <Card key={key} className="relative overflow-hidden" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4" style={{ color }} aria-hidden />
              <h3 className="font-semibold">{label}</h3>
            </div>
            <p className="text-xs text-muted">{hint}</p>
            {items.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nothing stands out here.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {[...items]
                  .sort((a, b) => b.weight - a.weight)
                  .map((it, i) => (
                    <li key={i} className="text-sm">
                      <div className="font-medium">{it.title}</div>
                      <div className="text-muted">{it.detail}</div>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ print
function PrintPlan({ r, studentId }: { r: Roadmap; studentId?: string }) {
  const dl = useDeadlines(studentId)
  return (
    <article className="hidden text-black print:block [&_*]:!text-black">
      <h2 className="mb-1 text-xl font-bold">Roadmap · {r.career.name}</h2>
      <p className="mb-3 text-xs">Dates marked * are estimated from earlier years. Made with PRISM.</p>
      {r.phases.map((p) => (
        <section key={p.year_index} className="mb-3 break-inside-avoid">
          <h3 className="text-sm font-bold">{p.label}</h3>
          <table className="mt-1 w-full border-collapse text-xs">
            <tbody>
              {p.milestones.map((m, i) => (
                <tr key={i} className="border-b border-gray-300 align-top">
                  <td className="w-24 py-1 pr-2">{m.due ? formatDate(m.due) : '—'}{m.date_is_estimate ? '*' : ''}</td>
                  <td className="w-24 py-1 pr-2">{(MILESTONE[m.type] ?? MILESTONE.academic).label}</td>
                  <td className="py-1">
                    <b>{m.title}</b> {m.detail && <span>· {m.detail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <section className="mt-4 break-before-page">
        <h2 className="mb-2 text-lg font-bold">Deadlines</h2>
        <table className="w-full border-collapse text-xs">
          <tbody>
            {(dl.data?.items ?? []).map((d) => (
              <tr key={d.ref_id} className="border-b border-gray-300 align-top">
                <td className="w-24 py-1 pr-2">{formatDate(d.due)}</td>
                <td className="w-16 py-1 pr-2">{d.days_left} days</td>
                <td className="py-1">
                  <b>{d.title}</b> · {d.date_status} · {d.source_name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="mb-2 mt-4 text-lg font-bold">Scholarships</h2>
        <table className="w-full border-collapse text-xs">
          <tbody>
            {r.scholarship_deadlines.map((m, i) => (
              <tr key={i} className="border-b border-gray-300 align-top">
                <td className="w-24 py-1 pr-2">{m.due ? formatDate(m.due) : '—'}{m.date_is_estimate ? '*' : ''}</td>
                <td className="py-1">
                  <b>{m.title}</b> · {m.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </article>
  )
}

