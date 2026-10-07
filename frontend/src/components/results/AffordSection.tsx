// "Can we afford it": the course ledger, the funding mix (parents only, as the backend hides family money from
// others), return on investment and other ways to study the same thing.
import { ArrowRight, GraduationCap, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import type { FinancialAssessment } from '@/api/types'
import { FundingPill, Money } from '@/components/score'
import { Badge, InfoTip, Term, Tip } from '@/components/ui'
import { formatDate, formatINR, pct, titleCase } from '@/lib/format'
import { useSettings } from '@/state/settings'

function Row({ label, children, strong, sub }: { label: ReactNode; children: ReactNode; strong?: boolean; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 hairline-b last:border-b-0">
      <dt className="min-w-0 text-sm text-muted">
        {label}
        {sub && <span className="mt-0.5 block text-xs text-muted/80">{sub}</span>}
      </dt>
      <dd className={strong ? 'text-right text-lg font-semibold' : 'text-right text-sm font-medium'}>{children}</dd>
    </div>
  )
}

/** How the total is covered. Family share = what is left after scholarships, the loan and any gap. */
function FundingDonut({ f }: { f: FinancialAssessment }) {
  const { reducedMotion } = useSettings()
  const sch = f.scholarship_expected
  const loan = f.loan_required ?? 0
  const gap = f.funding_gap ?? 0
  const family = Math.max(0, Math.min(f.family_funds ?? 0, f.total_cost - sch - loan - gap))
  const parts = [
    { key: 'family', label: 'Family share (estimated)', value: family, color: 'rgb(var(--primary))' },
    { key: 'sch', label: 'Scholarships (likely)', value: sch, color: 'rgb(var(--neon))' },
    { key: 'loan', label: 'Education loan', value: loan, color: 'rgb(var(--loan))' },
    { key: 'gap', label: 'Still missing', value: gap, color: 'rgb(var(--bad))' },
  ].filter((p) => p.value > 0)
  if (!parts.length) return null
  return (
    <figure className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative h-44 w-44 shrink-0" role="img" aria-label={`How the ${formatINR(f.total_cost)} total is covered: ${parts.map((p) => `${p.label} ${formatINR(p.value)}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={parts}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={parts.length > 1 ? 2 : 0}
              stroke="rgb(var(--surface))"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={!reducedMotion}
              animationDuration={700}
            >
              {parts.map((p) => (
                <Cell key={p.key} fill={p.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <span className="block text-[11px] text-muted">Total</span>
            <Money value={f.total_cost} className="text-lg font-semibold" />
          </div>
        </div>
      </div>
      <figcaption className="w-full space-y-2">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.label}
            </span>
            <span className="num font-medium">{formatINR(p.value)}</span>
          </div>
        ))}
      </figcaption>
    </figure>
  )
}

export function AffordSection({ f, alternatives, link }: { f: FinancialAssessment; alternatives: FinancialAssessment[]; link: (p: string) => string }) {
  const roi = f.roi
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="card p-5 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold">{f.pathway_name}</h3>
              <p className="text-sm text-muted">{f.institution_name}</p>
            </div>
            <FundingPill value={f.affordability_class} />
          </div>
          <dl className="mt-3">
            <Row label={<Term id="quota">Admission route</Term>}>{titleCase(f.quota)} quota</Row>
            <Row label="Length">{f.duration_years} years</Row>
            <Row label="Total cost" sub="All study years, with fees rising each year" strong>
              <Money value={f.total_cost} compact={false} />
            </Row>
            <Row label="Family money for it">
              <Money value={f.family_funds} compact={false} />
            </Row>
            {f.scholarship_plan.length > 0 ? (
              f.scholarship_plan.map((s) => (
                <Row
                  key={s.scholarship_id}
                  label={s.name}
                  sub={
                    <>
                      {formatINR(s.amount_total)} award · {pct(s.probability)} likely
                      {s.deadline ? ` · apply by ${formatDate(s.deadline)}` : ''}
                    </>
                  }
                >
                  <Tip content="The award times the chance of getting it: a fair amount to plan with.">
                    <span className="num">{formatINR(s.expected_value)}</span>
                  </Tip>
                </Row>
              ))
            ) : (
              <Row label="Scholarships">None matched yet</Row>
            )}
            <Row label="Scholarships to plan with">
              <Money value={f.scholarship_expected} compact={false} />
            </Row>
            <Row label="Loan needed">
              <Money value={f.loan_required} compact={false} />
            </Row>
            <Row label={<Term id="emi">Monthly EMI</Term>} sub="After studies end">
              <Money value={f.monthly_emi} compact={false} />
            </Row>
            <Row label="Still missing" sub="After family money, scholarships and the largest sensible loan">
              <Money value={f.funding_gap} compact={false} className={(f.funding_gap ?? 0) > 0 ? 'text-bad' : undefined} />
            </Row>
            {f.loan_scheme && (
              <Row label="Interest help">
                <span className="block max-w-[16rem] text-sm font-normal">{f.loan_scheme}</span>
              </Row>
            )}
            {f.admission_chance < 0.6 && (
              <Row
                label={
                  <span className="inline-flex items-center gap-1">
                    Admission chance <InfoTip term="admission" />
                  </span>
                }
              >
                <span className="num text-warn">{pct(f.admission_chance)}</span>
              </Row>
            )}
          </dl>
          {(f.loan_required ?? 0) > 0 && (
            <Link
              to={link(`/loans?amount=${f.loan_required}&years=${f.duration_years}`)}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-surface-2 px-4 text-sm font-semibold hairline hover:bg-primary/15"
            >
              Explain this loan <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>

        <div className="space-y-4 lg:col-span-5">
          {f.family_funds === null && (
            <div className="card flex gap-3 p-5">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
              <div>
                <h3 className="font-semibold">Some figures stay with your parents</h3>
                <p className="mt-1 text-sm text-muted">
                  Family savings, loan size and EMI are private to parents unless they choose to share them. The funding label above
                  already uses them, so you can still see whether this route is comfortable.
                </p>
              </div>
            </div>
          )}
          {f.family_funds !== null && (
            <div className="card p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-muted">How it is paid for</h3>
              <FundingDonut f={f} />
            </div>
          )}
          <div className="card p-5">
            <h3 className="flex items-center gap-1 text-sm font-semibold uppercase tracking-[0.14em] text-muted">
              What it gives back <InfoTip term="roi" />
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted">First-year pay</dt>
                <dd className="mt-1 text-xl font-semibold">
                  <Money value={roi.starting_salary} />
                  <span className="text-xs font-normal text-muted"> /yr</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Pay after 10 years</dt>
                <dd className="mt-1 text-xl font-semibold">
                  <Money value={roi.salary_year10} />
                  <span className="text-xs font-normal text-muted"> /yr</span>
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted">Pays back the course in</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {roi.payback_years === null ? (
                    <span className="text-base font-medium text-warn">Not within 10 years</span>
                  ) : (
                    <>
                      <span className="num">{roi.payback_years}</span> <span className="text-sm font-normal text-muted">years of work</span>
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {alternatives.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-muted">Other ways to study this</h3>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {alternatives.map((a) => (
              <li key={a.pathway_id} className="card flex flex-col gap-2 p-4">
                <div className="flex items-start gap-2">
                  <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{a.pathway_name}</p>
                    <p className="text-xs text-muted">{a.institution_name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FundingPill value={a.affordability_class} />
                  <Badge className="bg-surface-2 text-muted hairline">{titleCase(a.quota)} quota</Badge>
                </div>
                <dl className="mt-auto grid grid-cols-2 gap-2 pt-1 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Total cost</dt>
                    <dd className="font-medium">
                      <Money value={a.total_cost} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Pays back in</dt>
                    <dd className="font-medium">{a.roi.payback_years === null ? 'Over 10 yrs' : <span className="num">{a.roi.payback_years} yrs</span>}</dd>
                  </div>
                  {a.admission_chance < 0.6 && (
                    <div className="col-span-2">
                      <dt className="text-xs text-muted">Admission chance</dt>
                      <dd className="num font-medium text-warn">{pct(a.admission_chance)}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
