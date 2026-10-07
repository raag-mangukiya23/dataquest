// Deadlines as a countdown list, with "Add to calendar" (.ics) and "Remind me" (WhatsApp / SMS / email).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellOff, BellRing, CalendarPlus, CalendarX2, ExternalLink, Mail, MessageCircle, Smartphone } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { deadlines as dl } from '@/api/endpoints'
import { openBlob } from '@/api/client'
import { useDeadlines } from '@/api/queries'
import type { ReminderChannel, ReminderPlan } from '@/api/types'
import { DateStatusTag } from '@/components/score'
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, Input, Skeleton, cx, useToast } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { Chip } from './controls'

const PHONE = /^\+[1-9]\d{7,14}$/
const LEADS = [14, 7, 3, 1]

export function DeadlineList({ studentId }: { studentId: string }) {
  const { reducedMotion } = useSettings()
  const toast = useToast()
  const q = useDeadlines(studentId)
  const [remindOpen, setRemindOpen] = useState(false)
  const [icsBusy, setIcsBusy] = useState(false)

  const addToCalendar = async () => {
    setIcsBusy(true)
    try {
      openBlob(await dl.ics(studentId), 'prism-deadlines.ics')
      toast('ok', 'Calendar file downloaded. Open it to add the dates.')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not make the calendar file.')
    } finally {
      setIcsBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap gap-2">
        <Button variant="secondary" icon={<CalendarPlus className="h-4 w-4" />} loading={icsBusy} onClick={() => void addToCalendar()} disabled={!q.data?.items.length}>
          Add to calendar
        </Button>
        <Button variant="secondary" icon={<BellRing className="h-4 w-4" />} onClick={() => setRemindOpen(true)} disabled={!q.data?.items.length}>
          Remind me
        </Button>
      </div>

      {q.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading deadlines">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Deadlines did not load" />
      ) : !q.data || q.data.items.length === 0 ? (
        <EmptyState icon={<CalendarX2 className="h-6 w-6" />} title="No deadlines in the next year">
          {q.data?.notice || 'When an exam or scholarship for your careers opens, it will show up here.'}
        </EmptyState>
      ) : (
        <>
          <ol className="space-y-3">
            {q.data.items.map((d, i) => (
              <motion.li
                key={d.ref_id}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: reducedMotion ? 0 : Math.min(i * 0.03, 0.3) }}
              >
                <Card className="flex gap-4 p-4 print:break-inside-avoid">
                  <div className={cx('flex w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-2 py-2 hairline', d.days_left <= 14 ? 'text-warn' : 'text-ink')}>
                    <span className="num text-2xl font-semibold leading-none">{d.days_left}</span>
                    <span className="mt-1 text-[10px] uppercase tracking-wider text-muted">{d.days_left === 1 ? 'day' : 'days'}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-snug">{d.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="num">{formatDate(d.due)}</span>
                      <DateStatusTag status={d.date_status} />
                    </div>
                    {d.for_careers.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {d.for_careers.map((c) => (
                          <Badge key={c} className="bg-surface-2 text-muted hairline">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>Source: {d.source_name}</span>
                      {d.official_url && (
                        <a href={d.official_url} target="_blank" rel="noreferrer" className="inline-flex min-h-[32px] items-center gap-1 text-primary hover:underline">
                          Official site <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.li>
            ))}
          </ol>
          {q.data.notice && <p className="text-xs text-muted">{q.data.notice}</p>}
        </>
      )}

      <MyReminders />
      <RemindDialog open={remindOpen} onOpenChange={setRemindOpen} studentId={studentId} />
    </div>
  )
}

function MyReminders() {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['reminders-mine'], queryFn: dl.mine })
  const cancel = useMutation({
    mutationFn: dl.cancelAll,
    onSuccess: (r) => {
      toast('ok', `Stopped ${r.cancelled} ${r.cancelled === 1 ? 'reminder' : 'reminders'}.`)
      void qc.invalidateQueries({ queryKey: ['reminders-mine'] })
    },
    onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not stop reminders.'),
  })
  const active = (q.data ?? []).filter((r) => r.status !== 'cancelled')
  if (q.isLoading) return <Skeleton className="no-print h-16" />
  if (q.error) return <div className="no-print"><ErrorState error={q.error} onRetry={() => void q.refetch()} title="Your reminders did not load" /></div>
  if (active.length === 0) return null
  return (
    <Card className="no-print p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BellRing className="h-4 w-4 text-primary" aria-hidden /> {active.length} {active.length === 1 ? 'reminder' : 'reminders'} scheduled
        </div>
        <Button size="sm" variant="ghost" icon={<BellOff className="h-4 w-4" />} loading={cancel.isPending} onClick={() => cancel.mutate()} className="min-h-[44px]">
          Stop all reminders
        </Button>
      </div>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-muted">
        {active.slice(0, 20).map((r) => (
          <li key={r.id} className="flex justify-between gap-3">
            <span className="truncate">{r.title}</span>
            <span className="num shrink-0">
              {r.channel} · {formatDate(r.send_on)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

const CHANNELS: { value: ReminderChannel; label: string; Icon: typeof Mail }[] = [
  { value: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  { value: 'sms', label: 'SMS', Icon: Smartphone },
  { value: 'email', label: 'Email', Icon: Mail },
]

function RemindDialog({ open, onOpenChange, studentId }: { open: boolean; onOpenChange: (v: boolean) => void; studentId: string }) {
  const qc = useQueryClient()
  const [channel, setChannel] = useState<ReminderChannel>('whatsapp')
  const [phone, setPhone] = useState('+91')
  const [leads, setLeads] = useState<number[]>([7, 1])
  const [result, setResult] = useState<ReminderPlan | null>(null)
  const needsPhone = channel !== 'email'
  const phoneOk = !needsPhone || PHONE.test(phone.replace(/\s/g, ''))
  const m = useMutation({
    mutationFn: () => dl.remind(studentId, { channel, phone: needsPhone ? phone.replace(/\s/g, '') : null, lead_days: [...leads].sort((a, b) => b - a), horizon_days: 365 }),
    onSuccess: (r) => {
      setResult(r)
      void qc.invalidateQueries({ queryKey: ['reminders-mine'] })
    },
  })
  const close = (v: boolean) => {
    onOpenChange(v)
    if (!v) {
      setResult(null)
      m.reset()
    }
  }
  return (
    <Dialog open={open} onOpenChange={close} title="Remind me before each deadline" description="We send a short message on the morning of each reminder day.">
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-ok/10 p-4 text-ok">
            <BellRing className="h-5 w-5 shrink-0" aria-hidden />
            <div className="text-sm">
              <div className="font-semibold">
                {result.created} new {result.created === 1 ? 'reminder' : 'reminders'} set
              </div>
              {result.already_scheduled > 0 && <div className="text-ok/80">{result.already_scheduled} were already scheduled.</div>}
            </div>
          </div>
          <p className="text-sm text-muted">{result.notice}</p>
          <Button className="w-full" onClick={() => close(false)}>
            Done
          </Button>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (phoneOk && leads.length) m.mutate()
          }}
        >
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Send by</legend>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(({ value, label, Icon }) => (
                <Chip key={value} active={channel === value} onClick={() => setChannel(value)}>
                  <Icon className="h-4 w-4" aria-hidden /> {label}
                </Chip>
              ))}
            </div>
          </fieldset>
          {needsPhone ? (
            <Field label="Mobile number" htmlFor="remind-phone" hint="With country code, like +91 98765 43210." error={!phoneOk && phone.length > 3 ? 'Use +91 and then the 10-digit number.' : undefined}>
              <Input id="remind-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!phoneOk} />
            </Field>
          ) : (
            <p className="text-sm text-muted">We will email the address you signed in with.</p>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">How many days before</legend>
            <div className="flex flex-wrap gap-2">
              {LEADS.map((d) => (
                <Chip key={d} active={leads.includes(d)} onClick={() => setLeads((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]))} ariaLabel={`${d} ${d === 1 ? 'day' : 'days'} before`}>
                  {d} {d === 1 ? 'day' : 'days'}
                </Chip>
              ))}
            </div>
            {leads.length === 0 && <p className="mt-1 text-xs text-bad">Pick at least one.</p>}
          </fieldset>
          {m.error && <ErrorState error={m.error} title="Reminders were not set" />}
          <Button type="submit" className="w-full" loading={m.isPending} disabled={!phoneOk || leads.length === 0}>
            Set reminders
          </Button>
        </form>
      )}
    </Dialog>
  )
}
