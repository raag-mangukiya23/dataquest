// "Your journey" hub: six steps from account to plan, with live status from the API.
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardList,
  Compass,
  HeartHandshake,
  Lock,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { consents } from '@/api/endpoints'
import { useDeadlines, useFamily, useLatestRun } from '@/api/queries'
import type { AnalysisRun } from '@/api/types'
import { Badge, Button, Card, ErrorState, PageSkeleton, Section, Skeleton, cx, useToast } from '@/components/ui'
import { DateStatusTag, FundingPill, ScoreBar } from '@/components/score'
import { firstName, useInstruments, useTraits } from '@/components/journey/lib'
import { ProgressRing } from '@/components/journey/visuals'
import { formatDate, sectorLabel } from '@/lib/format'
import { homeFor, useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

type Status = 'done' | 'next' | 'todo' | 'locked'
interface Step {
  key: string
  icon: ReactNode
  title: string
  why: string
  status: Exclude<Status, 'next'>
  action: { label: string; to?: string; onClick?: () => void; loading?: boolean }
  detail?: string
}

export default function Home() {
  const { user } = useSession()
  const { reducedMotion } = useSettings()
  const navigate = useNavigate()
  const toast = useToast()
  const role = user?.role
  const isStudent = role === 'student'
  const isParent = role === 'parent'

  const fam = useFamily()
  const latest = useLatestRun()
  const studentId = latest.studentId
  const instruments = useInstruments()
  const traits = useTraits(studentId, isStudent || isParent)
  const consentList = useQuery({ queryKey: ['consents'], queryFn: consents.list, enabled: isParent, retry: false })
  const dl = useDeadlines(latest.run ? studentId : undefined)

  if (role === 'educator' || role === 'admin') {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <h1 className="text-xl font-semibold">Your workspace is elsewhere</h1>
        <p className="mt-2 text-sm text-muted">The journey page is for students and parents.</p>
        <Link to={homeFor(role)} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-ink">
          Go to my dashboard <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </Card>
    )
  }

  const loading = fam.isLoading || latest.isLoading || instruments.isLoading || (!!studentId && traits.isLoading)
  if (loading) return <PageSkeleton />
  if (fam.error) return <ErrorState error={fam.error} onRetry={() => void fam.refetch()} title="We could not load your family" />
  if (latest.error) return <ErrorState error={latest.error} onRetry={latest.refetch} title="We could not load your results" />

  const run = latest.run
  const hasRun = !!latest.summary

  // ---- step 2: approval
  let consentDone: boolean
  let consentDetail: string | undefined
  if (isStudent) {
    consentDone = user!.consent_status === 'granted' || user!.consent_status === 'not_required'
    consentDetail = user!.consent_status === 'not_required' ? 'Not needed: you are 18 or older.' : user!.consent_status === 'revoked' ? 'Approval was withdrawn.' : undefined
  } else {
    const granted = (consentList.data ?? []).some(
      (c) => c.consent_type === 'minor_data_processing' && c.granted && !c.revoked_at && (!studentId || c.subject_user_id === studentId),
    )
    consentDone = granted || (hasRun && !consentList.isError)
    if (!studentId) consentDetail = 'Link your child first, then approve.'
  }

  // ---- step 3: questionnaire
  const total = instruments.data?.length ?? 0
  const completed = traits.data?.instruments_completed?.length ?? 0
  const qDone = total > 0 ? completed >= total : false
  // 404 = no traits yet (not started); other errors = unknown
  const traitsErr = traits.error as { status?: number } | null
  const qKnown = !traits.isError || traitsErr?.status === 404
  const questionnaireDone = qDone || (!qKnown && hasRun)

  const steps: Step[] = [
    {
      key: 'account',
      icon: <UserRound className="h-5 w-5" />,
      title: 'Your account',
      why: 'Your private space for answers, results and plans.',
      status: 'done',
      action: { label: 'Settings', to: '/settings' },
    },
    {
      key: 'consent',
      icon: <ShieldCheck className="h-5 w-5" />,
      title: 'Parental approval',
      why: isStudent ? 'Under 18? A parent says yes before we use your answers.' : 'Your yes lets PRISM use your child’s answers.',
      status: consentDone ? 'done' : 'todo',
      detail: consentDetail,
      action: { label: consentDone ? 'Review' : isStudent ? 'Ask a parent' : 'Give approval', to: isParent && !studentId ? '/family' : '/consent' },
    },
    {
      key: 'questionnaire',
      icon: <ClipboardList className="h-5 w-5" />,
      title: 'Questionnaire',
      why: isStudent ? 'Five short sets about what you enjoy and how you think.' : 'Your child answers five short sets. You will see results, not answers.',
      status: questionnaireDone ? 'done' : isParent ? 'todo' : consentDone ? 'todo' : 'locked',
      detail: total && qKnown ? `${completed} of ${total} sets done` : undefined,
      action: { label: questionnaireDone ? 'See profile' : isStudent ? (completed ? 'Continue' : 'Start') : 'How it works', to: questionnaireDone ? '/profile' : '/questionnaire' },
    },
    {
      key: 'budget',
      icon: <Wallet className="h-5 w-5" />,
      title: 'Family budget',
      why: isParent ? 'A rough budget so we only suggest paths you can fund.' : 'Your parents add a rough budget, kept private to them.',
      status: fam.data?.has_finance ? 'done' : 'todo',
      action: { label: fam.data?.has_finance ? 'Review' : isParent ? 'Add budget' : 'See what it is', to: fam.data ? '/family/budget' : '/family' },
      detail: fam.data ? undefined : 'Join or create a family first.',
    },
    {
      key: 'results',
      icon: <Sparkles className="h-5 w-5" />,
      title: 'Your results',
      why: 'Careers ranked on fit, jobs, cost, earnings, family and automation.',
      status: hasRun ? 'done' : questionnaireDone ? 'todo' : 'locked',
      action: hasRun
        ? { label: 'Open results', to: '/results' }
        : {
            label: 'Make my results',
            loading: latest.create.isPending,
            onClick: () =>
              latest.create.mutate(undefined, {
                onSuccess: () => navigate('/results'),
                onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not make results.'),
              }),
          },
    },
    {
      key: 'plan',
      icon: <HeartHandshake className="h-5 w-5" />,
      title: 'Family meeting & plan',
      why: 'Talk it through together, then follow a step-by-step plan.',
      status: hasRun ? 'todo' : 'locked',
      action: { label: 'Family meeting', to: '/family/meeting' },
    },
  ]
  const nextIdx = steps.findIndex((s) => s.status === 'todo')
  const doneCount = steps.filter((s) => s.status === 'done').length
  const stale = hasRun && latest.summary && Date.now() - new Date(latest.summary.created_at).getTime() > 180 * 86_400_000

  const studentName = fam.data?.members.find((m) => m.role === 'student')?.full_name

  return (
    <div className="space-y-8">
      {/* hero */}
      <motion.section
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="card relative overflow-hidden p-5 md:p-8"
      >
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-30 blur-3xl" style={{ background: 'conic-gradient(from 90deg, rgb(var(--fit)), rgb(var(--market)), rgb(var(--afford)), rgb(var(--roi)), rgb(var(--family)), rgb(var(--disrupt)), rgb(var(--fit)))' }} />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neon">Your journey</div>
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">Hi {firstName(user?.full_name)}.</h1>
            <p className="mt-2 max-w-xl text-[15px] text-muted">
              {doneCount === steps.length
                ? 'Every step is done. Keep your plan moving.'
                : isParent && studentName
                  ? `Here is where ${firstName(studentName)}'s journey stands. One step at a time.`
                  : 'Six steps from first questions to a plan your family agrees on. One step at a time.'}
            </p>
            {nextIdx >= 0 && (
              <div className="mt-5">
                <StepButton step={steps[nextIdx]} primary magnetic size="lg" />
              </div>
            )}
          </div>
          <ProgressRing done={doneCount} total={steps.length} size={128} />
        </div>
      </motion.section>

      {stale && (
        <Card className="flex flex-col gap-3 border-family/40 sm:flex-row sm:items-center">
          <Compass className="h-6 w-6 shrink-0 text-family" aria-hidden />
          <div className="flex-1">
            <div className="font-semibold">What did you decide?</div>
            <p className="text-sm text-muted">Your results are from {formatDate(latest.summary!.created_at)}. Tell us what happened next; it helps the next student.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/outcomes')}>Share an update</Button>
        </Card>
      )}

      {/* checklist */}
      <Section title="Steps" subtitle={`${doneCount} of ${steps.length} done`}>
        <ol className="grid gap-3">
          {steps.map((s, i) => {
            const status: Status = i === nextIdx ? 'next' : s.status
            return (
              <motion.li
                key={s.key}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: reducedMotion ? 0 : 0.05 * i }}
                className={cx(
                  'card flex flex-col gap-3 p-4 sm:flex-row sm:items-center',
                  status === 'next' && 'ring-1 ring-primary/60 shadow-glow',
                  status === 'locked' && 'opacity-70',
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div
                    className={cx(
                      'relative grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                      status === 'done' ? 'bg-ok/15 text-ok' : status === 'next' ? 'bg-primary/20 text-primary' : 'bg-surface-2 text-muted',
                    )}
                  >
                    {status === 'done' ? <Check className="h-5 w-5" aria-hidden /> : status === 'locked' ? <Lock className="h-4 w-4" aria-hidden /> : s.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted num">{i + 1}</span>
                      <h3 className="font-semibold">{s.title}</h3>
                      <StatusBadge status={status} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{s.why}</p>
                    {s.detail && <p className="mt-1 text-xs text-muted">{s.detail}</p>}
                  </div>
                </div>
                {status !== 'locked' && status !== 'next' && <StepButton step={s} />}
                {status === 'next' && <StepButton step={s} primary />}
              </motion.li>
            )
          })}
        </ol>
      </Section>

      {hasRun && <TopCareers run={run} loading={latest.isLoading} />}

      {hasRun && (
        <Section title="Coming up" subtitle="The next dates for your top careers" actions={<Link to="/exams" className="text-sm font-medium text-primary">All dates</Link>}>
          {dl.isLoading ? (
            <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : dl.error ? (
            <ErrorState error={dl.error} onRetry={() => void dl.refetch()} title="Dates did not load" />
          ) : !dl.data?.items.length ? (
            <Card className="text-sm text-muted">No dates in the next year for your top careers. We will show them here when they are announced.</Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {dl.data.items.slice(0, 3).map((d) => (
                <Card key={d.ref_id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <CalendarClock className="h-5 w-5 shrink-0 text-neon" aria-hidden />
                    <DateStatusTag status={d.date_status} />
                  </div>
                  <div className="mt-2 font-medium leading-snug">{d.title}</div>
                  <div className="mt-1 flex items-baseline gap-2 text-sm text-muted">
                    <span>{formatDate(d.due)}</span>
                    <span className="num font-semibold text-ink">{d.days_left === 0 ? 'today' : `${d.days_left} days`}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
          {dl.data?.notice && <p className="mt-2 text-xs text-muted">{dl.data.notice}</p>}
        </Section>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'done') return <Badge color="rgb(var(--ok))">Done</Badge>
  if (status === 'next') return <Badge color="rgb(var(--primary))">Next step</Badge>
  if (status === 'locked') return <Badge color="rgb(var(--muted))">Later</Badge>
  return <Badge color="rgb(var(--muted))">To do</Badge>
}

function StepButton({ step, primary, magnetic, size }: { step: Step; primary?: boolean; magnetic?: boolean; size?: 'md' | 'lg' }) {
  const navigate = useNavigate()
  const a = step.action
  return (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      size={size ?? (primary ? 'md' : 'sm')}
      magnetic={magnetic}
      loading={a.loading}
      className={cx('w-full shrink-0 sm:w-auto', !primary && 'min-h-[44px]')}
      onClick={a.onClick ?? (() => a.to && navigate(a.to))}
    >
      {a.label}
      {primary && <ArrowRight className="h-4 w-4" aria-hidden />}
    </Button>
  )
}

function TopCareers({ run, loading }: { run: AnalysisRun | undefined; loading: boolean }) {
  if (loading || !run) return (
    <Section title="Top 3 careers">
      <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
    </Section>
  )
  const top = [...run.recommendations].sort((a, b) => a.rank - b.rank).slice(0, 3)
  return (
    <Section title="Top 3 careers" subtitle="From your latest results" actions={<Link to="/results" className="text-sm font-medium text-primary">See all</Link>}>
      {top.length === 0 ? (
        <Card className="text-sm text-muted">No careers in this result yet.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {top.map((r, i) => (
            <Link key={r.career.id} to={`/results/${r.career.id}`} className="card block p-4 transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted">#{r.rank} · {sectorLabel(r.career.sector)}</div>
                  <div className="mt-0.5 truncate font-semibold">{r.career.name}</div>
                </div>
                <div className="num text-xl font-bold">{Math.round(r.final_score * 100)}</div>
              </div>
              <ScoreBar contributions={r.contributions} className="mt-3" delay={0.1 * i} />
              <div className="mt-3">
                <FundingPill value={r.financial.affordability_class} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Section>
  )
}
