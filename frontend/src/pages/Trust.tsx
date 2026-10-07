// "How we know": live data status, the public methodology and the fairness checks. Works inside the public
// shell (/trust) and inside the app shell (/app/trust).
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Database, FlaskConical, Lock, Radio, Scale, ShieldCheck, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { system } from '@/api/endpoints'
import type { DataStatus, FairnessReport, Methodology } from '@/api/types'
import { Badge, Card, EmptyState, ErrorState, InfoTip, PageHeader, Section, Skeleton, cx } from '@/components/ui'
import { Meter } from '@/components/score'
import { COMPONENTS, formatDate, pct } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { CheckRow, FreshnessPill, SEVERITY, groupIssues, humanKey, plainIssue } from '@/components/system/shared'

export default function Trust() {
  const { pathname } = useLocation()
  const isPublic = !pathname.startsWith('/app')
  const status = useQuery({ queryKey: ['system', 'data-status'], queryFn: system.dataStatus })
  const method = useQuery({ queryKey: ['system', 'methodology'], queryFn: system.methodology, staleTime: 10 * 60_000 })
  const fair = useQuery({ queryKey: ['system', 'fairness'], queryFn: system.fairness, staleTime: 10 * 60_000 })

  return (
    <div className={cx(isPublic && 'mx-auto max-w-page px-4 pb-20 pt-10 md:px-8')}>
      <PageHeader
        eyebrow="How we know"
        title="Every number shows where it came from"
        subtitle="What data PRISM uses, how fresh it is, how the score is worked out, and the checks that keep it fair. Nothing here is hidden."
      />
      {status.isLoading ? (
        <Skeleton className="h-48" />
      ) : status.error ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} title="Could not load the data status" />
      ) : status.data ? (
        <StatusHero d={status.data} />
      ) : null}

      {!status.error && (
        <Section title="Datasets" subtitle="Each table PRISM reads, how many rows it holds and how much of it has been checked against a published source.">
          {status.isLoading ? <Skeleton className="h-64" /> : status.data && <Datasets d={status.data} />}
        </Section>
      )}

      {status.data && (
        <Section title="Live feeds" subtitle="Connections that can update the data automatically.">
          <Feeds d={status.data} />
        </Section>
      )}

      <Section title="How the score is worked out">
        {method.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        ) : method.error ? (
          <ErrorState error={method.error} onRetry={() => void method.refetch()} title="Could not load the methodology" />
        ) : method.data ? (
          <MethodologyView m={method.data} />
        ) : null}
      </Section>

      <Section title="Fairness checks" subtitle="Automatic tests that run against the live engine.">
        {fair.isLoading ? (
          <Skeleton className="h-64" />
        ) : fair.error ? (
          <ErrorState error={fair.error} onRetry={() => void fair.refetch()} title="Could not load the fairness checks" />
        ) : fair.data ? (
          <Fairness f={fair.data} />
        ) : null}
      </Section>

      {isPublic && (
        <p className="mt-12 text-center text-sm text-muted">
          Want to see it on a real family? <Link to="/register" className="font-semibold text-neon underline-offset-4 hover:underline">Create a free account</Link>
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- hero: the statement split by a prism
function StatusHero({ d }: { d: DataStatus }) {
  const { reducedMotion } = useSettings()
  return (
    <Card className="relative overflow-hidden p-6 md:p-10">
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 md:block">
        {COMPONENTS.map((c, i) => (
          <motion.div
            key={c.key}
            className="absolute right-0 h-[3px] origin-left"
            style={{ top: `${22 + i * 10}%`, left: 0, background: `linear-gradient(90deg, transparent, ${c.color})`, opacity: 0.55 }}
            initial={reducedMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.9, delay: 0.15 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>
      <div className="relative md:max-w-[66%]">
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge color={d.computed_live ? 'rgb(var(--ok))' : 'rgb(var(--warn))'}>
            <Radio className="h-3.5 w-3.5" aria-hidden />
            {d.computed_live ? 'Computed live on every request' : 'Precomputed results'}
          </Badge>
          <Badge color="rgb(var(--muted))">
            <Database className="h-3.5 w-3.5" aria-hidden /> Dataset <span className="num">{d.dataset_version}</span>
          </Badge>
        </div>
        <p className="font-display text-xl font-semibold leading-snug md:text-[28px] md:leading-tight">{d.statement}</p>
        <div className="mt-6 max-w-md">
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-muted">
              Checked against a published source <InfoTip term="checked" />
            </span>
            <span className="num font-semibold">{pct(d.overall_checked_share)}</span>
          </div>
          <Meter value={d.overall_checked_share} color="rgb(var(--ok))" label="Share of figures checked" />
          <p className="mt-2 text-xs text-muted">
            The rest are shown as <span className="font-medium text-ink">estimates</span> wherever they appear. Status as of {formatDate(d.today)}.
          </p>
        </div>
      </div>
    </Card>
  )
}

function Datasets({ d }: { d: DataStatus }) {
  if (!d.datasets.length) return <EmptyState icon={<Database className="h-6 w-6" />} title="No datasets loaded yet">An administrator can load data from the admin page.</EmptyState>
  return (
    <>
      {/* desktop table */}
      <div className="card hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted">
            <tr className="hairline-b">
              <th className="px-5 py-3 font-medium">Dataset</th>
              <th className="px-3 py-3 text-right font-medium">Rows</th>
              <th className="px-3 py-3 font-medium">Freshness</th>
              <th className="w-48 px-3 py-3 font-medium">Checked</th>
              <th className="px-3 py-3 font-medium">Sources</th>
              <th className="px-5 py-3 font-medium">Next refresh</th>
            </tr>
          </thead>
          <tbody>
            {d.datasets.map((s) => (
              <tr key={s.dataset} className="hairline-b align-top last:shadow-none">
                <td className="px-5 py-4">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-muted">
                    as of {formatDate(s.newest_as_of)}
                    {s.live_feed && ' · live feed'}
                  </div>
                </td>
                <td className="num px-3 py-4 text-right">{s.rows.toLocaleString('en-IN')}</td>
                <td className="px-3 py-4">
                  <FreshnessPill value={s.freshness} />
                </td>
                <td className="px-3 py-4">
                  <div className="num mb-1 text-xs">{pct(s.checked_share)}</div>
                  <Meter value={s.checked_share} color="rgb(var(--ok))" label={`${s.label}: share checked`} />
                </td>
                <td className="max-w-xs px-3 py-4 text-xs text-muted">{s.sources.join(' · ') || '—'}</td>
                <td className="num px-5 py-4 text-xs">{s.next_refresh_due ? formatDate(s.next_refresh_due) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* phone/tablet cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {d.datasets.map((s) => (
          <Card key={s.dataset} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{s.label}</div>
                <div className="num text-xs text-muted">{s.rows.toLocaleString('en-IN')} rows · as of {formatDate(s.newest_as_of)}</div>
              </div>
              <FreshnessPill value={s.freshness} />
            </div>
            <div className="mt-3 flex justify-between text-xs">
              <span className="text-muted">Checked</span>
              <span className="num">{pct(s.checked_share)}</span>
            </div>
            <Meter className="mt-1" value={s.checked_share} color="rgb(var(--ok))" label={`${s.label}: share checked`} />
            {s.sources.length > 0 && <p className="mt-3 text-xs text-muted">{s.sources.join(' · ')}</p>}
            {s.next_refresh_due && <p className="mt-2 text-xs text-muted">Next refresh due {formatDate(s.next_refresh_due)}</p>}
          </Card>
        ))}
      </div>
      {d.issues.length > 0 && <Issues issues={d.issues} />}
    </>
  )
}

function Issues({ issues }: { issues: DataStatus['issues'] }) {
  const [all, setAll] = useState(false)
  const groups = groupIssues(issues)
  const shown = all ? groups : groups.slice(0, 3)
  return (
    <Card className="mt-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <TriangleAlert className="h-4 w-4 text-warn" aria-hidden /> Data issues we know about
        <InfoTip text="Our automatic checks flag numbers that look very different from the rest. A person reviews them. Flagged values are not removed; they are just watched." />
      </h3>
      <ul className="space-y-2 text-sm">
        {shown.map((g, n) => {
          const sev = g.severity === 'error' ? SEVERITY.urgent : SEVERITY.warn
          return (
            <li key={n} className="flex gap-2">
              <Badge color={sev.color}>{g.severity === 'error' ? 'Problem' : 'Check'}</Badge>
              <span>
                <span className="font-medium">{humanKey(g.dataset)}:</span> {plainIssue(g)}
              </span>
            </li>
          )
        })}
      </ul>
      {groups.length > 3 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-3 min-h-[44px] text-sm font-semibold text-neon">
          {all ? 'Show fewer' : `Show all ${groups.length}`}
        </button>
      )}
    </Card>
  )
}

function Feeds({ d }: { d: DataStatus }) {
  if (!d.feeds.length) return <p className="text-sm text-muted">No live feeds are set up. All data comes from the dated snapshot above.</p>
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {d.feeds.map((f) => (
        <Card key={f.key} className="flex items-start gap-3 p-4">
          <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', f.enabled ? 'bg-ok' : 'bg-muted/60')} aria-hidden />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-medium">
              {f.name}
              <Badge color={f.enabled ? 'rgb(var(--ok))' : 'rgb(var(--muted))'}>{f.enabled ? 'Connected' : 'Not connected'}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              {f.enabled ? 'Updates arrive automatically. ' : 'Not used right now, so nothing from it appears in your results. '}
              {f.detail}
            </p>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- methodology
function MethodologyView({ m }: { m: Methodology }) {
  const { reducedMotion } = useSettings()
  const total = Object.values(m.weights).reduce((a, b) => a + b, 0) || 1
  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">The six parts of every score</h3>
          <span className="num text-xs text-muted">
            {m.engine_version} · config {m.scoring_config_version}
          </span>
        </div>
        <ul className="space-y-3">
          {COMPONENTS.map((c, i) => {
            const w = m.weights[c.key]
            if (w === undefined) return null
            return (
              <li key={c.key} className="grid grid-cols-[9.5rem_1fr_2.75rem] items-center gap-3 sm:grid-cols-[11rem_1fr_3rem]">
                <span className="text-sm font-medium leading-tight" title={c.meaning}>
                  {c.label}
                </span>
                <span className="h-3 overflow-hidden rounded-full bg-surface-2">
                  <motion.span
                    className="block h-full origin-left rounded-full"
                    style={{ background: c.color, width: `${(w / total) * 100}%` }}
                    initial={reducedMotion ? false : { scaleX: 0.001 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.6, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  />
                </span>
                <span className="num text-right text-sm">{pct(w)}</span>
              </li>
            )
          })}
        </ul>
        <p className="mt-4 text-xs text-muted">Automation risk lowers the score; the other five raise it.</p>
      </Card>

      <div>
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <FlaskConical className="h-4 w-4 text-neon" aria-hidden /> Formulas
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {m.formulas.map((f) => (
            <Card key={f.name} className="p-4">
              <div className="text-sm font-semibold">{humanKey(f.name)}</div>
              <pre className="no-scrollbar mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-neon">{f.expression}</pre>
              <p className="mt-2 text-sm text-muted">{f.explanation}</p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Database className="h-4 w-4 text-neon" aria-hidden /> Where the data comes from
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {m.data_sources.map((s) => (
            <Card key={s.dataset} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{humanKey(s.dataset)}</div>
                <Badge color={s.share_estimated > 0.5 ? 'rgb(var(--warn))' : 'rgb(var(--ok))'} title="Share of rows that are estimates">
                  <span className="num">{pct(s.share_estimated)}</span> estimated
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                {s.source_url ? (
                  <a href={s.source_url} target="_blank" rel="noreferrer" className="text-neon underline-offset-4 hover:underline">
                    {s.source_name}
                  </a>
                ) : (
                  s.source_name
                )}
              </p>
              <p className="num mt-2 text-xs text-muted">
                {s.rows.toLocaleString('en-IN')} rows · as of {formatDate(s.as_of)}
              </p>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ListCard icon={<Scale className="h-4 w-4" />} title="Fairness safeguards" items={m.fairness_safeguards} color="rgb(var(--ok))" />
        <ListCard icon={<Lock className="h-4 w-4" />} title="Privacy rules" items={m.privacy_rules} color="rgb(var(--primary))" />
        <ListCard icon={<TriangleAlert className="h-4 w-4" />} title="Limitations" items={m.limitations} color="rgb(var(--warn))" />
      </div>
    </div>
  )
}

function ListCard({ icon, title, items, color }: { icon: React.ReactNode; title: string; items: string[]; color: string }) {
  return (
    <Card className="p-4">
      <h4 className="mb-3 flex items-center gap-2 font-semibold" style={{ color }}>
        {icon}
        <span className="text-ink">{title}</span>
      </h4>
      {items.length ? (
        <ul className="space-y-2 text-sm text-muted">
          {items.map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None listed.</p>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- fairness
function Fairness({ f }: { f: FairnessReport }) {
  const [open, setOpen] = useState(false)
  const none = f.protected_attributes_used.length === 0
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', none ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad')}>
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <div className="font-display text-xl font-semibold md:text-2xl">
              Protected attributes used: {none ? 'none' : f.protected_attributes_used.join(', ')}
            </div>
            <p className="text-sm text-muted">No gender, caste, religion, community, disability or name goes into the score.</p>
          </div>
        </div>
        <Badge color={f.passed ? 'rgb(var(--ok))' : 'rgb(var(--bad))'} className="self-start px-3 py-1 text-sm sm:self-center">
          {f.passed ? 'All checks passed' : 'Some checks failed'}
        </Badge>
      </Card>
      <ul className="space-y-2">
        {f.probes.map((p, i) => (
          <CheckRow key={p.name} index={i} passed={p.passed} title={p.description}>
            Result: {p.detail}
          </CheckRow>
        ))}
      </ul>
      <Card className="p-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-[52px] w-full items-center justify-between gap-3 px-5 text-left font-medium"
        >
          <span>
            Everything the engine reads <span className="num text-sm text-muted">({f.model_inputs.length} inputs)</span>
          </span>
          <ChevronDown className={cx('h-5 w-5 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {open && (
          <ul className="grid gap-x-6 gap-y-1 px-5 pb-5 font-mono text-xs text-muted sm:grid-cols-2 lg:grid-cols-3">
            {f.model_inputs.map((m) => (
              <li key={m} className="break-all">
                {m}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="num text-xs text-muted">
        Dataset {f.dataset_version} · checked {formatDate(f.generated_at)}
      </p>
    </div>
  )
}
