// Landing sections below the hero: three explainers, what makes PRISM different, a how-it-works strip, the closing
// call to action and the footer. Numbers appear only when fetched from the public API.
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Compass,
  HeartHandshake,
  Lock,
  Map,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { FairnessReport, Health, Methodology } from '@/api/types'
import { Badge, Button, Skeleton, Term, cx } from '@/components/ui'
import { AFFORD, COMPONENTS, formatDate } from '@/lib/format'
import { homeFor, useSession } from '@/state/session'
import { useSettings } from '@/state/settings'
import { SplitText } from './SplitText'

// ---------------------------------------------------------------- building blocks
/** A card with a soft light that follows the pointer (desktop only; static elsewhere). */
export function SpotlightCard({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'li' | 'article' }) {
  const ref = useRef<HTMLElement>(null)
  const { reducedMotion } = useSettings()
  return (
    <As
      ref={ref as never}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => {
        if (reducedMotion || e.pointerType !== 'mouse' || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        ref.current.style.setProperty('--mx', `${e.clientX - r.left}px`)
        ref.current.style.setProperty('--my', `${e.clientY - r.top}px`)
      }}
      className={cx(
        'group relative overflow-hidden rounded-card bg-surface p-6 hairline',
        'before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100',
        'before:[background:radial-gradient(420px_circle_at_var(--mx,50%)_var(--my,0%),rgb(var(--primary)/0.12),transparent_45%)]',
        className,
      )}
    >
      {children}
    </As>
  )
}

function SectionHead({ eyebrow, title, sub, center }: { eyebrow: string; title: string; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={cx('mb-10 max-w-2xl md:mb-12', center && 'mx-auto text-center')}>
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neon">{eyebrow}</div>
      <SplitText as="h2" lines={[{ text: title }]} inView className="text-[clamp(1.9rem,4vw,2.8rem)] font-bold leading-[1.08]" />
      {sub && <p className="mt-3 text-base leading-relaxed text-muted md:text-[17px]">{sub}</p>}
      <div aria-hidden className={cx('mt-5 h-[2px] w-24 rounded-full', center && 'mx-auto')} style={{ background: 'linear-gradient(90deg, rgb(var(--fit)), rgb(var(--market)), rgb(var(--afford)), rgb(var(--roi)), rgb(var(--family)), rgb(var(--disrupt)))' }} />
    </div>
  )
}

function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary hairline', className)}>
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  )
}

const wrap = 'mx-auto max-w-page px-4 md:px-8'

// ---------------------------------------------------------------- 1. three explainers
const EXPLAINERS: { icon: LucideIcon; title: string; body: string; points: string[] }[] = [
  {
    icon: Brain,
    title: 'Know yourself',
    body: 'Answer a calm questionnaire, one question at a time. PRISM turns your answers into a profile of your interests, strengths and values. There are no right or wrong answers.',
    points: ['Save and come back any time', 'See your Holland code and strengths'],
  },
  {
    icon: HeartHandshake,
    title: 'Plan with your family',
    body: 'Parents add the family budget privately. PRISM finds scholarships, explains loans in plain words and suggests careers you can both feel good about.',
    points: ['Scholarships matched to you', 'Talking points for honest conversations'],
  },
  {
    icon: Map,
    title: 'See your future',
    body: 'Get a step-by-step roadmap with entrance exams, scholarship deadlines and starter projects you can begin in your own district.',
    points: ['Reminders before every deadline', 'A family report in English, Tamil or Hindi'],
  },
]

export function Explainers() {
  return (
    <section aria-labelledby="lp-explainers" className={cx(wrap, 'py-20 md:py-28')}>
      <span id="lp-explainers" className="sr-only">
        What PRISM does
      </span>
      <SectionHead eyebrow="What you get" title="Three steps, one calm place." sub="For students in Classes 9 to 12 and the people who care about them." />
      <ol className="grid gap-4 md:grid-cols-3">
        {EXPLAINERS.map((e, i) => (
          <SpotlightCard as="li" key={e.title} className="flex flex-col">
            <div className="flex items-center justify-between">
              <IconTile icon={e.icon} />
              <span className="num text-sm font-semibold text-muted">0{i + 1}</span>
            </div>
            <h3 className="mt-5 text-xl font-bold">{e.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{e.body}</p>
            <ul className="mt-5 space-y-2 border-t border-[rgb(var(--line)/var(--line-alpha))] pt-4 text-sm">
              {e.points.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-neon" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </SpotlightCard>
        ))}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------- 2. what makes PRISM different
export function WeightsBar({ methodology, loading }: { methodology?: Methodology; loading: boolean }) {
  if (loading) return <Skeleton className="h-16 w-full" />
  const w = methodology?.weights
  if (!w) return null
  const parts = COMPONENTS.filter((c) => typeof w[c.key] === 'number')
  return (
    <figure className="rounded-xl bg-surface-2 p-4 hairline">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wider">How much each part counts</span>
        <span className="num">{methodology.scoring_config_version}</span>
      </figcaption>
      <div className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full" role="img" aria-label={parts.map((c) => `${c.label} ${Math.round(w[c.key] * 100)}%`).join(', ')}>
        {parts.map((c) => (
          <span key={c.key} className={cx('h-full first:rounded-l-full last:rounded-r-full', c.key === 'disruption' && 'hatch')} style={{ flexGrow: w[c.key], background: c.key === 'disruption' ? undefined : c.color }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {parts.map((c) => (
          <li key={c.key} className="flex items-center gap-1.5">
            <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full', c.key === 'disruption' && 'hatch')} style={c.key === 'disruption' ? undefined : { background: c.color }} />
            <span className="truncate text-muted">{c.label}</span>
            <span className="num ml-auto font-semibold" style={{ color: c.color }}>
              {c.key === 'disruption' ? '−' : ''}
              {Math.round(w[c.key] * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

function FairnessStatus({ fairness, loading }: { fairness?: FairnessReport; loading: boolean }) {
  if (loading) return <Skeleton className="h-12 w-full" />
  if (!fairness) return null
  const passed = fairness.probes.filter((p) => p.passed).length
  return (
    <div className="rounded-xl bg-surface-2 p-3.5 text-sm hairline">
      <div className={cx('flex items-center gap-2 font-semibold', fairness.passed ? 'text-ok' : 'text-warn')}>
        <ShieldCheck className="h-4 w-4" aria-hidden />
        {fairness.passed ? 'Fairness checks passing' : 'Some fairness checks need attention'}
        <span className="num ml-auto text-xs font-medium text-muted">
          {passed} of {fairness.probes.length}
        </span>
      </div>
      <div className="mt-1 text-xs text-muted">
        Protected attributes used:{' '}
        <span className="font-semibold text-ink">{fairness.protected_attributes_used.length === 0 ? 'none' : fairness.protected_attributes_used.join(', ')}</span>
        {' · '}checked {formatDate(fairness.generated_at)}
      </div>
    </div>
  )
}

export function Different({ methodology, methodologyLoading, fairness, fairnessLoading }: { methodology?: Methodology; methodologyLoading: boolean; fairness?: FairnessReport; fairnessLoading: boolean }) {
  return (
    <section aria-label="What makes PRISM different" className="relative border-y border-[rgb(var(--line)/var(--line-alpha))] bg-surface/40 py-20 md:py-28">
      <div className={wrap}>
        <SectionHead eyebrow="Why families trust it" title="What makes PRISM different" sub="Most career tests give you a label. PRISM gives you the reasons, the costs and the sources, so you can check every step." />
        <div className="grid gap-4 md:grid-cols-6">
          {/* explainable score */}
          <SpotlightCard className="md:col-span-4">
            <div className="flex items-start gap-4">
              <IconTile icon={Sparkles} />
              <div>
                <h3 className="text-xl font-bold">A score that shows its working</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">Every career gets one score built from six parts. You can see how much each part added, and why.</p>
              </div>
            </div>
            <ul className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {COMPONENTS.map((c) => (
                <li key={c.key} className="flex gap-2.5 text-sm">
                  <span aria-hidden className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', c.key === 'disruption' && 'hatch')} style={c.key === 'disruption' ? undefined : { background: c.color, boxShadow: `0 0 10px ${c.color}` }} />
                  <span>
                    <span className="font-semibold">{c.label}</span>
                    <span className="text-muted"> — {c.meaning}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <WeightsBar methodology={methodology} loading={methodologyLoading} />
            </div>
          </SpotlightCard>

          {/* money-aware */}
          <SpotlightCard className="flex flex-col md:col-span-2">
            <IconTile icon={Wallet} />
            <h3 className="mt-4 text-xl font-bold">Money-aware</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
              Counts savings, income, scholarships and education loans, and warns when a monthly <Term id="emi">EMI</Term> would strain the family.
            </p>
            <div className="mt-auto pt-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Every course gets a label</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.values(AFFORD).map((a) => (
                  <Badge key={a.label} color={a.color}>
                    {a.label}
                  </Badge>
                ))}
              </div>
            </div>
          </SpotlightCard>

          {/* honest data */}
          <SpotlightCard className="flex flex-col md:col-span-2">
            <IconTile icon={BadgeCheck} />
            <h3 className="mt-4 text-xl font-bold">Honest about its data</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
              Every figure says where it came from. <span className="font-semibold text-ink">Checked</span> means confirmed against a published source;{' '}
              <span className="font-semibold text-ink">Estimate</span> means treat it as a guide.
            </p>
            <div className="mt-auto flex flex-wrap gap-1.5 pt-5" aria-label="Example labels">
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-ok hairline">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Checked
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted hairline">
                <CircleDashed className="h-3.5 w-3.5" aria-hidden /> Estimate
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted hairline">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Dates: announced, tentative or estimated
              </span>
            </div>
          </SpotlightCard>

          {/* fair */}
          <SpotlightCard className="flex flex-col md:col-span-2">
            <IconTile icon={Scale} />
            <h3 className="mt-4 text-xl font-bold">Fair by design</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">PRISM never asks for gender, caste, religion or community, and the score never uses them.</p>
            <div className="mt-auto pt-5">
              <FairnessStatus fairness={fairness} loading={fairnessLoading} />
              <Link to="/trust" className="mt-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary hover:underline">
                See the checks <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </SpotlightCard>

          {/* private */}
          <SpotlightCard className="flex flex-col md:col-span-2">
            <IconTile icon={Lock} />
            <h3 className="mt-4 text-xl font-bold">Private where it matters</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">Parents and students each see what they should. Raw answers and family money are shared only with consent.</p>
            <dl className="mt-auto grid grid-cols-2 gap-2 pt-5 text-xs">
              <div className="rounded-xl bg-surface-2 p-3 hairline">
                <dt className="mb-1 font-semibold text-ink">Students see</dt>
                <dd className="text-muted">Their own profile and results, and a gentle summary of family differences.</dd>
              </div>
              <div className="rounded-xl bg-surface-2 p-3 hairline">
                <dt className="mb-1 font-semibold text-ink">Parents see</dt>
                <dd className="text-muted">The budget, loans and the full family conversation report.</dd>
              </div>
            </dl>
          </SpotlightCard>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- 3. how it works strip
export function HowStrip({ dimensionCount }: { dimensionCount?: number }) {
  const stages: { icon: LucideIcon; label: string }[] = [
    { icon: ClipboardList, label: 'Your answers' },
    { icon: Brain, label: dimensionCount ? `${dimensionCount}-dimension profile` : 'Your profile' },
    { icon: Sparkles, label: 'Six-part score' },
    { icon: Wallet, label: 'Money plan' },
    { icon: Users, label: 'Family talk' },
    { icon: Compass, label: 'Roadmap' },
  ]
  return (
    <section aria-label="How it works" className={cx(wrap, 'py-20 md:py-24')}>
      <div className="card relative overflow-hidden p-6 md:p-10">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full" style={{ background: 'radial-gradient(circle, rgb(var(--neon) / 0.12), transparent 70%)' }} />
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neon">How it works</div>
            <h2 className="text-[clamp(1.7rem,3.4vw,2.4rem)] font-bold leading-tight">From answers to a plan, in six steps.</h2>
            <p className="mt-2 text-[15px] text-muted">Each step has a published formula you can read, in plain words.</p>
          </div>
          <Link to="/how-it-works" className="inline-flex min-h-[48px] items-center gap-2 self-start rounded-xl bg-surface-2 px-4 text-sm font-semibold hairline hover:bg-surface md:self-auto">
            How PRISM works in 60 seconds <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <ol className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <span aria-hidden className="absolute left-6 right-6 top-[22px] hidden h-px lg:block" style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--neon) / .5), rgb(var(--primary) / .5), transparent)' }} />
          {stages.map((s, i) => (
            <li key={s.label} className="relative flex flex-col items-start gap-2 rounded-xl bg-surface-2/60 p-3 hairline lg:items-center lg:bg-transparent lg:p-0 lg:text-center lg:[border:none]">
              <span className="relative grid h-11 w-11 place-items-center rounded-full bg-surface text-neon hairline shadow-[0_0_24px_-6px_rgb(var(--neon)/0.6)]">
                <s.icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-semibold leading-snug">
                <span className="num mr-1 text-xs text-muted">{i + 1}.</span>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- 4. closing call to action + footer
export function FinalCta() {
  const navigate = useNavigate()
  const { user } = useSession()
  return (
    <section aria-label="Get started" className={cx(wrap, 'pb-20')}>
      <div data-theme="dark" className="relative overflow-hidden rounded-[24px] bg-bg px-6 py-12 text-center text-ink hairline md:px-12 md:py-16">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(600px 300px at 50% 120%, rgb(var(--primary) / 0.35), transparent 70%), radial-gradient(400px 200px at 50% -20%, rgb(var(--neon) / 0.12), transparent 70%)' }} />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-[clamp(1.9rem,4.2vw,3rem)] font-extrabold leading-[1.06]">
            Ready to see <span className="spectrum-text">every path</span>?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted">Start with the questionnaire. Parents can join any time with an invite code.</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => navigate(user ? homeFor(user.role) : '/register')} icon={<Sparkles className="h-[18px] w-[18px]" aria-hidden />}>
              {user ? 'Open PRISM' : 'Get started'}
            </Button>
            {!user && (
              <Link to="/signin" className="inline-flex min-h-[52px] items-center rounded-xl px-5 font-semibold text-ink hairline hover:bg-surface-2">
                I already have an account
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export function SiteFooter({ health, healthError }: { health?: Health; healthError: boolean }) {
  const online = health?.status === 'ok'
  return (
    <footer className="border-t border-[rgb(var(--line)/var(--line-alpha))]">
      <div className={cx(wrap, 'flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between')}>
        <div>
          <p className="flex items-start gap-2 text-sm font-medium">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-neon" aria-hidden />
            Every number shows its source and whether it has been checked.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {health ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cx('h-2 w-2 rounded-full', online ? 'bg-ok' : 'bg-warn')} />
                {online ? 'PRISM is online' : 'PRISM is running with some features limited'}
                <span className="num">· {health.engine_version}</span>
              </span>
            ) : healthError ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full bg-bad" /> Cannot reach PRISM right now
              </span>
            ) : null}
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-1 gap-y-1 text-sm">
          {[
            ['/how-it-works', 'How it works'],
            ['/trust', 'How we know'],
            ['/signin', 'Sign in'],
            ['/register', 'Create account'],
          ].map(([to, label]) => (
            <Link key={to} to={to} className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-muted hover:bg-surface-2 hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
