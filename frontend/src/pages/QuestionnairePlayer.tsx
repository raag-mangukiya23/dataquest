// One question per card. Keyboard (1-5 / A-D), swipe on phones, autosave on this device, offline queue.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import confetti from 'canvas-confetti'
import { ArrowLeft, ArrowRight, Check, CloudOff, Home as HomeIcon, ListChecks, Sparkles, Timer, X } from 'lucide-react'
import { AnimatePresence, motion, type PanInfo } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { assessments } from '@/api/endpoints'
import { useStudentId } from '@/api/queries'
import type { Question, SubmitResult } from '@/api/types'
import { Button, Card, EmptyState, ErrorState, Skeleton, cx, useToast } from '@/components/ui'
import {
  SPECTRUM,
  clearDraft,
  flagText,
  journeyKeys,
  newId,
  readDraft,
  tokenHex,
  useInstruments,
  useTraits,
  writeDraft,
  type Draft,
} from '@/components/journey/lib'
import { Constellation } from '@/components/journey/visuals'
import { useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

type Phase = 'play' | 'review' | 'queued' | 'done'

export default function QuestionnairePlayer() {
  const { code = '' } = useParams()
  const { user } = useSession()
  const navigate = useNavigate()
  const inst = useInstruments()
  const qs = useQuery({ queryKey: journeyKeys.questions(code), queryFn: () => assessments.questions(code), enabled: !!code, staleTime: 30 * 60_000 })

  if (user && user.role !== 'student')
    return (
      <EmptyState
        icon={<ListChecks className="h-6 w-6" />}
        title="Only the student answers"
        action={<Button variant="secondary" onClick={() => navigate('/questionnaire')}>Back to the questionnaire</Button>}
      >
        These questions are for your child to answer in their own words. You will see their results, not their answers.
      </EmptyState>
    )
  if (inst.isLoading || qs.isLoading) return <PlayerSkeleton />
  if (qs.error || inst.error)
    return <ErrorState error={qs.error ?? inst.error} onRetry={() => { void qs.refetch(); void inst.refetch() }} title="We could not load these questions" />
  const meta = inst.data?.find((i) => i.code === code)
  const questions = [...(qs.data ?? [])].sort((a, b) => a.order - b.order)
  if (!meta || !questions.length)
    return (
      <EmptyState
        icon={<ListChecks className="h-6 w-6" />}
        title="This question set was not found"
        action={<Button onClick={() => navigate('/questionnaire')}>See all question sets</Button>}
      >
        It may have been renamed. Pick one from the list.
      </EmptyState>
    )
  return <Player key={code} code={code} name={meta.name} timeLimit={meta.time_limit_sec ?? null} questions={questions} />
}

function PlayerSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4" aria-busy="true" aria-label="Loading questions">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

function emptyDraft(): Draft {
  return { answers: {}, index: 0, client_submission_id: newId(), elapsed: 0, updated: Date.now() }
}

function Player({ code, name, timeLimit, questions }: { code: string; name: string; timeLimit: number | null; questions: Question[] }) {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { reducedMotion } = useSettings()
  const { studentId } = useStudentId()
  const inst = useInstruments()
  const traits = useTraits(studentId)

  const [draft, setDraft] = useState<Draft>(() => {
    const d = readDraft(code)
    if (!d) return emptyDraft()
    // keep only answers to questions that still exist
    const ids = new Set(questions.map((q) => q.id))
    const answers = Object.fromEntries(Object.entries(d.answers).filter(([k]) => ids.has(k)))
    return { ...d, answers, index: Math.min(d.index, questions.length - 1) }
  })
  const [phase, setPhase] = useState<Phase>(() => (readDraft(code)?.queued ? 'queued' : 'play'))
  const [dir, setDir] = useState(1)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [resumed] = useState(() => !!readDraft(code) && Object.keys(readDraft(code)!.answers).length > 0)
  const shownAt = useRef(performance.now())
  const advanceTimer = useRef<number>()

  const total = questions.length
  const answeredCount = Object.keys(draft.answers).length
  const q = questions[draft.index]
  const remaining = timeLimit ? Math.max(0, timeLimit - draft.elapsed) : null

  // persist every change
  useEffect(() => {
    if (phase !== 'done') writeDraft(code, draft)
  }, [code, draft, phase])

  useEffect(() => {
    shownAt.current = performance.now()
  }, [draft.index, phase])

  // quiet countdown for timed sections
  useEffect(() => {
    if (!timeLimit || phase !== 'play') return
    const t = window.setInterval(() => setDraft((d) => ({ ...d, elapsed: d.elapsed + 1 })), 1000)
    return () => window.clearInterval(t)
  }, [timeLimit, phase])
  useEffect(() => {
    if (remaining === 0 && phase === 'play') setPhase('review')
  }, [remaining, phase])

  const go = useCallback(
    (delta: number) => {
      window.clearTimeout(advanceTimer.current)
      setDir(delta)
      setDraft((d) => {
        const next = d.index + delta
        if (next < 0) return d
        if (next >= total) {
          setPhase('review')
          return d
        }
        return { ...d, index: next }
      })
    },
    [total],
  )

  const answer = useCallback(
    (value: string) => {
      if (!q) return
      const ms = Math.round(performance.now() - shownAt.current)
      setDraft((d) => {
        // after a review, a changed answer means a new submission; an unchanged one keeps the id (idempotent)
        const changed = d.reviewing && d.answers[q.id]?.value !== value
        return { ...d, answers: { ...d.answers, [q.id]: { value, response_ms: ms } }, ...(changed ? { client_submission_id: newId(), reviewing: false } : {}) }
      })
      window.clearTimeout(advanceTimer.current)
      advanceTimer.current = window.setTimeout(() => go(1), reducedMotion ? 120 : 260)
    },
    [q, go, reducedMotion],
  )
  useEffect(() => () => window.clearTimeout(advanceTimer.current), [])

  // ---------------------------------------------------------------- submit (+ offline queue)
  const submit = useMutation({
    mutationFn: (d: Draft) =>
      assessments.submit(code, {
        client_submission_id: d.client_submission_id,
        answers: questions
          .filter((x) => d.answers[x.id])
          .map((x) => ({ question_id: x.id, value: d.answers[x.id].value, response_ms: d.answers[x.id].response_ms })),
      }),
    onSuccess: (res) => {
      clearDraft(code)
      setResult(res)
      setPhase('done')
      void qc.invalidateQueries({ queryKey: ['traits'] })
      void qc.invalidateQueries({ queryKey: ['runs'] })
      if (!reducedMotion) {
        const colors = SPECTRUM.map(tokenHex)
        void confetti({ particleCount: 90, spread: 70, startVelocity: 38, ticks: 140, origin: { y: 0.55 }, colors, disableForReducedMotion: true })
      }
    },
    onError: (e, d) => {
      if (e instanceof ApiError && e.code === 'CONSENT_REQUIRED') {
        toast('info', 'A parent needs to approve first. Your answers are saved on this device.')
        navigate('/consent', { state: { reason: 'questionnaire', from: `/questionnaire/${code}` } })
        return
      }
      if (!navigator.onLine || (e instanceof ApiError && e.status === 0)) {
        setDraft({ ...d, queued: true })
        setPhase('queued')
        return
      }
    },
  })
  const doSubmit = useCallback(() => submit.mutate(draft), [submit, draft])

  // retry queued uploads when the connection returns
  useEffect(() => {
    if (phase !== 'queued') return
    const retry = () => submit.mutate(draft)
    window.addEventListener('online', retry)
    if (navigator.onLine && !submit.isPending) retry()
    return () => window.removeEventListener('online', retry)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    if (phase !== 'play' || !q) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const k = e.key.toUpperCase()
      let idx = -1
      if (/^[1-9]$/.test(k)) idx = Number(k) - 1
      else if (/^[A-H]$/.test(k) && q.type === 'mcq') idx = k.charCodeAt(0) - 65
      if (idx >= 0 && idx < q.options.length) {
        e.preventDefault()
        answer(q.options[idx].key)
      } else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, q, answer, go])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -80 || info.velocity.x < -500) go(1)
    else if (info.offset.x > 80 || info.velocity.x > 500) go(-1)
  }

  const nextInstrument = useMemo(() => {
    const done = new Set([...(traits.data?.instruments_completed ?? []), code])
    return inst.data?.find((i) => !done.has(i.code))
  }, [inst.data, traits.data, code])

  const saveAndExit = () => {
    writeDraft(code, draft)
    toast('ok', 'Saved on this device. Pick up where you left off any time.')
    navigate('/questionnaire')
  }

  const unanswered = questions.map((x, i) => ({ x, i })).filter(({ x }) => !draft.answers[x.id])

  return (
    <div className="mx-auto max-w-2xl pb-10">
      {/* top bar */}
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/questionnaire"
          onClick={(e) => {
            e.preventDefault()
            if (phase === 'done') navigate('/questionnaire')
            else saveAndExit()
          }}
          aria-label="Save and exit"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hairline hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-5 w-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="num text-xs text-muted">
            {phase === 'play' ? `Question ${draft.index + 1} of ${total}` : `${answeredCount} of ${total} answered`}
          </div>
        </div>
        {remaining !== null && phase === 'play' && (
          <div className="num inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm text-muted hairline" aria-label={`Time left ${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds`}>
            <Timer className="h-3.5 w-3.5" aria-hidden />
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </div>
        )}
        <div className="shrink-0" title={`${answeredCount} stars`}>
          <Constellation total={total} filled={answeredCount} lit={phase === 'done'} size={52} />
        </div>
      </div>

      {/* thin progress */}
      <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answeredCount} aria-label="Answered">
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, rgb(var(--fit)), rgb(var(--market)), rgb(var(--afford)), rgb(var(--roi)), rgb(var(--family)), rgb(var(--disrupt)))' }}
          animate={{ width: `${(answeredCount / total) * 100}%` }}
          transition={{ duration: reducedMotion ? 0 : 0.3 }}
        />
      </div>

      {resumed && phase === 'play' && draft.index > 0 && answeredCount > 0 && (
        <p className="mb-3 text-center text-xs text-muted">Welcome back. We kept your answers.</p>
      )}

      {phase === 'play' && q && (
        <>
          <div className="relative">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={q.id}
                custom={dir}
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: dir * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: dir * -40 }}
                transition={{ duration: 0.2 }}
                drag={reducedMotion ? false : 'x'}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.25}
                onDragEnd={onDragEnd}
                className="card touch-pan-y p-5 md:p-8"
              >
                <h1 className="text-xl font-semibold leading-snug md:text-2xl">{q.prompt}</h1>
                <div className={cx('mt-6 grid gap-2.5', q.type === 'mcq' && q.options.length === 4 && 'sm:grid-cols-2')} role="radiogroup" aria-label="Your answer">
                  {q.options.map((o, i) => {
                    const sel = draft.answers[q.id]?.value === o.key
                    const hint = q.type === 'mcq' ? String.fromCharCode(65 + i) : String(i + 1)
                    return (
                      <button
                        key={o.key}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        onClick={() => answer(o.key)}
                        className={cx(
                          'flex min-h-[52px] w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          sel ? 'bg-primary/20 text-ink ring-1 ring-primary' : 'bg-surface-2 hairline hover:bg-surface',
                        )}
                      >
                        <span className={cx('num grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-semibold', sel ? 'bg-primary text-primary-ink' : 'bg-surface text-muted hairline')}>
                          {sel ? <Check className="h-4 w-4" aria-hidden /> : hint}
                        </span>
                        <span className="flex-1">{o.label}</span>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => go(-1)} disabled={draft.index === 0} icon={<ArrowLeft className="h-4 w-4" />}>
              Back
            </Button>
            <button type="button" onClick={saveAndExit} className="min-h-[44px] px-2 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
              Save and exit
            </button>
            <Button variant={draft.index === total - 1 ? 'primary' : 'secondary'} onClick={() => go(1)}>
              {draft.index === total - 1 ? 'Finish' : draft.answers[q.id] ? 'Next' : 'Skip'}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <p className="mt-4 hidden text-center text-xs text-muted md:block">
            Tip: press {q.type === 'mcq' ? 'A to ' + String.fromCharCode(64 + q.options.length) : `1 to ${q.options.length}`} to answer, arrow keys to move.
          </p>
          <p className="mt-4 text-center text-xs text-muted md:hidden">Swipe the card to move between questions.</p>
        </>
      )}

      {phase === 'review' && (
        <Card className="p-5 md:p-8">
          <h1 className="text-2xl font-semibold">{remaining === 0 ? 'Time is up. Nicely done.' : 'Ready to send?'}</h1>
          <p className="mt-2 text-muted">
            You answered <span className="num font-semibold text-ink">{answeredCount}</span> of <span className="num">{total}</span> questions.
            {unanswered.length > 0 && remaining !== 0 && ' You can go back to the ones you skipped, or send what you have.'}
          </p>
          {unanswered.length > 0 && remaining !== 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {unanswered.slice(0, 12).map(({ i }) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setDraft((d) => ({ ...d, index: i }))
                    setPhase('play')
                  }}
                  className="num h-11 min-w-[44px] rounded-xl bg-surface-2 px-3 text-sm hairline hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Go to question ${i + 1}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
          {submit.error && !(submit.error instanceof ApiError && (submit.error.status === 0 || submit.error.code === 'CONSENT_REQUIRED')) && (
            <div className="mt-4">
              <ErrorState error={submit.error} title="Your answers were not sent" />
            </div>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {remaining !== 0 ? (
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setPhase('play')}>
                Back to questions
              </Button>
            ) : (
              <span />
            )}
            <Button size="lg" magnetic loading={submit.isPending} disabled={answeredCount === 0} onClick={doSubmit}>
              Send my answers
            </Button>
          </div>
        </Card>
      )}

      {phase === 'queued' && (
        <Card className="flex flex-col items-center p-8 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-warn/15 text-warn">
            <CloudOff className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Saved on this device</h1>
          <p className="mt-2 max-w-sm text-sm text-muted">We will upload your answers when you are back online. You can close this page; nothing is lost.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" loading={submit.isPending} onClick={doSubmit}>
              Try now
            </Button>
            <Button variant="ghost" onClick={() => navigate('/questionnaire')}>
              Back to the list
            </Button>
          </div>
        </Card>
      )}

      {phase === 'done' && result && (
        <motion.div initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}>
          <Card className="relative overflow-hidden p-6 text-center md:p-10">
            <div className="mx-auto w-fit">
              <Constellation total={total} filled={total} lit size={120} />
            </div>
            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-neon">Set complete</div>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">{name}: done</h1>
            <p className="mt-2 text-muted">
              <span className="num font-semibold text-ink">{result.answered}</span> of <span className="num">{result.total_items}</span> questions answered. Thank you for being honest.
            </p>
            {(result.flags ?? []).length > 0 && (
              <div className="mx-auto mt-5 max-w-md space-y-2 text-left">
                {(result.flags ?? []).map((f) => (
                  <div key={f} className="flex gap-2 rounded-xl bg-surface-2 p-3 text-sm hairline">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-family" aria-hidden />
                    <span>{flagText(f)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              {(result.flags ?? []).length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraft((d) => ({ ...d, index: 0, queued: false, reviewing: true }))
                    setResult(null)
                    setPhase('play')
                  }}
                >
                  Review answers
                </Button>
              )}
              {nextInstrument ? (
                <Button magnetic onClick={() => navigate(`/questionnaire/${nextInstrument.code}`)}>
                  Next: {nextInstrument.name}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button magnetic icon={<HomeIcon className="h-4 w-4" />} onClick={() => navigate('/home')}>
                  All sets done: continue
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate('/questionnaire')}>
                Back to the list
              </Button>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
