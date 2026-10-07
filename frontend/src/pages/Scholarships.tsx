import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { CalendarClock, Check, CircleHelp, GraduationCap, Layers, ShieldCheck, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { catalog } from '@/api/endpoints'
import type { ScholarshipMatch } from '@/api/types'
import { Badge, Card, EmptyState, ErrorState, Field, InfoTip, PageHeader, Section, Select, Skeleton, Switch, cx } from '@/components/ui'
import { DateStatusTag, ProvenanceBadge } from '@/components/score'
import { daysUntil, formatDate, formatINR, titleCase } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { humanRule, useRecommendations, useServerToday } from '@/components/explore/shared'

function sortMatches(a: ScholarshipMatch, b: ScholarshipMatch) {
  const da = a.scholarship.deadline ?? '9999-12-31'
  const db = b.scholarship.deadline ?? '9999-12-31'
  if (da !== db) return da < db ? -1 : 1
  return b.expected_value - a.expected_value
}

export default function Scholarships() {
  const [eligibleOnly, setEligibleOnly] = useState(false)
  const [careerId, setCareerId] = useState('')
  const { recs } = useRecommendations()
  const q = useQuery({
    queryKey: ['scholarships', eligibleOnly, careerId],
    queryFn: () => catalog.scholarships({ eligible_only: eligibleOnly || undefined, career_id: careerId || undefined }),
  })

  const { regular, selfCheck } = useMemo(() => {
    const all = [...(q.data ?? [])].sort(sortMatches)
    return { regular: all.filter((m) => !m.scholarship.self_declared_criteria), selfCheck: all.filter((m) => m.scholarship.self_declared_criteria) }
  }, [q.data])
  const metCount = regular.filter((m) => m.eligible === true).length

  return (
    <div>
      <PageHeader
        eyebrow="Money help"
        title="Scholarships"
        subtitle="Scholarships that could pay part of the fees. We check each rule against your profile and tell you honestly when we can't tell yet."
      />

      <Card className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)] md:items-end">
        <Switch checked={eligibleOnly} onChange={setEligibleOnly} label="Only ones I can get" description="Hide scholarships where a rule is clearly not met." />
        {recs.length > 0 ? (
          <Field label="For which career?" htmlFor="sch-career">
            <Select id="sch-career" value={careerId} onChange={(e) => setCareerId(e.target.value)}>
              <option value="">Any career</option>
              {recs.map((r) => (
                <option key={r.career.id} value={r.career.id}>
                  #{r.rank} {r.career.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-muted">Finish your questionnaire to filter by your matched careers.</p>
        )}
      </Card>

      {q.isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading scholarships">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      )}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} title="We could not load scholarships" />}
      {q.data && q.data.length === 0 && (
        <EmptyState icon={<GraduationCap className="h-6 w-6" />} title="No scholarships match these filters">
          {eligibleOnly ? 'Turn off "Only ones I can get" to see scholarships where we still need more details from you.' : 'Try choosing "Any career".'}
        </EmptyState>
      )}

      {regular.length > 0 && (
        <Section
          title="Scholarships for you"
          subtitle={
            <>
              <span className="num">{regular.length}</span> found · <span className="num">{metCount}</span> where you meet every rule we can check · sorted by deadline
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {regular.map((m, i) => (
              <ScholarshipCard key={m.scholarship.id} m={m} i={i} />
            ))}
          </div>
        </Section>
      )}

      {selfCheck.length > 0 && (
        <Section
          title="Check these yourself"
          subtitle="These depend on things like category, gender or disability. PRISM never assumes these about anyone, so read the rule and decide if it applies to you."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {selfCheck.map((m, i) => (
              <ScholarshipCard key={m.scholarship.id} m={m} i={i} selfCheck />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Amount({ m }: { m: ScholarshipMatch }) {
  const s = m.scholarship
  if (s.amount_type === 'full_tuition') return <span className="num text-2xl font-semibold">Full tuition</span>
  if (s.amount_type === 'percent_tuition' && s.percent_of_tuition != null)
    return (
      <span>
        <span className="num text-2xl font-semibold">{Math.round(s.percent_of_tuition <= 1 ? s.percent_of_tuition * 100 : s.percent_of_tuition)}%</span>
        <span className="text-sm text-muted"> of tuition</span>
        {s.amount_per_year > 0 && <span className="block text-xs text-muted">up to {formatINR(s.amount_per_year)} a year</span>}
      </span>
    )
  return (
    <span>
      <span className="num text-2xl font-semibold">{formatINR(s.amount_per_year)}</span>
      <span className="text-sm text-muted"> a year</span>
    </span>
  )
}

function ScholarshipCard({ m, i, selfCheck }: { m: ScholarshipMatch; i: number; selfCheck?: boolean }) {
  const { reducedMotion } = useSettings()
  const today = useServerToday()
  const s = m.scholarship
  const days = s.deadline ? daysUntil(s.deadline, today.date) : null
  const status = m.eligible === true ? { label: 'You qualify on what we know', color: 'rgb(var(--ok))' } : m.eligible === false ? { label: 'A rule is not met', color: 'rgb(var(--bad))' } : { label: 'Need more details', color: 'rgb(var(--warn))' }

  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04 }}>
      <Card className={cx('flex h-full flex-col', m.eligible === false && 'opacity-80')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold leading-snug">{s.name}</h3>
            <p className="text-sm text-muted">
              {s.provider} · {titleCase(s.provider_type)}
            </p>
          </div>
          <ProvenanceBadge p={s.provenance} />
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <Amount m={m} />
          <div className="text-right text-sm">
            <div className="text-muted">
              for up to <span className="num text-ink">{s.max_years}</span> {s.max_years === 1 ? 'year' : 'years'}
            </div>
            {s.covers.length > 0 && <div className="text-xs text-muted">covers {s.covers.join(', ')}</div>}
          </div>
        </div>
        {s.year_amounts && s.year_amounts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {s.year_amounts.map((a, k) => (
              <span key={k} className="rounded-md bg-surface-2 px-2 py-0.5 hairline">
                Year {k + 1}: <span className="num">{formatINR(a)}</span>
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-xl bg-surface-2 p-3 hairline">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Who can get it</span>
            {!selfCheck && <Badge color={status.color}>{status.label}</Badge>}
          </div>
          {selfCheck ? (
            <p className="flex gap-2 text-sm">
              <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
              <span>{s.self_declared_criteria}</span>
            </p>
          ) : (
            <p className="mb-2 text-sm text-muted">{s.eligibility_summary}</p>
          )}
          {m.checks.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {m.checks.map((c, k) => (
                <li key={k} className="flex items-start gap-2 text-sm">
                  {c.passed === true ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="Met" />
                  ) : c.passed === false ? (
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-label="Not met" />
                  ) : (
                    <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-label="We can't tell" />
                  )}
                  <span>
                    {humanRule(c.rule)}
                    {c.passed === null && <span className="block text-xs text-muted">We can't tell yet. Add your marks, course or family details in your profile so we can check.</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="text-sm">
            <span className="text-muted">Likely value </span>
            <InfoTip text="What this scholarship is worth to you on average, counting the chance of getting it. It is a guide, not a promise." />
            <span className="num ml-1 font-semibold">{formatINR(m.expected_value, { compact: true })}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 text-muted" aria-hidden />
            {s.deadline ? (
              <span>
                {formatDate(s.deadline)}
                {days !== null && (
                  <span className={cx('num ml-1', days < 0 ? 'text-muted' : days <= 30 ? 'text-warn' : 'text-muted')}>
                    ({days < 0 ? 'closed' : days === 0 ? 'today' : `${days} days left`})
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted">No fixed deadline</span>
            )}
            <DateStatusTag status={s.deadline_status} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          {s.stackable ? <Layers className="h-3.5 w-3.5" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
          {s.stackable ? 'Can be combined with other scholarships.' : `Cannot be combined with others${s.exclusive_group ? ` in the "${titleCase(s.exclusive_group)}" group` : ''}; you keep only one.`}
        </div>
      </Card>
    </motion.div>
  )
}
