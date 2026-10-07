import { ArrowLeft, ArrowRight, Check, Clock, HeartHandshake, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFamily, useLatestRun } from '@/api/queries'
import { dimensionLabel, readMeeting, useConflict, writeMeeting, type MeetingAnswer } from '@/components/family/shared'
import { Meter } from '@/components/score'
import { Button, EmptyState, ErrorState, PageSkeleton, cx } from '@/components/ui'
import { pct } from '@/lib/format'
import { useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

type Step =
  | { kind: 'intro'; key: 'intro' }
  | { kind: 'driver'; key: string; title: string; explanation: string; prompt: string }
  | { kind: 'bridge'; key: string; name: string; why: string; fit: number; accept: number; careerId: string }
  | { kind: 'summary'; key: 'summary' }

export default function FamilyMeeting() {
  const { user } = useSession()
  const fam = useFamily()
  const latest = useLatestRun()
  const runId = latest.summary?.run_id
  const conflict = useConflict(runId)
  const navigate = useNavigate()

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto max-w-2xl py-6">
      <Link to="/family" className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to family
      </Link>
      {children}
    </div>
  )

  if (fam.isLoading || latest.isLoading || conflict.isLoading) return <PageSkeleton />
  if (fam.isError) return shell(<ErrorState error={fam.error} onRetry={() => void fam.refetch()} />)
  if (latest.error) return shell(<ErrorState error={latest.error} onRetry={latest.refetch} />)
  if (!fam.data)
    return shell(
      <EmptyState icon={<HeartHandshake className="h-6 w-6" />} title="Link your family first" action={<Button onClick={() => navigate('/family')}>Set up family</Button>}>
        A family meeting uses both your hopes and your parents&apos; hopes.
      </EmptyState>,
    )
  if (!runId)
    return shell(
      <EmptyState icon={<Sparkles className="h-6 w-6" />} title="No results to talk about yet" action={user?.role === 'student' ? <Button onClick={() => navigate('/questionnaire')}>Answer the questions</Button> : undefined}>
        The meeting walks through your results once the questionnaire is done.
      </EmptyState>,
    )
  if (conflict.isError) return shell(<ErrorState error={conflict.error} onRetry={() => void conflict.refetch()} title="Could not load the conversation" />)
  if (!conflict.data) return null
  return <Meeting runId={runId} c={conflict.data} />
}

function Meeting({ runId, c }: { runId: string; c: NonNullable<ReturnType<typeof useConflict>['data']> }) {
  const { reducedMotion } = useSettings()
  const navigate = useNavigate()
  const steps: Step[] = useMemo(
    () => [
      { kind: 'intro', key: 'intro' },
      ...c.top_drivers.map((d, i) => ({ kind: 'driver' as const, key: `d:${d.dimension}:${i}`, title: dimensionLabel(d.dimension), explanation: d.explanation, prompt: d.conversation_prompt })),
      ...c.bridge_careers.map((b) => ({ kind: 'bridge' as const, key: `b:${b.career.id}`, name: b.career.name, why: b.why, fit: b.student_fit, accept: b.parent_acceptance, careerId: b.career.id })),
      { kind: 'summary', key: 'summary' },
    ],
    [c],
  )
  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)
  const [answers, setAnswers] = useState<Record<string, MeetingAnswer>>(() => readMeeting(runId))
  const step = steps[i]

  const go = useCallback(
    (n: number) => {
      const next = Math.max(0, Math.min(steps.length - 1, n))
      setDir(next >= i ? 1 : -1)
      setI(next)
    },
    [i, steps.length],
  )
  const answer = (v: MeetingAnswer) => {
    const nextA = { ...answers, [step.key]: v }
    setAnswers(nextA)
    writeMeeting(runId, nextA)
    go(i + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') go(i + 1)
      else if (e.key === 'ArrowLeft') go(i - 1)
      else if (e.key === 'Escape') navigate('/family')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, i, navigate])

  const answerable = steps.filter((s) => s.kind === 'driver' || s.kind === 'bridge')
  const agreed = answerable.filter((s) => answers[s.key] === 'agree')
  const later = answerable.filter((s) => answers[s.key] === 'later')
  const offset = reducedMotion ? 0 : 40

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg text-ink" role="dialog" aria-modal="true" aria-label="Family meeting">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'radial-gradient(60% 50% at 20% 10%, rgb(var(--fit) / .14), transparent), radial-gradient(60% 50% at 80% 90%, rgb(var(--family) / .14), transparent)' }} />
      <header className="relative flex items-center justify-between gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] sm:px-8">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neon">Family meeting</div>
        <button type="button" onClick={() => navigate('/family')} aria-label="Close the meeting" className="grid h-11 w-11 place-items-center rounded-xl text-muted hairline hover:text-ink">
          <X className="h-5 w-5" />
        </button>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-y-auto px-5 py-6 sm:px-8">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section
            key={step.key}
            initial={{ opacity: 0, x: dir * offset }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -dir * offset }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-2xl"
            aria-live="polite"
          >
            {step.kind === 'intro' && (
              <div className="text-center">
                <HeartHandshake className="mx-auto h-14 w-14 text-family" aria-hidden />
                <h1 className="mt-5 text-3xl font-bold leading-tight sm:text-5xl">Let&apos;s talk, together</h1>
                <p className="mx-auto mt-4 max-w-lg text-lg text-muted sm:text-xl">
                  Sit side by side. Read each card aloud. Take turns to answer. Tap <b className="text-ink">We agree</b> or <b className="text-ink">Discuss later</b>. There are no wrong answers.
                </p>
                <p className="mt-3 text-base text-muted">
                  {c.top_drivers.length} {c.top_drivers.length === 1 ? 'topic' : 'topics'} · {c.bridge_careers.length} bridge {c.bridge_careers.length === 1 ? 'career' : 'careers'}
                </p>
                <Button size="lg" className="mt-8 min-w-[200px]" onClick={() => go(1)} icon={<ArrowRight className="h-5 w-5" />}>
                  Begin
                </Button>
              </div>
            )}

            {step.kind === 'driver' && (
              <div>
                <div className="text-sm font-semibold uppercase tracking-wider text-family">{step.title}</div>
                <p className="mt-3 text-lg text-muted sm:text-xl">{step.explanation}</p>
                <p className="mt-6 text-2xl font-semibold leading-snug sm:text-4xl">&ldquo;{step.prompt}&rdquo;</p>
                <AnswerButtons current={answers[step.key]} onAnswer={answer} />
              </div>
            )}

            {step.kind === 'bridge' && (
              <div>
                <div className="text-sm font-semibold uppercase tracking-wider text-neon">✦ A career you might both like</div>
                <h2 className="mt-3 text-3xl font-bold sm:text-5xl">{step.name}</h2>
                <p className="mt-3 text-lg text-muted">{step.why}</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-1.5 flex justify-between text-base">
                      <span>Fits the student</span>
                      <span className="num font-semibold">{pct(step.fit)}</span>
                    </div>
                    <Meter value={step.fit} color="rgb(var(--fit))" label="Fits the student" />
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-base">
                      <span>Parents&apos; hopes</span>
                      <span className="num font-semibold">{pct(step.accept)}</span>
                    </div>
                    <Meter value={step.accept} color="rgb(var(--family))" label="Parents' hopes" />
                  </div>
                </div>
                <p className="mt-6 text-xl font-medium sm:text-2xl">Is this worth exploring together?</p>
                <AnswerButtons current={answers[step.key]} onAnswer={answer} />
              </div>
            )}

            {step.kind === 'summary' && (
              <div>
                <h2 className="text-center text-3xl font-bold sm:text-4xl">What you decided</h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <SummaryList title="We agree" tone="ok" items={agreed} icon={<Check className="h-5 w-5" />} />
                  <SummaryList title="Discuss later" tone="warn" items={later} icon={<Clock className="h-5 w-5" />} />
                </div>
                {answerable.length > agreed.length + later.length && (
                  <p className="mt-3 text-center text-sm text-muted">{answerable.length - agreed.length - later.length} skipped. Use the dots to go back.</p>
                )}
                <div className="mt-8 text-center">
                  <Button size="lg" className="min-w-[200px]" onClick={() => navigate('/family')}>
                    Done
                  </Button>
                </div>
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      <footer className="relative flex items-center justify-between gap-2 px-3 pb-[max(14px,env(safe-area-inset-bottom))] sm:px-8">
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous" className="grid h-12 w-12 place-items-center rounded-xl hairline disabled:opacity-30">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <nav aria-label="Meeting steps" className="flex min-w-0 flex-wrap items-center justify-center">
          {steps.map((s, n) => {
            const a = answers[s.key]
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => go(n)}
                aria-label={`Step ${n + 1} of ${steps.length}${a ? (a === 'agree' ? ', agreed' : ', discuss later') : ''}`}
                aria-current={n === i ? 'step' : undefined}
                className="grid h-8 w-6 place-items-center sm:h-11 sm:w-7"
              >
                <span
                  className={cx('block rounded-full transition-all', n === i ? 'h-2.5 w-6 bg-ink' : 'h-2.5 w-2.5', n !== i && (a === 'agree' ? 'bg-ok' : a === 'later' ? 'bg-warn' : 'bg-muted/40'))}
                />
              </button>
            )
          })}
        </nav>
        <button type="button" onClick={() => go(i + 1)} disabled={i === steps.length - 1} aria-label="Next" className="grid h-12 w-12 place-items-center rounded-xl hairline disabled:opacity-30">
          <ArrowRight className="h-5 w-5" />
        </button>
      </footer>
    </div>
  )
}

function AnswerButtons({ current, onAnswer }: { current?: MeetingAnswer; onAnswer: (v: MeetingAnswer) => void }) {
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onAnswer('agree')}
        aria-pressed={current === 'agree'}
        className={cx('flex min-h-[64px] items-center justify-center gap-2 rounded-2xl text-lg font-semibold transition-colors hairline', current === 'agree' ? 'bg-ok text-white' : 'bg-ok/10 text-ok hover:bg-ok/20')}
      >
        <Check className="h-6 w-6" aria-hidden /> We agree
      </button>
      <button
        type="button"
        onClick={() => onAnswer('later')}
        aria-pressed={current === 'later'}
        className={cx('flex min-h-[64px] items-center justify-center gap-2 rounded-2xl text-lg font-semibold transition-colors hairline', current === 'later' ? 'bg-warn text-black' : 'bg-warn/10 text-warn hover:bg-warn/20')}
      >
        <Clock className="h-6 w-6" aria-hidden /> Discuss later
      </button>
    </div>
  )
}

function SummaryList({ title, tone, items, icon }: { title: string; tone: 'ok' | 'warn'; items: Step[]; icon: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className={cx('flex items-center gap-2 font-semibold', tone === 'ok' ? 'text-ok' : 'text-warn')}>
        {icon} {title} <span className="num text-muted">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing here.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((s) => (
            <li key={s.key} className="text-[15px]">
              {s.kind === 'driver' ? s.title : s.kind === 'bridge' ? `✦ ${s.name}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
