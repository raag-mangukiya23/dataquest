// Loans (/loans): an education-loan explainer in plain words. Every number comes from GET /loans/explain.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, CircleHelp, Landmark, XCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { loans } from '@/api/endpoints'
import type { LoanExplanation, LoanOption, LoanSchemeCheck } from '@/api/types'
import { RangeField, RangeStyles, useDebounced } from '@/components/plan/controls'
import { ProvenanceBadge } from '@/components/score'
import { Badge, Card, EmptyState, ErrorState, Field, InfoTip, Input, PageHeader, Section, Select, Skeleton, cx } from '@/components/ui'
import { formatINR, num, pct } from '@/lib/format'
import { useSettings } from '@/state/settings'

const clampNum = (v: string | null, lo: number, hi: number, fallback: number) => {
  const n = Number(v)
  return v !== null && Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : fallback
}

export default function Loans() {
  const [params, setParams] = useSearchParams()
  const [amount, setAmount] = useState(() => clampNum(params.get('amount'), 50_000, 4_000_000, 800_000))
  const [years, setYears] = useState(() => clampNum(params.get('years'), 1, 7, 4))
  const [income, setIncome] = useState('')
  const [tier, setTier] = useState('')
  const [rate, setRate] = useState('')

  // keep the URL in step so the page can be shared
  useEffect(() => {
    const next = new URLSearchParams(params)
    next.set('amount', String(amount))
    next.set('years', String(years))
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, years])

  const q = useDebounced(
    {
      amount,
      course_years: years,
      annual_income: income && Number(income) > 0 ? Number(income) : undefined,
      institution_tier: tier ? Number(tier) : undefined,
      rate: rate && Number(rate) > 0 ? Number(rate) / 100 : undefined,
    },
    400,
  )
  const loan = useQuery({ queryKey: ['loan-explain', q], queryFn: () => loans.explain(q), placeholderData: keepPreviousData })

  return (
    <div className="space-y-8">
      <RangeStyles />
      <PageHeader
        eyebrow="Education loans"
        title="What a loan really costs"
        subtitle="Move the amount and see the monthly payment, the interest, and the government schemes that may help. Nothing here is a bank offer."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Card className="h-fit space-y-5 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-semibold">Your loan</h2>
          <RangeField
            id="loan-amount"
            label="Amount to borrow"
            value={amount}
            min={50_000}
            max={4_000_000}
            step={10_000}
            onChange={setAmount}
            display={formatINR(amount, { compact: true })}
            valueText={formatINR(amount)}
            left="₹50,000"
            right="₹40 L"
            color="rgb(var(--loan))"
          />
          <Field label="Or type the exact amount (₹)" htmlFor="loan-amount-num">
            <Input
              id="loan-amount-num"
              type="number"
              inputMode="numeric"
              min={50_000}
              max={4_000_000}
              step={1000}
              value={amount}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) setAmount(Math.min(4_000_000, Math.max(0, n)))
              }}
              onBlur={() => setAmount((a) => Math.max(50_000, a))}
            />
          </Field>
          <RangeField
            id="loan-years"
            label="Course length"
            value={years}
            min={1}
            max={7}
            step={1}
            onChange={setYears}
            display={`${years} ${years === 1 ? 'year' : 'years'}`}
            left="1 year"
            right="7 years"
          />
          <Field label="Family income per year (optional)" hint="Some schemes depend on income." htmlFor="loan-income">
            <Input id="loan-income" type="number" inputMode="numeric" min={0} placeholder="e.g. 400000" value={income} onChange={(e) => setIncome(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="College tier (optional)" htmlFor="loan-tier">
              <Select id="loan-tier" value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="">Not sure</option>
                <option value="1">1 · top-ranked</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </Select>
            </Field>
            <Field label="Interest rate % (optional)" htmlFor="loan-rate">
              <Input id="loan-rate" type="number" inputMode="decimal" min={0} max={25} step={0.1} placeholder="Bank's rate" value={rate} onChange={(e) => setRate(e.target.value)} />
            </Field>
          </div>
        </Card>

        <div className="min-w-0 space-y-8" aria-live="polite">
          {loan.isLoading ? (
            <LoanSkeleton />
          ) : loan.error && !loan.data ? (
            <ErrorState error={loan.error} onRetry={() => void loan.refetch()} title="We could not work out this loan" />
          ) : loan.data ? (
            <LoanResult data={loan.data} updating={loan.isFetching} />
          ) : (
            <EmptyState icon={<Landmark className="h-6 w-6" />} title="Pick an amount">
              Choose how much you might borrow to see the costs.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  )
}

function LoanSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-40" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}

function LoanResult({ data, updating }: { data: LoanExplanation; updating: boolean }) {
  const [tenor, setTenor] = useState<number | null>(null)
  const options = data.options
  const chosen: LoanOption | undefined = options.find((o) => o.tenor_years === tenor) ?? options[Math.min(2, options.length - 1)]
  return (
    <div className={cx('space-y-8 transition-opacity duration-200', updating && 'opacity-70')}>
      {/* plain words first */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-20 blur-3xl" style={{ background: 'rgb(var(--loan))' }} aria-hidden />
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">In plain words</h2>
        <ul className="mt-3 space-y-3">
          {data.plain_language.map((line, i) => (
            <li key={i} className="font-display text-lg leading-snug md:text-xl">
              {line}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Interest while studying <InfoTip term="moratorium" text={`Interest that builds up during the course and the ${data.moratorium_months}-month break before repayment starts.`} />
          </div>
          <div className="num mt-2 text-2xl font-semibold text-loan">{formatINR(data.interest_while_studying)}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">Owed when repayment starts</div>
          <div className="num mt-2 text-2xl font-semibold">{formatINR(data.owed_when_repayment_starts)}</div>
          <div className="mt-1 text-xs text-muted">after a {num(data.moratorium_months)}-month break</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">Interest rate used</div>
          <div className="num mt-2 text-2xl font-semibold">{pct(data.assumed_rate, 1)}</div>
          <Badge className="mt-2" color="rgb(var(--muted))">Estimate · check with your bank</Badge>
        </Card>
      </div>

      <Section title="Monthly payment by repayment length" subtitle="A longer loan means a smaller EMI, but you pay much more interest in total. Tap a bar.">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <Card className="min-w-0">
            <EmiChart options={options} selected={chosen?.tenor_years} onSelect={setTenor} />
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Repayment length">
              {options.map((o) => (
                <button
                  key={o.tenor_years}
                  type="button"
                  aria-pressed={chosen?.tenor_years === o.tenor_years}
                  onClick={() => setTenor(o.tenor_years)}
                  className={cx('min-h-[44px] rounded-xl px-3 text-left text-sm hairline', chosen?.tenor_years === o.tenor_years ? 'bg-primary text-primary-ink' : 'bg-surface-2')}
                >
                  <span className="font-semibold">{o.tenor_years} yrs</span> <span className="num opacity-80">· {formatINR(o.monthly_emi)}/mo</span>
                </button>
              ))}
            </div>
          </Card>
          {chosen && <RepaidStack option={chosen} principal={data.amount} />}
        </div>
      </Section>

      <Section title="Government schemes" subtitle="Checked against what you told us. Ask your bank to confirm.">
        {data.schemes.length === 0 ? (
          <EmptyState title="No schemes to check">Add your family income to see which schemes may apply.</EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.schemes.map((s) => (
              <SchemeCard key={s.key} s={s} />
            ))}
          </div>
        )}
      </Section>

      {data.cautions.length > 0 && (
        <Section title="Before you sign">
          <Card>
            <ul className="space-y-3">
              {data.cautions.map((c, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}
    </div>
  )
}

function EmiChart({ options, selected, onSelect }: { options: LoanOption[]; selected?: number; onSelect: (t: number) => void }) {
  const data = options.map((o) => ({ ...o, label: `${o.tenor_years} yrs` }))
  return (
    <div className="h-64 w-full" role="img" aria-label={options.map((o) => `${o.tenor_years} years: ${formatINR(o.monthly_emi)} a month, ${formatINR(o.total_interest)} interest`).join('; ')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgb(var(--line) / var(--line-alpha))" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} tickFormatter={(v: number) => formatINR(v, { compact: true })} />
          <Tooltip
            cursor={{ fill: 'rgb(var(--surface-2))' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const o = payload[0].payload as LoanOption
              return (
                <div className="card px-3 py-2 text-xs">
                  <div className="font-semibold">{o.tenor_years} years</div>
                  <div className="num">EMI {formatINR(o.monthly_emi)} / month</div>
                  <div className="num text-loan">Interest {formatINR(o.total_interest)}</div>
                  <div className="num text-muted">Total {formatINR(o.total_repaid)}</div>
                </div>
              )
            }}
          />
          <Bar dataKey="monthly_emi" radius={[8, 8, 0, 0]} onClick={(d: { tenor_years?: number }) => d.tenor_years && onSelect(d.tenor_years)} className="cursor-pointer">
            {data.map((o) => (
              <Cell key={o.tenor_years} fill={o.tenor_years === selected ? 'rgb(var(--primary))' : 'rgb(var(--primary) / 0.35)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** A stack of coins: the bottom ones are what you borrowed, the top (orange) ones the interest. */
function RepaidStack({ option, principal }: { option: LoanOption; principal: number }) {
  const { reducedMotion } = useSettings()
  const COINS = 14
  const interestCoins = useMemo(() => {
    if (option.total_repaid <= 0) return 0
    return Math.max(1, Math.round((option.total_interest / option.total_repaid) * COINS))
  }, [option])
  return (
    <Card className="flex flex-col items-center text-center">
      <div className="text-xs font-medium uppercase tracking-wider text-muted">Total repaid over {option.tenor_years} years</div>
      <div className="num mt-2 text-3xl font-semibold">{formatINR(option.total_repaid, { compact: true })}</div>
      <div className="relative mt-4 h-40 w-24" aria-hidden>
        <AnimatePresence initial={false}>
          {Array.from({ length: COINS }).map((_, i) => {
            const isInterest = i >= COINS - interestCoins
            return (
              <motion.div
                key={`${option.tenor_years}-${i}`}
                className="absolute left-0 right-0 mx-auto h-4 w-20 rounded-[50%]"
                style={{
                  bottom: i * 9,
                  background: isInterest ? 'rgb(var(--loan))' : 'rgb(var(--muted) / 0.55)',
                  boxShadow: 'inset 0 -3px 0 rgb(0 0 0 / .25), 0 1px 0 rgb(255 255 255 / .15)',
                }}
                initial={reducedMotion ? false : { opacity: 0, y: -24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, delay: reducedMotion ? 0 : i * 0.02 }}
              />
            )
          })}
        </AnimatePresence>
      </div>
      <div className="mt-3 w-full space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-muted/60" /> Borrowed
          </span>
          <span className="num">{formatINR(principal, { compact: true })}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-loan" /> Interest
          </span>
          <span className="num text-loan">{formatINR(option.total_interest, { compact: true })}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted">Every month</span>
          <span className="num font-semibold">{formatINR(option.monthly_emi)}</span>
        </div>
      </div>
    </Card>
  )
}

function SchemeCard({ s }: { s: LoanSchemeCheck }) {
  const status =
    s.applies === true
      ? { label: 'Applies', color: 'rgb(var(--ok))', Icon: CheckCircle2 }
      : s.applies === false
        ? { label: 'Does not apply', color: 'rgb(var(--muted))', Icon: XCircle }
        : { label: 'Need more info', color: 'rgb(var(--warn))', Icon: CircleHelp }
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug">{s.name}</h3>
        <Badge color={status.color}>
          <status.Icon className="h-3.5 w-3.5" aria-hidden /> {status.label}
        </Badge>
      </div>
      <p className="text-sm text-muted">{s.why}</p>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted">What you get</dt>
          <dd className="mt-0.5">{s.benefit}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted">How to apply</dt>
          <dd className="mt-0.5">{s.how_to_apply}</dd>
        </div>
      </dl>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <ProvenanceBadge p={s.provenance} />
        {s.provenance.source_url && (
          <a href={s.provenance.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">
            Official source
          </a>
        )}
      </div>
    </Card>
  )
}
