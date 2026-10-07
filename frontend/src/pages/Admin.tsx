// Admin: k-anonymised usage analytics, self-reported outcomes and the data refresh panel.
import { useMutation, useQuery } from '@tanstack/react-query'
import { BarChart3, DatabaseZap, EyeOff, Play } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { admin, catalog, outcomes } from '@/api/endpoints'
import type { AdminAnalytics, CountRow, RefreshResult } from '@/api/types'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Section, Select, Skeleton, Switch, Field } from '@/components/ui'
import { CountUp } from '@/components/score'
import { AFFORD, BAND, formatDate, pct } from '@/lib/format'
import { humanKey } from '@/components/system/shared'

function groupWarnings(ws: string[]) {
  const m = new Map<string, { sample: string; count: number }>()
  for (const w of ws) {
    const k = w.replace(/[-+]?\d+(\.\d+)?/g, '#')
    const g = m.get(k)
    if (g) g.count++
    else m.set(k, { sample: w, count: 1 })
  }
  return [...m.values()]
}
import type { AffordabilityClass, ConflictBand } from '@/api/types'

export default function Admin() {
  const a = useQuery({ queryKey: ['admin', 'analytics'], queryFn: admin.analytics })
  if (a.isLoading) return <PageSkeleton />
  if (a.error) return <ErrorState error={a.error} onRetry={() => void a.refetch()} title="Could not load analytics" />
  const d = a.data!
  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="How PRISM is being used"
        subtitle={`Anonymous totals as of ${formatDate(d.generated_at)}. Any group smaller than ${d.k_anonymity_threshold} people is hidden so no one can be identified.`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Students" value={d.students_total} />
        <Tile label="Families linked" value={d.families_linked} />
        <Tile label="Analyses run" value={d.runs_total} />
        <Tile label="Median run time" value={d.median_run_ms} suffix=" ms" />
      </div>
      {d.suppressed_groups > 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="num font-semibold text-ink">{d.suppressed_groups}</span> small groups are hidden from the charts below to protect privacy.
          </span>
        </p>
      )}

      <Charts d={d} />

      <RefreshPanel />
    </div>
  )
}

function Charts({ d }: { d: AdminAnalytics }) {
  const regions = useQuery({ queryKey: ['catalog', 'regions'], queryFn: catalog.regions, staleTime: 10 * 60_000 })
  const regionName: Record<string, string> = {}
  for (const r of regions.data ?? []) regionName[r.code] = r.name
  const charts = [
    { title: 'Top recommended careers', rows: d.top_recommended_careers, color: 'rgb(var(--fit))' },
    {
      title: 'Funding class across recommendations',
      rows: d.affordability_class_distribution,
      label: (k: string) => AFFORD[k as AffordabilityClass]?.label ?? humanKey(k),
      colorFor: (k: string) => AFFORD[k as AffordabilityClass]?.color,
    },
    {
      title: 'Family agreement',
      rows: d.conflict_band_distribution,
      label: (k: string) => BAND[k as ConflictBand]?.label ?? humanKey(k),
      colorFor: (k: string) => BAND[k as ConflictBand]?.color,
    },
    { title: 'Regions', rows: d.region_distribution, color: 'rgb(var(--market))', label: (k: string) => regionName[k] ?? k },
    { title: 'Interest codes (Holland)', rows: d.riasec_code_distribution, color: 'rgb(var(--family))' },
  ]
  const shown = charts.filter((c) => c.rows.length > 0)
  const hidden = charts.filter((c) => c.rows.length === 0)
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-2">
      {shown.map((c) => (
        <ChartCard key={c.title} {...c} />
      ))}
      {hidden.length > 0 && (
        <Card>
          <h3 className="mb-2 flex items-center gap-2 font-semibold">
            <EyeOff className="h-4 w-4 text-muted" aria-hidden /> Hidden to protect privacy
          </h3>
          <p className="text-sm text-muted">Not enough people yet to show these without risking identifying someone:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hidden.map((c) => (
              <Badge key={c.title} color="rgb(var(--muted))">
                {c.title}
              </Badge>
            ))}
          </div>
        </Card>
      )}
      <OutcomesCard />
    </div>
  )
}

function Tile({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className="num mt-1 text-3xl font-semibold">
        <CountUp value={value} suffix={suffix} />
      </div>
    </Card>
  )
}

function ChartCard({ title, rows, color = 'rgb(var(--primary))', label = (k) => k, colorFor }: { title: string; rows: CountRow[]; color?: string; label?: (k: string) => string; colorFor?: (k: string) => string | undefined }) {
  const data = rows.map((r) => ({ name: label(r.key), key: r.key, count: r.count }))
  return (
    <Card>
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <BarChart3 className="h-4 w-4 text-muted" aria-hidden /> {title}
      </h3>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Not enough people yet to show this without identifying anyone.</p>
      ) : (
        <div style={{ height: Math.max(140, data.length * 40 + 30) }} role="img" aria-label={`${title}: ${data.map((x) => `${x.name} ${x.count}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="rgb(var(--line) / var(--line-alpha))" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'rgb(var(--ink))', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgb(var(--surface-2))' }}
                contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line) / 0.12)', borderRadius: 12, color: 'rgb(var(--ink))' }}
                labelStyle={{ color: 'rgb(var(--ink))' }}
              />
              <Bar dataKey="count" name="Count" radius={[0, 6, 6, 0]} barSize={18}>
                {data.map((x) => (
                  <Cell key={x.key} fill={colorFor?.(x.key) ?? color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function OutcomesCard() {
  const q = useQuery({ queryKey: ['admin', 'outcomes'], queryFn: outcomes.summary })
  return (
    <Card>
      <h3 className="mb-1 font-semibold">What families decided</h3>
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load outcomes" />
      ) : q.data ? (
        <>
          <p className="mb-4 text-sm text-muted">{q.data.notice}</p>
          <div className="mb-4 flex items-center gap-2">
            <span className="num text-3xl font-semibold">{q.data.responses}</span>
            <span className="text-sm text-muted">{q.data.responses === 1 ? 'response' : 'responses'}</span>
            {q.data.suppressed && (
              <Badge color="rgb(var(--warn))">
                <EyeOff className="h-3.5 w-3.5" aria-hidden /> Hidden until 5 respond
              </Badge>
            )}
          </div>
          {!q.data.suppressed && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Kv k="Chose a top-3 career" v={pct(q.data.followed_top3_share)} />
              <Kv k="Chose a top-10 career" v={pct(q.data.followed_top10_share)} />
              <Kv k="Average happiness" v={q.data.mean_satisfaction == null ? '—' : `${q.data.mean_satisfaction.toFixed(1)} / 5`} />
              <Kv k="Got a scholarship" v={pct(q.data.scholarship_received_share)} />
              {Object.entries(q.data.by_status).map(([k, n]) => (
                <Kv key={k} k={humanKey(k)} v={String(n)} />
              ))}
            </dl>
          )}
        </>
      ) : null}
    </Card>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3 hairline">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="num mt-0.5 font-semibold">{v}</dd>
    </div>
  )
}

const SOURCES = [
  { value: 'seed', label: 'Seed snapshot (bundled files)' },
  { value: 'csv', label: 'CSV files in the data folder' },
  { value: 'adapter', label: 'Live adapters (e.g. Adzuna, when keys are set)' },
]

function RefreshPanel() {
  const [source, setSource] = useState('seed')
  const [dry, setDry] = useState(true)
  const run = useMutation({ mutationFn: () => admin.refresh({ source, dry_run: dry }) })
  return (
    <Section title="Refresh the data" subtitle="Reload the market, salary, career and scholarship tables. Try a dry run first: it shows what would change without writing anything." className="mt-10">
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card className="h-fit space-y-4">
          <Field label="Where to load from" htmlFor="src">
            <Select id="src" value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Switch checked={dry} onChange={setDry} label="Dry run" description="Check only; nothing is saved." />
          <Button onClick={() => run.mutate()} loading={run.isPending} icon={<Play className="h-4 w-4" />} variant={dry ? 'secondary' : 'primary'} className="w-full">
            {dry ? 'Run a dry run' : 'Refresh now'}
          </Button>
        </Card>
        <div>
          {run.error ? (
            <ErrorState error={run.error} onRetry={() => run.mutate()} title="The refresh did not run" />
          ) : run.data ? (
            <RefreshView r={run.data} />
          ) : (
            <EmptyState icon={<DatabaseZap className="h-6 w-6" />} title="No refresh run yet">
              Results and any warnings appear here.
            </EmptyState>
          )}
        </div>
      </div>
    </Section>
  )
}

function RefreshView({ r }: { r: RefreshResult }) {
  const cols = Array.from(new Set(Object.values(r.counts).flatMap((c) => Object.keys(c))))
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge color={r.status.includes('fail') ? 'rgb(var(--bad))' : 'rgb(var(--ok))'}>{humanKey(r.status)}</Badge>
        <span className="text-sm text-muted">from {r.source}</span>
        <span className="num ml-auto text-xs text-muted">job {r.job_id.slice(0, 8)}</span>
      </div>
      {cols.length === 0 || Object.keys(r.counts).length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted hairline">
          {r.status.includes('dry') ? 'Dry run: nothing was written, and no row changes were counted.' : 'No row changes counted for this run.'}
        </p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">Dataset</th>
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 text-right font-medium">
                  {humanKey(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(r.counts).map(([ds, c]) => (
              <tr key={ds} className="hairline-t">
                <td className="py-2 pr-3">{humanKey(ds)}</td>
                {cols.map((k) => (
                  <td key={k} className="num px-3 py-2 text-right">
                    {c[k] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <h4 className="mb-2 mt-5 text-sm font-semibold">Warnings</h4>
      {r.warnings.length ? (
        <ul className="max-h-56 space-y-1 overflow-auto rounded-xl bg-surface-2 p-3 font-mono text-xs text-warn hairline">
          {groupWarnings(r.warnings).map((w) => (
            <li key={w.sample}>
              {w.sample}
              {w.count > 1 && <span className="text-muted"> (+{w.count - 1} similar)</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None.</p>
      )}
    </Card>
  )
}
