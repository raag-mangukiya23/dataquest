import { LinkButton } from '../components/family/LinkButton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Lock, Plane, MapPin, Plus, RefreshCw, Search, Trash2, Wallet, Landmark, HeartHandshake } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { catalog, family } from '@/api/endpoints'
import { keys, useCreateRun, useFamily, useStudentId } from '@/api/queries'
import type { CareerSummary, FamilyFinanceIn, FamilyFinanceSummary, IncomeBand, PrestigeStability, RankedPreference } from '@/api/types'
import { UnitSlider } from '@/components/family/UnitSlider'
import { COMFORT_WORDS, INCOME_BANDS, fieldErrors, isFullFinance, previewSummary } from '@/components/family/shared'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, PageSkeleton, Section, Segmented, Select, Skeleton, Term, useToast, cx } from '@/components/ui'
import { formatINR, sectorLabel, SECTORS } from '@/lib/format'
import { useSession } from '@/state/session'

const notFoundToNull = async <T,>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export default function FamilyBudget() {
  const { user } = useSession()
  const fam = useFamily()
  const navigate = useNavigate()
  const back = (
    <Link to="/family" className="mb-2 inline-flex min-h-[44px] items-center gap-2 text-sm text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> Family
    </Link>
  )
  if (fam.isLoading) return <PageSkeleton />
  if (fam.isError) return <ErrorState error={fam.error} onRetry={() => void fam.refetch()} />
  if (!fam.data)
    return (
      <div>
        {back}
        <PageHeader eyebrow="Family" title="Family budget" />
        <EmptyState icon={<Wallet className="h-6 w-6" />} title="Link your family first" action={<Button onClick={() => navigate('/family')}>Set up family</Button>}>
          The budget belongs to a family. Create one or join with a code.
        </EmptyState>
      </div>
    )
  return (
    <div>
      {back}
      {user?.role === 'parent' ? <ParentBudget familyId={fam.data.id} /> : <StudentBudget familyId={fam.data.id} />}
    </div>
  )
}

// ---------------------------------------------------------------- student
function StudentBudget({ familyId }: { familyId: string }) {
  const q = useQuery({ queryKey: ['finance', familyId], queryFn: () => notFoundToNull(family.finance(familyId)) })
  return (
    <div>
      <PageHeader eyebrow="Family" title="Your family budget" subtitle="Your parents keep the exact figures private. Here is what they shared with you, in plain words." />
      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <EmptyState icon={<Wallet className="h-6 w-6" />} title="No budget yet" action={<LinkButton to="/family" variant="secondary">Invite a parent</LinkButton>}>
          Ask a parent to add the family budget. Your results get much more accurate with it.
        </EmptyState>
      ) : (
        <SummaryCards s={isFullFinance(q.data) ? { family_id: familyId, ...previewSummary(q.data) } : (q.data as FamilyFinanceSummary)} audience="student" />
      )}
      <Card className="mt-6 flex gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <p className="text-sm text-muted">
          Why private? Money talk is easier when everyone feels safe. PRISM still uses the real figures to check what is affordable for you, so your results stay honest.
        </p>
      </Card>
    </div>
  )
}

function SummaryCards({ s, audience }: { s: Pick<FamilyFinanceSummary, 'budget_comfort' | 'open_to_loans' | 'open_to_relocation' | 'open_to_abroad'>; audience: 'student' | 'preview' }) {
  const comfort = COMFORT_WORDS[s.budget_comfort] ?? { title: s.budget_comfort, line: '' }
  const you = audience === 'student' ? 'your family' : 'the family'
  const items = [
    { icon: <Wallet className="h-5 w-5" />, title: comfort.title, line: comfort.line, on: true, color: 'rgb(var(--afford))' },
    { icon: <Landmark className="h-5 w-5" />, title: s.open_to_loans ? 'Open to an education loan' : 'Would rather avoid loans', line: s.open_to_loans ? `A loan is an option ${you} is willing to consider.` : 'Look for scholarships and low-fee colleges first.', on: s.open_to_loans, color: 'rgb(var(--loan))' },
    { icon: <MapPin className="h-5 w-5" />, title: s.open_to_relocation ? 'Okay with moving to study' : 'Prefers studying nearby', line: s.open_to_relocation ? 'Colleges in other cities are on the table.' : 'Colleges close to home come first.', on: s.open_to_relocation, color: 'rgb(var(--market))' },
    { icon: <Plane className="h-5 w-5" />, title: s.open_to_abroad ? 'Open to studying abroad' : 'Studying in India for now', line: s.open_to_abroad ? 'Courses abroad can be considered.' : 'Abroad options are not a priority.', on: s.open_to_abroad, color: 'rgb(var(--fit))' },
  ]
  return (
    <div className={cx('grid gap-3', audience === 'student' ? 'sm:grid-cols-2' : '')}>
      {items.map((it) => (
        <div key={it.title} className={cx('card flex gap-3', audience === 'student' ? 'p-5' : 'p-3.5')}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ color: it.color, background: `color-mix(in srgb, ${it.color} 15%, transparent)` }}>
            {it.icon}
          </span>
          <div className="min-w-0">
            <div className="font-semibold">{it.title}</div>
            <div className="text-sm text-muted">{it.line}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- parent
type Form = Omit<FamilyFinanceIn, 'annual_income'> & { annual_income: number | null }
const EMPTY: Form = {
  income_band: '3l_6l',
  annual_income: null,
  income_growth_rate: 0.05,
  allocatable_savings: 0,
  existing_debt_emi: 0,
  dependents: 1,
  max_affordable_emi: 0,
  loan_tolerance: 0.5,
  risk_appetite: 0.5,
  relocation_willingness: 0.5,
  abroad_willingness: 0.2,
  time_to_earn_years: 5,
  prestige_vs_stability: 'balanced',
  preferred_regions: [],
}

function ParentBudget({ familyId }: { familyId: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { studentId } = useStudentId()
  const fin = useQuery({ queryKey: ['finance', familyId], queryFn: () => notFoundToNull(family.finance(familyId)) })
  const regions = useQuery({ queryKey: ['regions'], queryFn: () => catalog.regions(), staleTime: 3_600_000 })
  const [form, setForm] = useState<Form>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const rerun = useCreateRun(studentId)

  useEffect(() => {
    if (loaded || !fin.isSuccess) return
    if (isFullFinance(fin.data)) {
      const { family_id: _f, updated_by: _u, updated_at: _a, ...rest } = fin.data
      setForm({ ...EMPTY, ...rest, annual_income: rest.annual_income ?? null, preferred_regions: rest.preferred_regions ?? [] })
    }
    setLoaded(true)
  }, [fin.isSuccess, fin.data, loaded])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
    if (errors[k as string] || errors._form) setErrors((e) => ({ ...e, [k as string]: '', _form: '' }))
  }
  const save = useMutation({
    mutationFn: () => family.putFinance(familyId, { ...form, annual_income: form.annual_income || null }),
    onSuccess: (out) => {
      qc.setQueryData(['finance', familyId], out)
      void qc.invalidateQueries({ queryKey: keys.family })
      setErrors({})
      setSaved(true)
      toast('ok', 'Budget saved. Only parents can see these figures.')
    },
    onError: (e) => {
      const fe = fieldErrors(e)
      setErrors(Object.keys(fe).length ? fe : { _form: e instanceof Error ? e.message : 'Could not save' })
      toast('error', 'Please check the highlighted fields.')
    },
  })

  const monthly = form.annual_income ? form.annual_income / 12 : null
  const emiTooHigh = monthly !== null && form.existing_debt_emi + form.max_affordable_emi > monthly
  const preview = previewSummary(form)

  if (fin.isLoading) return <PageSkeleton />
  if (fin.isError) return <ErrorState error={fin.error} onRetry={() => void fin.refetch()} title="Could not load the budget" />

  return (
    <div>
      <PageHeader eyebrow="Family · parents" title="Budget and career hopes" subtitle="This helps PRISM check what your family can afford and which careers you hope for." />
      <div className="mb-6 flex items-start gap-3 rounded-2xl bg-family/10 p-4 hairline" role="note">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-family" aria-hidden />
        <p className="text-sm">
          <b>Only parents see these figures.</b> Your child sees a simple summary.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
          noValidate
        >
          <Card>
            <h2 className="text-lg font-semibold">Income and savings</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Yearly family income" htmlFor="band" error={errors.income_band}>
                <Select id="band" value={form.income_band} onChange={(e) => set('income_band', e.target.value as IncomeBand)}>
                  {INCOME_BANDS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <MoneyField id="annual" label="Exact yearly income (optional)" value={form.annual_income} onChange={(v) => set('annual_income', v)} error={errors.annual_income} hint="Leave empty to use the middle of the range." optional />
              <MoneyField id="savings" label="Savings you can put towards studies" value={form.allocatable_savings} onChange={(v) => set('allocatable_savings', v ?? 0)} error={errors.allocatable_savings} />
              <Field label="Expected yearly income growth" htmlFor="growth" error={errors.income_growth_rate} hint="Most families use 5%.">
                <div className="relative">
                  <Input id="growth" type="number" inputMode="decimal" min={-20} max={30} step={1} value={Math.round(form.income_growth_rate * 100)} onChange={(e) => set('income_growth_rate', Number(e.target.value) / 100)} className="pr-9" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">%</span>
                </div>
              </Field>
              <Field label="People who depend on this income" htmlFor="deps" error={errors.dependents}>
                <Input id="deps" type="number" inputMode="numeric" min={0} max={12} value={form.dependents} onChange={(e) => set('dependents', Math.max(0, Math.round(Number(e.target.value))))} />
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">
              Monthly payments (<Term id="emi">EMI</Term>)
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <MoneyField id="debt" label="EMIs you already pay each month" value={form.existing_debt_emi} onChange={(v) => set('existing_debt_emi', v ?? 0)} error={errors.existing_debt_emi} />
              <MoneyField id="maxemi" label="Most you could pay monthly for an education loan" value={form.max_affordable_emi} onChange={(v) => set('max_affordable_emi', v ?? 0)} error={errors.max_affordable_emi || (emiTooHigh ? 'Together these are more than your monthly income.' : undefined)} />
            </div>
            {monthly !== null && (
              <p className="mt-3 text-xs text-muted">
                Monthly income: <span className="num text-ink">{formatINR(monthly)}</span> · after EMIs:{' '}
                <span className={cx('num', emiTooHigh ? 'text-bad' : 'text-ink')}>{formatINR(monthly - form.existing_debt_emi - form.max_affordable_emi)}</span>
              </p>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Your comfort</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <UnitSlider label="How comfortable are you with an education loan?" value={form.loan_tolerance} onChange={(v) => set('loan_tolerance', v)} low="Rather not" high="Very comfortable" color="rgb(var(--loan))" />
              <UnitSlider label="How much career risk feels okay?" value={form.risk_appetite} onChange={(v) => set('risk_appetite', v)} low="Play it safe" high="Happy to take chances" color="rgb(var(--warn))" />
              <UnitSlider label="Moving to another city to study" value={form.relocation_willingness} onChange={(v) => set('relocation_willingness', v)} low="Stay close" high="Anywhere in India" color="rgb(var(--market))" />
              <UnitSlider label="Studying abroad" value={form.abroad_willingness} onChange={(v) => set('abroad_willingness', v)} low="Not for us" high="Open to it" color="rgb(var(--fit))" />
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Years until you hope your child earns" htmlFor="tte" error={errors.time_to_earn_years} hint="Counted from now. Between 2 and 12.">
                <Input id="tte" type="number" inputMode="numeric" min={2} max={12} value={form.time_to_earn_years} onChange={(e) => set('time_to_earn_years', Math.round(Number(e.target.value)))} />
              </Field>
              <div>
                <div className="mb-1.5 text-sm font-medium">What matters more?</div>
                <Segmented<PrestigeStability>
                  label="Prestige or stability"
                  value={form.prestige_vs_stability}
                  onChange={(v) => set('prestige_vs_stability', v)}
                  options={[
                    { value: 'stability', label: 'Stability' },
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'prestige', label: 'Prestige' },
                  ]}
                />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Places you would like</h2>
            <p className="mt-1 text-sm text-muted">Pick regions you would prefer for study and work. Leave empty for no preference.</p>
            {regions.isLoading ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-11 w-28" />
                ))}
              </div>
            ) : regions.isError ? (
              <div className="mt-3">
                <ErrorState error={regions.error} onRetry={() => void regions.refetch()} />
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Preferred regions">
                {(regions.data ?? []).map((r) => {
                  const on = form.preferred_regions?.includes(r.code) ?? false
                  return (
                    <button
                      key={r.code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set('preferred_regions', on ? (form.preferred_regions ?? []).filter((c) => c !== r.code) : [...(form.preferred_regions ?? []), r.code])}
                      className={cx('min-h-[44px] rounded-xl px-3 text-sm font-medium transition-colors hairline', on ? 'bg-primary text-primary-ink' : 'text-muted hover:text-ink')}
                    >
                      {r.name}
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          {errors._form && (
            <p role="alert" className="rounded-xl bg-bad/10 p-3 text-sm text-bad">
              {errors._form}
            </p>
          )}
          <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-2xl p-3 glass hairline md:bottom-4">
            <Button type="submit" size="lg" loading={save.isPending} magnetic>
              Save budget
            </Button>
            {saved && studentId && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                loading={rerun.isPending}
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={() =>
                  rerun.mutate(undefined, {
                    onSuccess: () => {
                      void qc.invalidateQueries({ queryKey: ['conflict'] })
                      toast('ok', 'Results updated with your new budget.')
                      setSaved(false)
                    },
                    onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not update results'),
                  })
                }
              >
                Update results
              </Button>
            )}
            <span className="text-xs text-muted">{saved ? 'Saved. Results use the budget, so update them now.' : 'Changes are saved when you press Save.'}</span>
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <div className="flex items-center gap-2 font-semibold">
              <Eye className="h-4 w-4 text-neon" aria-hidden /> What your child sees
            </div>
            <p className="mt-1 text-xs text-muted">No rupee amounts. A preview as you type; the server makes the final summary when you save.</p>
            <div className="mt-3">
              <SummaryCards s={preview} audience="preview" />
            </div>
          </Card>
        </aside>
      </div>

      <Preferences familyId={familyId} studentId={studentId} />
    </div>
  )
}

function MoneyField({ id, label, value, onChange, error, hint, optional }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void; error?: string; hint?: string; optional?: boolean }) {
  return (
    <Field label={label} htmlFor={id} error={error} hint={value ? `${formatINR(value, { compact: true })}${hint ? ` · ${hint}` : ''}` : hint}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          value={value === null || (optional && !value) ? '' : new Intl.NumberFormat('en-IN').format(value)}
          placeholder={optional ? 'Optional' : '0'}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, '')
            onChange(digits ? Number(digits) : optional ? null : 0)
          }}
          className={cx('num pl-7', error && 'ring-2 ring-bad/60')}
          aria-invalid={!!error}
        />
      </div>
    </Field>
  )
}

// ---------------------------------------------------------------- career hopes
function Preferences({ familyId, studentId }: { familyId: string; studentId?: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const prefs = useQuery({ queryKey: ['preferences', familyId], queryFn: () => notFoundToNull(family.preferences(familyId)) })
  const careers = useQuery({ queryKey: ['careers', 'all'], queryFn: () => catalog.careers({ page_size: 100 }), staleTime: 3_600_000 })
  const byId = useMemo(() => new Map((careers.data?.items ?? []).map((c) => [c.id, c])), [careers.data])
  const [list, setList] = useState<RankedPreference[]>([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [dirty, setDirty] = useState(false)
  const rerun = useCreateRun(studentId)

  useEffect(() => {
    if (loaded || !prefs.isSuccess) return
    setList([...(prefs.data?.preferences ?? [])].sort((a, b) => a.rank - b.rank))
    setLoaded(true)
  }, [prefs.isSuccess, prefs.data, loaded])

  const update = (l: RankedPreference[]) => {
    setList(l.map((p, i) => ({ ...p, rank: i + 1 })))
    setDirty(true)
  }
  const move = (i: number, d: -1 | 1) => {
    const l = [...list]
    const j = i + d
    if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]
    update(l)
  }
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    const taken = new Set(list.map((p) => p.career_id))
    return (careers.data?.items ?? []).filter((c) => !taken.has(c.id) && (c.name.toLowerCase().includes(q) || sectorLabel(c.sector).toLowerCase().includes(q))).slice(0, 6)
  }, [search, careers.data, list])
  const domainMatches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    const taken = new Set(list.map((p) => p.domain))
    return Object.keys(SECTORS).filter((k) => !taken.has(k) && sectorLabel(k).toLowerCase().includes(q)).slice(0, 2)
  }, [search, list])

  const save = useMutation({
    mutationFn: () => family.putPreferences(familyId, { preferences: list }),
    onSuccess: (out) => {
      qc.setQueryData(['preferences', familyId], out)
      void qc.invalidateQueries({ queryKey: keys.family })
      setDirty(false)
      toast('ok', 'Career hopes saved.')
    },
    onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save'),
  })

  const full = list.length >= 5
  const name = (p: RankedPreference) => (p.career_id ? byId.get(p.career_id)?.name ?? 'Career' : p.domain ? `Any ${sectorLabel(p.domain)} career` : 'Career')

  return (
    <Section title="Career hopes" subtitle="Up to five careers or fields you hope for, most hoped-for first. PRISM compares these with your child's results." className="mt-12">
      {prefs.isLoading || careers.isLoading ? (
        <Card aria-busy="true" className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </Card>
      ) : prefs.isError ? (
        <ErrorState error={prefs.error} onRetry={() => void prefs.refetch()} />
      ) : (
        <Card>
          {list.length === 0 ? (
            <EmptyState icon={<HeartHandshake className="h-6 w-6" />} title="No career hopes yet">
              Search below to add a career you would love for your child. It is fine to leave this empty too.
            </EmptyState>
          ) : (
            <ol className="space-y-2">
              {list.map((p, i) => (
                <li key={`${p.career_id ?? p.domain}-${i}`} className="rounded-xl bg-surface-2/60 p-3 hairline">
                  <div className="flex items-center gap-2">
                    <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-family/20 text-sm font-bold text-family">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{name(p)}</div>
                      {p.career_id && byId.get(p.career_id) && <div className="truncate text-xs text-muted">{sectorLabel(byId.get(p.career_id)!.sector)}</div>}
                    </div>
                    <IconBtn label={`Move ${name(p)} up`} onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn label={`Move ${name(p)} down`} onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn label={`Remove ${name(p)}`} onClick={() => update(list.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                  <Input
                    aria-label={`Note for ${name(p)}`}
                    placeholder="Why? (optional, e.g. respected and stable)"
                    value={p.note ?? ''}
                    maxLength={200}
                    onChange={(e) => update(list.map((x, j) => (j === i ? { ...x, note: e.target.value || null } : x)))}
                    className="mt-2 h-10 text-sm"
                  />
                </li>
              ))}
            </ol>
          )}

          <div className="relative mt-4">
            <label htmlFor="career-search" className="text-sm font-medium">
              {full ? 'You have five hopes. Remove one to add another.' : 'Add a career or field'}
            </label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input id="career-search" disabled={full} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Try doctor, engineer, design…" className="pl-9" autoComplete="off" />
            </div>
            {careers.isError && <p className="mt-2 text-xs text-bad">Could not load careers. {(careers.error as Error).message}</p>}
            {search.trim() && !full && (
              <ul className="mt-2 overflow-hidden rounded-xl hairline" role="listbox" aria-label="Matching careers">
                {matches.length === 0 && domainMatches.length === 0 && <li className="px-3 py-3 text-sm text-muted">No match. Try a shorter word.</li>}
                {matches.map((c: CareerSummary) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={() => {
                        update([...list, { rank: list.length + 1, career_id: c.id, domain: null, note: null }])
                        setSearch('')
                      }}
                    >
                      <Plus className="h-4 w-4 text-primary" aria-hidden />
                      <span className="flex-1">{c.name}</span>
                      <span className="text-xs text-muted">{sectorLabel(c.sector)}</span>
                    </button>
                  </li>
                ))}
                {domainMatches.map((d) => (
                  <li key={d}>
                    <button
                      type="button"
                      className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={() => {
                        update([...list, { rank: list.length + 1, career_id: null, domain: d, note: null }])
                        setSearch('')
                      }}
                    >
                      <Plus className="h-4 w-4 text-primary" aria-hidden />
                      <span className="flex-1">Any {sectorLabel(d)} career</span>
                      <Badge>Field</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
              Save career hopes
            </Button>
            {!dirty && save.isSuccess && studentId && (
              <Button
                variant="secondary"
                loading={rerun.isPending}
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={() =>
                  rerun.mutate(undefined, {
                    onSuccess: () => {
                      void qc.invalidateQueries({ queryKey: ['conflict'] })
                      toast('ok', 'Results updated.')
                    },
                    onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not update results'),
                  })
                }
              >
                Update results
              </Button>
            )}
            {dirty && <span className="text-xs text-warn">Unsaved changes</span>}
          </div>
        </Card>
      )}
    </Section>
  )
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink disabled:opacity-30">
      {children}
    </button>
  )
}
