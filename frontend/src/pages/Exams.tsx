import { useMutation, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ExternalLink, NotebookPen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { catalog, deadlines } from '@/api/endpoints'
import { openBlob } from '@/api/client'
import type { DateStatus, Exam } from '@/api/types'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, Switch, cx, useToast } from '@/components/ui'
import { DateStatusTag, ProvenanceBadge } from '@/components/score'
import { daysUntil, formatDate, titleCase } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { useSession } from '@/state/session'
import { exploreKeys, useAllCareers, useRecommendations, useServerToday } from '@/components/explore/shared'

type Kind = 'reg' | 'exam'
interface Ev {
  date: string
  kind: Kind
  exam: Exam
  status: DateStatus
  label: string
}
const KIND: Record<Kind, { label: string; color: string }> = {
  reg: { label: 'Registration closes', color: 'rgb(var(--warn))' },
  exam: { label: 'Exam day', color: 'rgb(var(--neon))' },
}
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const monthKey = (iso: string) => iso.slice(0, 7)
const monthName = (ym: string) => new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(`${ym}-01T00:00:00`))
const shiftMonth = (ym: string, d: number) => {
  const [y, m] = ym.split('-').map(Number)
  const t = new Date(y, m - 1 + d, 1)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

function eventsOf(exams: Exam[]): Ev[] {
  const out: Ev[] = []
  for (const e of exams) {
    for (const s of e.sessions ?? []) {
      const sess = (e.sessions?.length ?? 0) > 1 ? ` (session ${s.session_no})` : ''
      if (s.registration_close) out.push({ date: s.registration_close, kind: 'reg', exam: e, status: s.registration_status, label: `Registration closes${sess}` })
      if (s.exam_start)
        out.push({ date: s.exam_start, kind: 'exam', exam: e, status: s.exam_date_status, label: `Exam${sess}${s.exam_end && s.exam_end !== s.exam_start ? `: ${formatDate(s.exam_start)} – ${formatDate(s.exam_end)}` : ''}` })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind.localeCompare(b.kind)))
}

export default function Exams() {
  const { user } = useSession()
  const toast = useToast()
  const [view, setView] = useState<'month' | 'list'>('month')
  const [upcomingOnly, setUpcomingOnly] = useState(true)
  const [mine, setMine] = useState(false)
  // "today" comes from the backend (DEMO_TODAY aware) so the calendar agrees with the status tags
  const server = useServerToday()
  const today = server.iso
  const [monthSel, setMonth] = useState<string | null>(null)
  const [daySel, setDay] = useState<string | null>(null)
  const month = monthSel ?? monthKey(today)
  const day = daySel ?? today

  const exams = useQuery({ queryKey: ['exams', upcomingOnly], queryFn: () => catalog.exams({ upcoming_only: upcomingOnly || undefined }) })
  const careers = useAllCareers()
  const { recs, studentId, summary } = useRecommendations()
  const hasRun = recs.length > 0
  const pathways = useQuery({ queryKey: exploreKeys.pathwaysAll, enabled: hasRun, queryFn: () => catalog.pathways({ page_size: 100 }), staleTime: 10 * 60_000 })

  const careerName = useMemo(() => new Map((careers.data?.items ?? []).map((c) => [c.id, c.name])), [careers.data])
  const myCodes = useMemo(() => {
    const ids = new Set(recs.map((r) => r.career.id))
    const codes = new Set<string>()
    for (const p of pathways.data?.items ?? []) if (p.career_ids.some((id) => ids.has(id))) p.entrance_exam_codes.forEach((c) => codes.add(c))
    for (const e of exams.data ?? []) if ((e.career_ids ?? []).some((id) => ids.has(id))) codes.add(e.code)
    return codes
  }, [recs, pathways.data, exams.data])

  const shown = useMemo(() => (exams.data ?? []).filter((e) => !mine || myCodes.has(e.code)), [exams.data, mine, myCodes])
  const events = useMemo(() => eventsOf(shown), [shown])

  const ics = useMutation({
    mutationFn: () => deadlines.ics(studentId!),
    onSuccess: (blob) => {
      openBlob(blob, 'prism-deadlines.ics')
      toast('ok', 'Calendar file downloaded. Open it to add your dates.')
    },
    onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not create the calendar file.'),
  })
  const canIcs = !!studentId && !!summary && (user?.role === 'student' || user?.role === 'parent')

  return (
    <div>
      <PageHeader
        eyebrow="Plan ahead"
        title="Exam calendar"
        subtitle="Entrance exams and when to register. Dates marked Estimated are projected from earlier years; always confirm on the official website."
        actions={
          canIcs ? (
            <Button magnetic icon={<CalendarPlus className="h-4 w-4" />} loading={ics.isPending} onClick={() => ics.mutate()}>
              Add my deadlines to calendar
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          label="Calendar view"
          value={view}
          onChange={setView}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'list', label: 'List' },
          ]}
        />
        <div className="flex flex-col gap-0 sm:flex-row sm:gap-6">
          <Switch checked={upcomingOnly} onChange={setUpcomingOnly} label="Upcoming only" />
          {hasRun && <Switch checked={mine} onChange={setMine} label="Only exams for my careers" />}
        </div>
      </div>

      {exams.isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" aria-busy="true" aria-label="Loading exams">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      )}
      {exams.isError && <ErrorState error={exams.error} onRetry={() => void exams.refetch()} title="We could not load the exam calendar" />}
      {exams.data && shown.length === 0 && (
        <EmptyState icon={<NotebookPen className="h-6 w-6" />} title={mine ? 'No exams linked to your careers' : 'No exams to show'}>
          {mine ? 'Turn off "Only exams for my careers" to see every exam.' : 'Turn off "Upcoming only" to see past exam dates.'}
        </EmptyState>
      )}

      {exams.data && shown.length > 0 && view === 'month' && (
        <MonthView events={events} month={month} setMonth={setMonth} day={day} setDay={setDay} today={today} careerName={careerName} />
      )}
      {exams.data && shown.length > 0 && view === 'list' && <ListView events={events} careerName={careerName} today={today} />}
    </div>
  )
}

function MonthView({
  events,
  month,
  setMonth,
  day,
  setDay,
  today,
  careerName,
}: {
  events: Ev[]
  month: string
  setMonth: (m: string) => void
  day: string | null
  setDay: (d: string) => void
  today: string
  careerName: Map<string, string>
}) {
  const { reducedMotion } = useSettings()
  const [dir, setDir] = useState(0)
  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>()
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e])
    return m
  }, [events])
  const [y, mo] = month.split('-').map(Number)
  const first = new Date(y, mo - 1, 1)
  const lead = (first.getDay() + 6) % 7
  const daysIn = new Date(y, mo, 0).getDate()
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
  while (cells.length % 7) cells.push(null)
  const monthCount = events.filter((e) => monthKey(e.date) === month).length
  const nextWith = events.find((e) => monthKey(e.date) > month)
  const go = (d: number) => {
    setDir(d)
    setMonth(shiftMonth(month, d))
  }
  const selected = day ? byDay.get(day) ?? [] : []
  const upcoming = useMemo(() => events.filter((e) => e.date >= (day ?? today)).slice(0, 3), [events, day, today])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card className="p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="md" aria-label="Previous month" onClick={() => go(-1)} icon={<ChevronLeft className="h-5 w-5" />} />
          <div className="text-center">
            <h2 className="text-lg font-semibold">{monthName(month)}</h2>
            <p className="text-xs text-muted">
              <span className="num">{monthCount}</span> {monthCount === 1 ? 'date' : 'dates'} this month
            </p>
          </div>
          <Button variant="ghost" size="md" aria-label="Next month" onClick={() => go(1)} icon={<ChevronRight className="h-5 w-5" />} />
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wider text-muted">
          {WEEK.map((w) => (
            <div key={w} className="py-1">
              <span className="sm:hidden">{w[0]}</span>
              <span className="hidden sm:inline">{w}</span>
            </div>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={month}
            className="grid grid-cols-7 gap-1"
            initial={reducedMotion ? false : { opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.2 }}
          >
            {cells.map((d, i) => {
              if (!d) return <div key={i} />
              const evs = byDay.get(d) ?? []
              const isSel = d === day
              const kinds = [...new Set(evs.map((e) => e.kind))]
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  aria-pressed={isSel}
                  aria-label={`${formatDate(d)}${evs.length ? `, ${evs.length} ${evs.length === 1 ? 'date' : 'dates'}` : ''}`}
                  className={cx(
                    'relative flex aspect-square min-h-[44px] flex-col items-center justify-center rounded-xl text-sm transition-colors',
                    isSel ? 'bg-primary/20 text-ink ring-2 ring-primary' : evs.length ? 'bg-surface-2 hover:bg-surface-2/70' : 'text-muted hover:bg-surface-2/60',
                    d === today && !isSel && 'ring-1 ring-neon',
                  )}
                >
                  <span className={cx('num', evs.length && 'font-semibold text-ink')}>{Number(d.slice(8))}</span>
                  {kinds.length > 0 && (
                    <span className="mt-1 flex gap-1" aria-hidden>
                      {kinds.map((k) => (
                        <span key={k} className="h-1.5 w-1.5 rounded-full" style={{ background: KIND[k].color }} />
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </motion.div>
        </AnimatePresence>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
          {Object.entries(KIND).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: v.color }} /> {v.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded ring-1 ring-neon" /> Today
          </span>
        </div>
      </Card>

      <div aria-live="polite">
        <h2 className="mb-3 text-lg font-semibold">{day ? formatDate(day) : 'Pick a day'}</h2>
        {selected.length === 0 ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl bg-surface p-4 text-sm text-muted hairline">
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="font-medium text-ink">Nothing due on this day.</p>
                <p>{monthCount > 0 ? 'Tap a day with a coloured dot to see what is due.' : nextWith ? `The next date is in ${monthName(monthKey(nextWith.date))}.` : 'No more dates after this month.'}</p>
                {monthCount === 0 && nextWith && (
                  <Button
                    className="mt-3"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setDir(1)
                      setMonth(monthKey(nextWith.date))
                      setDay(nextWith.date)
                    }}
                  >
                    Jump to {monthName(monthKey(nextWith.date))}
                  </Button>
                )}
              </div>
            </div>
            {upcoming.length > 0 && (
              <>
                <h3 className="pt-2 text-sm font-semibold uppercase tracking-wider text-muted">Coming up next</h3>
                {upcoming.map((e, i) => (
                  <EventCard key={`${e.exam.code}-${e.kind}-${e.date}-${i}`} ev={e} careerName={careerName} today={today} showDate />
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {selected.map((e, i) => (
              <EventCard key={`${e.exam.code}-${e.kind}-${i}`} ev={e} careerName={careerName} today={today} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ListView({ events, careerName, today }: { events: Ev[]; careerName: Map<string, string>; today: string }) {
  const groups = useMemo(() => {
    const m = new Map<string, Ev[]>()
    for (const e of events) m.set(monthKey(e.date), [...(m.get(monthKey(e.date)) ?? []), e])
    return [...m.entries()]
  }, [events])
  if (!groups.length)
    return (
      <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No dates announced yet">
        These exams have not published dates. Check their official websites.
      </EmptyState>
    )
  return (
    <div className="space-y-8">
      {groups.map(([ym, evs]) => (
        <section key={ym}>
          <h2 className="sticky top-16 z-[1] mb-3 py-1 text-lg font-semibold backdrop-blur">{monthName(ym)}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {evs.map((e, i) => (
              <EventCard key={`${e.exam.code}-${e.kind}-${e.date}-${i}`} ev={e} careerName={careerName} today={today} showDate />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function EventCard({ ev, careerName, showDate, today }: { ev: Ev; careerName: Map<string, string>; showDate?: boolean; today: string }) {
  const e = ev.exam
  const days = daysUntil(ev.date, new Date(`${today}T00:00:00`))
  const forCareers = (e.career_ids ?? []).map((id) => careerName.get(id)).filter(Boolean) as string[]
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-10 w-1 shrink-0 rounded-full" style={{ background: KIND[ev.kind].color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: KIND[ev.kind].color }}>
                {ev.label}
              </div>
              <h3 className="font-semibold leading-snug">{e.name}</h3>
            </div>
            <ProvenanceBadge p={e.provenance} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {e.conducting_body} · {titleCase(e.level)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {showDate && <span className="num font-medium">{formatDate(ev.date)}</span>}
            <span className={cx('num', days >= 0 && days <= 30 ? 'text-warn' : 'text-muted')}>{days < 0 ? 'passed' : days === 0 ? 'today' : `in ${days} days`}</span>
            <DateStatusTag status={ev.status} />
          </div>
          {forCareers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {forCareers.slice(0, 4).map((n) => (
                <Badge key={n} className="bg-surface-2 text-muted hairline">{n}</Badge>
              ))}
              {forCareers.length > 4 && <Badge className="bg-surface-2 text-muted hairline">+{forCareers.length - 4} more</Badge>}
            </div>
          )}
          {e.official_url && (
            <a href={e.official_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary hover:underline">
              Official website <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </Card>
  )
}
