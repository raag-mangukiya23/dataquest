// Questionnaire hub: the five instruments with progress, and a calm note on honesty.
import { ArrowRight, BookOpen, Check, Clock, Eye, PenLine, ShieldCheck, Timer } from 'lucide-react'
import { motion } from 'motion/react'
import { Link, useNavigate } from 'react-router-dom'
import { useStudentId } from '@/api/queries'
import { Badge, Button, Card, EmptyState, ErrorState, InfoTip, PageHeader, PageSkeleton, cx } from '@/components/ui'
import { Meter } from '@/components/score'
import { instrumentStatus, readDraft, useInstruments, useTraits, type InstrumentStatus } from '@/components/journey/lib'
import { useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

export default function Questionnaire() {
  const { user } = useSession()
  const { reducedMotion } = useSettings()
  const navigate = useNavigate()
  const isStudent = user?.role === 'student'
  const { studentId, isLoading: sidLoading } = useStudentId()
  const inst = useInstruments()
  const traits = useTraits(studentId, isStudent)

  if (inst.isLoading || sidLoading || (isStudent && traits.isLoading)) return <PageSkeleton />
  if (inst.error) return <ErrorState error={inst.error} onRetry={() => void inst.refetch()} title="We could not load the questionnaire" />
  if (traits.error) return <ErrorState error={traits.error} onRetry={() => void traits.refetch()} title="We could not load your progress" />

  const list = inst.data ?? []
  const completed = traits.data?.instruments_completed ?? []
  const statuses = list.map((i) => instrumentStatus(i.code, completed))
  const doneCount = statuses.filter((s) => s === 'done').length
  const totalMinutes = list.reduce((a, i) => a + i.est_minutes, 0)
  const next = list.find((_, idx) => statuses[idx] !== 'done')

  if (!list.length)
    return (
      <>
        <PageHeader eyebrow="Questionnaire" title="About you" />
        <EmptyState icon={<BookOpen className="h-6 w-6" />} title="No question sets yet" action={<Button variant="secondary" onClick={() => navigate('/home')}>Back to my journey</Button>}>
          The question sets are being prepared. Please check again soon.
        </EmptyState>
      </>
    )

  return (
    <div>
      <PageHeader
        eyebrow="Questionnaire"
        title={isStudent ? 'Tell us about you' : 'Your child’s questionnaire'}
        subtitle={
          isStudent
            ? `Five short sets, about ${totalMinutes} minutes in all. Do them in any order and stop whenever you like; we save as you go.`
            : 'Your child answers these on their own device. You will see the results, not their answers.'
        }
      />

      {!isStudent && (
        <Card className="mb-6 flex gap-3">
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-neon" aria-hidden />
          <div className="text-sm">
            <div className="font-semibold">Why you cannot answer for them</div>
            <p className="mt-1 text-muted">
              PRISM works best when it hears your child’s own voice. Encourage them to answer honestly, then sit together for the family meeting once results are ready.
            </p>
          </div>
        </Card>
      )}

      {isStudent && (
        <Card className="mb-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted">Overall progress</div>
              <div className="num text-2xl font-bold">
                {doneCount} <span className="text-base font-medium text-muted">of {list.length} sets done</span>
              </div>
            </div>
            {next && (
              <Button magnetic onClick={() => navigate(`/questionnaire/${next.code}`)}>
                {statuses[list.indexOf(next)] === 'progress' ? 'Continue' : doneCount ? 'Next set' : 'Start'}: {next.name}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
          <Meter value={list.length ? doneCount / list.length : 0} className="mt-4" label="Questionnaire progress" />
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {list.map((i, idx) => {
          const st = statuses[idx]
          const draft = st === 'progress' ? readDraft(i.code) : null
          const answered = draft ? Object.keys(draft.answers).length : 0
          return (
            <motion.div
              key={i.code}
              initial={reducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: reducedMotion ? 0 : idx * 0.05 }}
            >
              <Card className={cx('flex h-full flex-col p-5', st === 'done' && 'border-ok/30')}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold leading-snug">{i.name}</h2>
                  <StatusBadge st={st} queued={!!draft?.queued} />
                </div>
                <p className="mt-1 text-sm text-muted">{i.description}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1"><PenLine className="h-3.5 w-3.5" aria-hidden /> <span className="num">{i.question_count}</span> questions</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> about <span className="num">{i.est_minutes}</span> min</span>
                  {i.time_limit_sec ? (
                    <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" aria-hidden /> timed, <span className="num">{Math.round(i.time_limit_sec / 60)}</span> min</span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    Based on <InfoTip text={i.framework} />
                  </span>
                </div>
                {st === 'progress' && i.question_count > 0 && (
                  <div className="mt-3">
                    <Meter value={Math.min(1, answered / i.question_count)} label={`${i.name} progress`} />
                    <div className="mt-1 text-xs text-muted num">{answered} of {i.question_count} answered</div>
                  </div>
                )}
                <div className="mt-auto pt-4">
                  {isStudent ? (
                    <Link
                      to={`/questionnaire/${i.code}`}
                      className={cx(
                        'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto',
                        st === 'done' ? 'bg-surface-2 hairline' : 'bg-primary text-primary-ink',
                      )}
                    >
                      {st === 'done' ? 'Answer again' : st === 'progress' ? 'Continue' : 'Start'}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  ) : (
                    <span className="text-xs text-muted">Answered by your child</span>
                  )}
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <Card className="mt-6 flex gap-3 bg-surface-2/50">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden />
        <div className="text-sm">
          <div className="font-semibold">There are no right or wrong answers</div>
          <p className="mt-1 text-muted">
            Answer the way you really are, not the way you think you should be. We quietly check for rushed or same-every-time answers so the results stay fair, and we never show anyone which question measures what.
          </p>
        </div>
      </Card>
    </div>
  )
}

function StatusBadge({ st, queued }: { st: InstrumentStatus; queued: boolean }) {
  if (st === 'done')
    return (
      <Badge color="rgb(var(--ok))">
        <Check className="h-3 w-3" aria-hidden /> Done
      </Badge>
    )
  if (queued) return <Badge color="rgb(var(--warn))">Waiting to upload</Badge>
  if (st === 'progress') return <Badge color="rgb(var(--primary))">In progress</Badge>
  return <Badge color="rgb(var(--muted))">Not started</Badge>
}
