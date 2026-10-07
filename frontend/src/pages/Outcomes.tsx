// "What did you decide?": the honest test of PRISM. Families report what they chose, months later.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, CheckCircle2, Send, Trophy } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { catalog, outcomes } from '@/api/endpoints'
import { useLatestRun } from '@/api/queries'
import type { OutcomeIn, OutcomeOut, OutcomeStatus } from '@/api/types'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, PageSkeleton, Segmented, Select, Skeleton, cx, useToast } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { Stars } from '@/components/system/shared'

const STATUS: { value: OutcomeStatus; label: string; hint: string }[] = [
  { value: 'enrolled', label: 'Joined a course', hint: 'Started college, diploma or training' },
  { value: 'waiting', label: 'Still waiting', hint: 'Waiting for results or admission' },
  { value: 'working', label: 'Started working', hint: 'Took a job or apprenticeship' },
  { value: 'dropped', label: 'Stopped studying', hint: 'Taking a break for now' },
  { value: 'other', label: 'Something else', hint: 'Tell us in the notes' },
]
type YN = 'unknown' | 'yes' | 'no'
const yn = (v: YN) => (v === 'unknown' ? null : v === 'yes')

export default function Outcomes() {
  const latest = useLatestRun()
  const { studentId } = latest
  const list = useQuery({ queryKey: ['outcomes', studentId], enabled: !!studentId, queryFn: () => outcomes.list(studentId!) })

  if (latest.isLoading && !studentId) return <PageSkeleton />
  if (!studentId)
    return (
      <div>
        <PageHeader eyebrow="What I chose" title="What did you decide?" />
        <EmptyState icon={<BookOpenCheck className="h-6 w-6" />} title="Link your family first" action={<Link to="/family" className="inline-flex h-11 items-center rounded-xl bg-primary px-4 font-semibold text-primary-ink">Go to Family</Link>}>
          Once a student is linked to your family you can tell us what they chose.
        </EmptyState>
      </div>
    )

  return (
    <div>
      <PageHeader
        eyebrow="What I chose"
        title="What did you decide?"
        subtitle="Months after the results, tell us what really happened. It is the honest test of PRISM: did the suggestions help real families? Answers are only counted in anonymous totals."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <OutcomeForm studentId={studentId} runId={latest.summary?.run_id} recs={latest.run?.recommendations.map((r) => ({ id: r.career.id, name: r.career.name, rank: r.rank })) ?? []} />
        <div>
          <h2 className="mb-3 text-lg font-semibold">Your answers so far</h2>
          {list.isLoading ? (
            <Skeleton className="h-40" />
          ) : list.error ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} title="Could not load your answers" />
          ) : !list.data?.length ? (
            <EmptyState icon={<Send className="h-6 w-6" />} title="Nothing yet">
              Your first answer will appear here.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {[...list.data].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((o) => (
                  <OutcomeCard key={o.id} o={o} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function OutcomeCard({ o }: { o: OutcomeOut }) {
  const { reducedMotion } = useSettings()
  const careers = useQuery({ queryKey: ['catalog', 'careers', 'all'], queryFn: () => catalog.careers({ page_size: 100 }), staleTime: 10 * 60_000 })
  const career = careers.data?.items.find((c) => c.id === o.chosen_career_id)?.name
  const st = STATUS.find((s) => s.value === o.status)
  return (
    <motion.li layout initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color="rgb(var(--primary))">{st?.label ?? o.status}</Badge>
        <span className="text-xs text-muted">{formatDate(o.created_at)}</span>
      </div>
      {(career || o.chosen_pathway_text) && (
        <div className="mt-2 font-medium">
          {career}
          {career && o.chosen_pathway_text ? ' · ' : ''}
          <span className="text-muted">{o.chosen_pathway_text}</span>
        </div>
      )}
      {o.followed_recommendation_rank != null ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-ok">
          <Trophy className="h-4 w-4" aria-hidden /> This was #{o.followed_recommendation_rank} in your results
        </p>
      ) : o.chosen_career_id ? (
        <p className="mt-2 text-sm text-muted">Not in your PRISM list. That is fine; it helps us learn.</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
        {o.admitted != null && <span>{o.admitted ? 'Got admission' : 'No admission yet'}</span>}
        {o.scholarship_received != null && <span>· {o.scholarship_received ? 'Got a scholarship' : 'No scholarship'}</span>}
        {o.satisfaction != null && <span aria-label={`Happiness ${o.satisfaction} of 5`}>· {'★'.repeat(o.satisfaction)}{'☆'.repeat(5 - o.satisfaction)}</span>}
      </div>
      {o.notes && <p className="mt-2 text-sm">{o.notes}</p>}
    </motion.li>
  )
}

function OutcomeForm({ studentId, runId, recs }: { studentId: string; runId?: string; recs: { id: string; name: string; rank: number }[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { reducedMotion } = useSettings()
  const careers = useQuery({ queryKey: ['catalog', 'careers', 'all'], queryFn: () => catalog.careers({ page_size: 100 }), staleTime: 10 * 60_000 })
  const [status, setStatus] = useState<OutcomeStatus>('enrolled')
  const [career, setCareer] = useState('')
  const [pathway, setPathway] = useState('')
  const [admitted, setAdmitted] = useState<YN>('unknown')
  const [scholarship, setScholarship] = useState<YN>('unknown')
  const [stars, setStars] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [done, setDone] = useState(false)
  const create = useMutation({
    mutationFn: (body: OutcomeIn) => outcomes.create(studentId, body),
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: ['outcomes', studentId] })
      setDone(true)
      setCareer('')
      setPathway('')
      setAdmitted('unknown')
      setScholarship('unknown')
      setStars(null)
      setNotes('')
      toast('ok', o.followed_recommendation_rank ? `Saved. This was #${o.followed_recommendation_rank} in your results.` : 'Saved. Thank you!')
      setTimeout(() => setDone(false), 2600)
    },
  })
  const recIds = new Set(recs.map((r) => r.id))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate({
      status,
      run_id: runId ?? null,
      chosen_career_id: career || null,
      chosen_pathway_text: pathway.trim() || null,
      admitted: yn(admitted),
      scholarship_received: yn(scholarship),
      satisfaction: stars,
      notes: notes.trim() || null,
    })
  }
  const hasAnswer = Boolean(career || pathway.trim() || admitted !== 'unknown' || scholarship !== 'unknown' || stars || notes.trim())
  const ynOpts = [{ value: 'unknown' as YN, label: 'Not sure' }, { value: 'yes' as YN, label: 'Yes' }, { value: 'no' as YN, label: 'No' }]
  return (
    <Card className="relative overflow-hidden">
      <AnimatePresence>
        {done && (
          <motion.div
            className="absolute inset-0 z-10 grid place-items-center bg-surface/90 backdrop-blur-sm"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="status"
          >
            <div className="text-center">
              <motion.div initial={reducedMotion ? false : { scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
                <CheckCircle2 className="mx-auto h-14 w-14 text-ok" aria-hidden />
              </motion.div>
              <p className="mt-3 text-lg font-semibold">Thank you. That really helps.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <form onSubmit={submit} className="space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Where are things now?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {STATUS.map((s) => (
              <label key={s.value} className={cx('flex min-h-[56px] cursor-pointer items-start gap-3 rounded-xl p-3 hairline transition-colors', status === s.value ? 'bg-primary/15 shadow-glow' : 'bg-surface-2 hover:bg-surface')}>
                <input type="radio" name="status" value={s.value} checked={status === s.value} onChange={() => setStatus(s.value)} className="mt-1 accent-[rgb(var(--primary))]" />
                <span>
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-xs text-muted">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Which career?" hint="Your PRISM results are listed first." htmlFor="o-career">
            <Select id="o-career" value={career} onChange={(e) => setCareer(e.target.value)} disabled={careers.isLoading}>
              <option value="">Not decided / not listed</option>
              {recs.length > 0 && (
                <optgroup label="From your results">
                  {recs.map((r) => (
                    <option key={r.id} value={r.id}>
                      #{r.rank} {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All careers">
                {careers.data?.items.filter((c) => !recIds.has(c.id)).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>
          <Field label="Course or route" hint="For example: B.Sc Agriculture at TNAU" htmlFor="o-path">
            <Input id="o-path" value={pathway} onChange={(e) => setPathway(e.target.value)} maxLength={200} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="text-sm font-medium">Got admission?</div>
            <Segmented<YN> label="Got admission?" value={admitted} onChange={setAdmitted} options={ynOpts} />
          </div>
          <div className="space-y-1.5">
            <div className="text-sm font-medium">Got a scholarship?</div>
            <Segmented<YN> label="Got a scholarship?" value={scholarship} onChange={setScholarship} options={ynOpts} />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-sm font-medium">How happy are you with this choice?</div>
          <Stars value={stars} onChange={setStars} />
        </div>
        <Field label="Anything else? (optional)" htmlFor="o-notes">
          <textarea id="o-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} className="w-full rounded-xl bg-surface-2 p-3 text-[15px] hairline focus:outline-none focus:ring-2 focus:ring-primary/60" />
        </Field>
        {create.error && <ErrorState error={create.error} title="Could not save your answer" />}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" magnetic loading={create.isPending} disabled={done || !hasAnswer} icon={<Send className="h-4 w-4" />}>
            {done ? 'Saved' : 'Save my answer'}
          </Button>
          {!hasAnswer && !done && <span className="text-sm text-muted">Pick a career or fill in at least one more answer.</span>}
        </div>
      </form>
    </Card>
  )
}
