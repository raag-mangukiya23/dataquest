// What-if (/what-if): a live instrument. Move a slider, the backend re-runs the analysis, the list re-ranks.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, FlaskConical, History, Lock, Play, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { analysis, family } from '@/api/endpoints'
import { keys, useFamily, useLatestRun, useRuns } from '@/api/queries'
import type { FamilyFinanceOut, RunComparison, WhatIfOverrides } from '@/api/types'
import { ComparisonView } from '@/components/plan/Comparison'
import { RangeField, RangeStyles, useDebounced } from '@/components/plan/controls'
import { Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, PageSkeleton, Skeleton, cx } from '@/components/ui'
import { COMPONENTS, formatDate, formatINR } from '@/lib/format'
import { useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

type Num = 'allocatable_savings' | 'annual_income' | 'loan_tolerance' | 'relocation_willingness' | 'abroad_willingness'
type Shown = { kind: 'live' | 'saved'; runId: string; label: string; comparison: RunComparison }

const isFinance = (x: unknown): x is FamilyFinanceOut => !!x && typeof x === 'object' && 'allocatable_savings' in x

export default function WhatIf() {
  const { user } = useSession()
  const isStudent = user?.role === 'student'
  const latest = useLatestRun()
  const fam = useFamily()
  const finance = useQuery({
    queryKey: ['family-finance', fam.data?.id],
    enabled: !!fam.data?.id && !isStudent && !!fam.data?.has_finance,
    queryFn: () => family.finance(fam.data!.id),
    retry: false,
  })

  if (latest.isLoading) return <PageSkeleton />
  if (latest.error) return <ErrorState error={latest.error} onRetry={latest.refetch} />
  if (!latest.studentId && user?.role === 'parent')
    return (
      <EmptyState icon={<FlaskConical className="h-6 w-6" />} title="Link your child first" action={<Link to="/family"><Button>Go to Family</Button></Link>}>
        What-ifs work on your child's results. Join their family to start.
      </EmptyState>
    )
  if (latest.isEmpty || !latest.run)
    return (
      <EmptyState
        icon={<FlaskConical className="h-6 w-6" />}
        title="No results to experiment with yet"
        action={
          <Button onClick={() => latest.create.mutate()} loading={latest.create.isPending}>
            Create my results
          </Button>
        }
      >
        A what-if starts from your latest results. Finish the questions, then come back to try “what if we saved more?”.
      </EmptyState>
    )

  const fin = isFinance(finance.data) ? finance.data : undefined
  return <Instrument key={latest.run.run_id} baseRunId={latest.run.run_id} studentId={latest.studentId!} weights={latest.run.weights} fin={fin} finLoading={finance.isLoading && finance.fetchStatus !== 'idle'} isStudent={isStudent} />
}

function Instrument({ baseRunId, studentId, weights, fin, finLoading, isStudent }: { baseRunId: string; studentId: string; weights: Record<string, number>; fin?: FamilyFinanceOut; finLoading: boolean; isStudent: boolean }) {
  const { reducedMotion } = useSettings()
  const qc = useQueryClient()
  const runs = useRuns(studentId)

  // starting positions: the family's saved answers where we have them
  const start = useMemo(
    () => ({
      allocatable_savings: fin?.allocatable_savings ?? 0,
      annual_income: fin?.annual_income ?? 0,
      loan_tolerance: fin?.loan_tolerance ?? 0.5,
      relocation_willingness: fin?.relocation_willingness ?? 0.5,
      abroad_willingness: fin?.abroad_willingness ?? 0.2,
    }),
    [fin],
  )
  const [vals, setVals] = useState<Record<Num, number>>(start)
  const [dirty, setDirty] = useState<Set<Num>>(new Set())
  const [w, setW] = useState<Record<string, number>>(() => ({ ...weights }))
  const [wDirty, setWDirty] = useState(false)
  const [label, setLabel] = useState('')
  const [openWeights, setOpenWeights] = useState(false)

  useEffect(() => {
    // finance arrived after first render: move the untouched sliders to the family's real answers
    setVals((v) => {
      const next = { ...v }
      ;(Object.keys(start) as Num[]).forEach((k) => {
        if (!dirty.has(k)) next[k] = start[k]
      })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start])

  const setNum = (k: Num) => (v: number) => {
    setVals((s) => ({ ...s, [k]: v }))
    setDirty((d) => new Set(d).add(k))
  }

  const overrides: WhatIfOverrides = useMemo(() => {
    const o: WhatIfOverrides = {}
    dirty.forEach((k) => {
      if (k === 'annual_income' && vals[k] <= 0) return
      o[k] = vals[k]
    })
    if (wDirty) o.weights = w
    return o
  }, [dirty, vals, w, wDirty])
  const hasChanges = Object.keys(overrides).length > 0

  // ---- running: debounce, ignore stale replies
  const [shown, setShown] = useState<Shown | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const reqId = useRef(0)
  const run = useCallback(
    async (o: WhatIfOverrides, lbl: string) => {
      const id = ++reqId.current
      setRunning(true)
      setError(null)
      try {
        const auto = Object.keys(o).map((k) => (k === 'weights' ? 'priorities' : k.replace(/_/g, ' ').replace(/ willingness| tolerance/, ''))).join(', ')
        const res = await analysis.whatIf(baseRunId, { overrides: o, label: lbl.trim() || (auto ? `Changed ${auto}`.slice(0, 80) : null) })
        if (id !== reqId.current) return
        setShown({ kind: 'live', runId: res.what_if_run_id, label: res.label ?? 'This scenario', comparison: res.comparison })
        void qc.invalidateQueries({ queryKey: keys.runs(studentId) })
      } catch (e) {
        if (id === reqId.current) setError(e)
      } finally {
        if (id === reqId.current) setRunning(false)
      }
    },
    [baseRunId, qc, studentId],
  )
  const debouncedInput = useMemo(() => ({ o: overrides, l: label }), [overrides, label])
  const debounced = useDebounced(debouncedInput, 500)
  useEffect(() => {
    if (Object.keys(debounced.o).length === 0) return
    void run(debounced.o, debounced.l)
  }, [debounced, run])

  const reset = () => {
    reqId.current++
    setVals(start)
    setDirty(new Set())
    setW({ ...weights })
    setWDirty(false)
    setShown(null)
    setRunning(false)
    setError(null)
  }

  // ---- saved scenarios
  const saved = (runs.data?.items ?? []).filter((r) => r.kind === 'what_if')
  const openSaved = async (runId: string, lbl: string) => {
    const id = ++reqId.current
    setRunning(true)
    setError(null)
    try {
      const c = await analysis.compare(baseRunId, runId)
      if (id !== reqId.current) return
      setShown({ kind: 'saved', runId, label: lbl, comparison: c })
    } catch (e) {
      if (id === reqId.current) setError(e)
    } finally {
      if (id === reqId.current) setRunning(false)
    }
  }

  const wTotal = Object.values(w).reduce((a, b) => a + b, 0) || 1

  return (
    <div className="space-y-6">
      <RangeStyles />
      <PageHeader
        eyebrow="What if?"
        title="Try a different plan"
        subtitle="Move a slider and watch the careers re-rank. Nothing here changes your saved results."
        actions={
          <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={reset} disabled={!hasChanges && !shown}>
            Reset
          </Button>
        }
      />

      {/* saved scenarios */}
      <section aria-label="Saved scenarios" className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
          <History className="h-3.5 w-3.5" aria-hidden /> Saved scenarios
        </div>
        {runs.isLoading ? (
          <div className="flex gap-2">
            <Skeleton className="h-11 w-48" />
            <Skeleton className="h-11 w-48" />
          </div>
        ) : saved.length === 0 ? (
          <p className="text-sm text-muted">None yet. Each scenario you run is saved here so you can come back to it.</p>
        ) : (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
            {saved.slice(0, 6).map((r) => (
              <button
                key={r.run_id}
                type="button"
                aria-pressed={shown?.runId === r.run_id}
                onClick={() => void openSaved(r.run_id, r.top_career)}
                className={cx(
                  'flex min-h-[44px] shrink-0 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left hairline transition-colors',
                  shown?.runId === r.run_id ? 'bg-primary text-primary-ink' : 'bg-surface-2 hover:bg-surface',
                )}
              >
                <span className="text-sm font-medium">Top: {r.top_career}</span>
                <span className={cx('text-[11px]', shown?.runId === r.run_id ? 'opacity-80' : 'text-muted')}>{formatDate(r.created_at)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* controls */}
        <Card className="h-fit space-y-6 lg:sticky lg:top-24">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="font-display text-lg font-semibold">Change the plan</h2>
          </div>

          {isStudent ? (
            <div className="flex gap-3 rounded-xl bg-surface-2 p-3 text-sm text-muted hairline">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>Savings, income and loans are your parents' to change. You can still try different priorities and places to study.</p>
            </div>
          ) : finLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : (
            <div className="space-y-5">
              <RangeField
                id="wi-savings"
                label="Savings for education"
                value={vals.allocatable_savings}
                min={0}
                max={3_000_000}
                step={25_000}
                onChange={setNum('allocatable_savings')}
                display={formatINR(vals.allocatable_savings, { compact: true })}
                valueText={formatINR(vals.allocatable_savings)}
                left="₹0"
                right="₹30 L"
                color="rgb(var(--afford))"
              />
              <Field label="Family income per year (optional)" htmlFor="wi-income" hint={vals.annual_income > 0 ? formatINR(vals.annual_income, { compact: true }) + ' a year' : 'Leave empty to keep what you told us.'}>
                <Input
                  id="wi-income"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={10_000}
                  value={dirty.has('annual_income') || vals.annual_income > 0 ? vals.annual_income || '' : ''}
                  placeholder="e.g. 600000"
                  onChange={(e) => setNum('annual_income')(Math.max(0, Number(e.target.value) || 0))}
                />
              </Field>
              <RangeField
                id="wi-loan"
                label="Comfort with a loan"
                value={vals.loan_tolerance}
                min={0}
                max={1}
                step={0.05}
                onChange={setNum('loan_tolerance')}
                left="No loans"
                right="Happy to borrow"
                color="rgb(var(--loan))"
                valueText={`${Math.round(vals.loan_tolerance * 100)} percent`}
              />
            </div>
          )}

          <div className="space-y-5">
            <RangeField
              id="wi-reloc"
              label="Moving to another city"
              value={vals.relocation_willingness}
              min={0}
              max={1}
              step={0.05}
              onChange={setNum('relocation_willingness')}
              left="Stay close to home"
              right="Anywhere in India"
              valueText={`${Math.round(vals.relocation_willingness * 100)} percent`}
            />
            <RangeField
              id="wi-abroad"
              label="Studying abroad"
              value={vals.abroad_willingness}
              min={0}
              max={1}
              step={0.05}
              onChange={setNum('abroad_willingness')}
              left="Not at all"
              right="Very open"
              valueText={`${Math.round(vals.abroad_willingness * 100)} percent`}
            />
          </div>

          <div className="rounded-xl hairline">
            <button
              type="button"
              aria-expanded={openWeights}
              aria-controls="wi-weights"
              onClick={() => setOpenWeights((o) => !o)}
              className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-medium"
            >
              <span>Adjust priorities</span>
              <span className="flex items-center gap-2">
                <span className="flex h-2 w-16 overflow-hidden rounded-full" aria-hidden>
                  {COMPONENTS.map((c) => (
                    <span key={c.key} style={{ width: `${((w[c.key] ?? 0) / wTotal) * 100}%`, background: c.color }} />
                  ))}
                </span>
                <ChevronDown className={cx('h-4 w-4 transition-transform', openWeights && 'rotate-180')} aria-hidden />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {openWeights && (
                <motion.div
                  id="wi-weights"
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4 px-3 pb-4"
                >
                  <p className="text-xs text-muted">How much each part counts. Shares are worked out from all six together.</p>
                  {COMPONENTS.map((c) => (
                    <RangeField
                      key={c.key}
                      id={`wi-w-${c.key}`}
                      label={c.label}
                      value={w[c.key] ?? 0}
                      min={0}
                      max={0.6}
                      step={0.01}
                      color={c.color}
                      display={`${Math.round(((w[c.key] ?? 0) / wTotal) * 100)}%`}
                      onChange={(v) => {
                        setW((s) => ({ ...s, [c.key]: v }))
                        setWDirty(true)
                      }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Field label="Name this scenario (optional)" htmlFor="wi-label" hint="Saved with the next run. Only your 6 latest scenarios are shown.">
            <Input id="wi-label" value={label} maxLength={80} placeholder="e.g. Use the FD + small loan" onChange={(e) => setLabel(e.target.value)} />
          </Field>

          <Button magnetic className="w-full" icon={<Play className="h-4 w-4" />} loading={running} disabled={!hasChanges} onClick={() => void run(overrides, label)}>
            Run scenario
          </Button>
        </Card>

        {/* results */}
        <div className="min-w-0 space-y-4" aria-live="polite" aria-busy={running}>
          {shown && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{shown.kind === 'saved' ? 'Saved scenario' : 'Live scenario'}:</span>
              <span className="font-semibold">{shown.label}</span>
              {running && <span className="text-xs text-muted">updating…</span>}
            </div>
          )}
          {error && !running ? (
            <ErrorState error={error} onRetry={() => void run(overrides, label)} title="This scenario did not run" />
          ) : shown ? (
            <ComparisonView c={shown.comparison} updating={running} />
          ) : running ? (
            <div className="space-y-3" aria-label="Running scenario">
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
              <Skeleton className="h-80" />
            </div>
          ) : (
            <EmptyState icon={<FlaskConical className="h-6 w-6" />} title="Move any slider to start">
              {isStudent ? 'Try changing what matters most to you, or how far you would move to study.' : 'Try “what if we put ₹5 L more into savings?” or “what if we are open to a loan?”.'} Or open a saved scenario above.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  )
}
