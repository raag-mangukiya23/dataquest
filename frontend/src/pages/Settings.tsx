// Settings: comfort, reminders, privacy (consents) and account.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellOff, BellRing, Check, LogOut, MessageCircle, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { consents, deadlines } from '@/api/endpoints'
import type { ConsentType, ReminderOut } from '@/api/types'
import type { Lang } from '@/api/endpoints'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, Switch, useToast } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { useSession } from '@/state/session'
import { useSettings, type Settings as S } from '@/state/settings'
import { humanKey } from '@/components/system/shared'

const CONSENT_COPY: Record<ConsentType, { title: string; meaning: string }> = {
  minor_data_processing: { title: 'Use of a student’s answers', meaning: 'A parent agreed that PRISM may process the answers of a student under 18 to make career suggestions.' },
  share_raw_answers_with_parent: { title: 'Answers shown to parents', meaning: 'Parents may see the student’s individual questionnaire answers, not only the summary.' },
  share_raw_finance_with_student: { title: 'Money figures shown to the student', meaning: 'The student may see the family’s exact income, savings and loan figures, not only the funding class.' },
  anonymised_analytics: { title: 'Anonymous statistics', meaning: 'Your data may be counted in totals that never identify anyone (groups under 5 are hidden).' },
}

export default function Settings() {
  const { user, logout } = useSession()
  const navigate = useNavigate()
  const isFamily = user?.role === 'student' || user?.role === 'parent'
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Make PRISM comfortable" subtitle="Changes save on this device straight away." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Comfort />
        <div className="space-y-6">
          {isFamily && <Reminders />}
          {isFamily && <Privacy />}
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Account</h2>
            {user && (
              <dl className="grid gap-3 text-sm sm:grid-cols-[7rem_1fr]">
                <dt className="text-muted">Name</dt>
                <dd className="font-medium">{user.full_name}</dd>
                <dt className="text-muted">Email</dt>
                <dd className="break-all font-medium">{user.email}</dd>
                <dt className="text-muted">Role</dt>
                <dd className="font-medium capitalize">{user.role === 'educator' ? 'Counsellor' : user.role}</dd>
              </dl>
            )}
            <Button
              variant="secondary"
              className="mt-5"
              icon={<LogOut className="h-4 w-4" />}
              onClick={() => {
                logout()
                navigate('/')
              }}
            >
              Sign out
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Comfort() {
  const { settings, update } = useSettings()
  const { user } = useSession()
  const toast = useToast()
  const pm = settings.parentMode === null ? 'auto' : settings.parentMode ? 'on' : 'off'
  return (
    <Card className="h-fit space-y-6">
      <h2 className="text-lg font-semibold">Comfort</h2>
      <Row label="Theme">
        <Segmented<S['theme']> label="Theme" value={settings.theme} onChange={(theme) => update({ theme })} options={[{ value: 'system', label: 'Device' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
      </Row>
      <Row label="Text size" hint="Bigger text for easier reading.">
        <Segmented<string>
          label="Text size"
          value={String(settings.textSize)}
          onChange={(v) => update({ textSize: Number(v) as S['textSize'] })}
          options={[{ value: '100', label: 'A' }, { value: '115', label: <span className="text-[17px]">A</span> }, { value: '130', label: <span className="text-[20px]">A</span> }]}
        />
      </Row>
      <Row label="Language" hint="Used for summaries and the family report.">
        <Segmented<Lang> label="Language" value={settings.language} onChange={(language) => update({ language })} options={[{ value: 'en', label: 'English' }, { value: 'ta', label: 'தமிழ்' }, { value: 'hi', label: 'हिन्दी' }]} />
      </Row>
      <Switch checked={settings.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} label="Reduce motion" description="Turns off moving effects and celebrations." />
      {user?.role !== 'educator' && user?.role !== 'admin' && (
        <Row label="Simple parent view" hint="Bigger buttons and just the essentials. Automatic turns it on for parents on phones.">
          <Segmented<string>
            label="Simple parent view"
            value={pm}
            onChange={(v) => update({ parentMode: v === 'auto' ? null : v === 'on' })}
            options={[{ value: 'auto', label: 'Automatic' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
          />
        </Row>
      )}
      <div className="hairline-t pt-4">
        <Button
          variant="ghost"
          icon={<RotateCcw className="h-4 w-4" />}
          onClick={() => {
            update({ tourDone: false })
            toast('info', 'The tour will show next time you open a page.')
          }}
        >
          Show the tour again
        </Button>
      </div>
    </Card>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="no-scrollbar max-w-full overflow-x-auto">{children}</div>
    </div>
  )
}

function Reminders() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['reminders', 'mine'], queryFn: deadlines.mine })
  const stop = useMutation({
    mutationFn: deadlines.cancelAll,
    onSuccess: (r) => {
      toast('ok', `${r.cancelled} reminders stopped.`)
      void qc.invalidateQueries({ queryKey: ['reminders'] })
    },
    onError: (e) => toast('error', (e as Error).message),
  })
  const pending = (q.data ?? []).filter((r) => r.status === 'pending')
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Reminders</h2>
        {pending.length > 0 && (
          <Button variant="secondary" size="sm" icon={<BellOff className="h-4 w-4" />} loading={stop.isPending} onClick={() => stop.mutate()}>
            Stop all reminders
          </Button>
        )}
      </div>
      {q.isLoading ? (
        <Skeleton className="h-32" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load reminders" />
      ) : !q.data?.length ? (
        <EmptyState icon={<BellRing className="h-6 w-6" />} title="No reminders set" action={<Button variant="secondary" onClick={() => navigate('/plan')}>Open your plan</Button>}>
          Turn on reminders from the plan page and we will nudge you before each deadline.
        </EmptyState>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {q.data.map((r) => (
            <ReminderRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function ReminderRow({ r }: { r: ReminderOut }) {
  const color = r.status === 'pending' ? 'rgb(var(--primary))' : r.status === 'sent' ? 'rgb(var(--ok))' : 'rgb(var(--muted))'
  return (
    <li className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 hairline">
      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{r.title}</div>
        <div className="text-xs text-muted">
          Sends {formatDate(r.send_on)} by {humanKey(r.channel)} · due {formatDate(r.due)}
        </div>
      </div>
      <Badge color={color}>{humanKey(r.status)}</Badge>
    </li>
  )
}

function Privacy() {
  const q = useQuery({ queryKey: ['consents'], queryFn: consents.list })
  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="h-5 w-5 text-ok" aria-hidden /> Privacy
      </h2>
      <p className="mb-4 text-sm text-muted">What your family has agreed to. Parents can change these from the consent page.</p>
      {q.isLoading ? (
        <Skeleton className="h-28" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load your privacy choices" />
      ) : !q.data?.length ? (
        <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="No choices recorded yet">
          Nothing has been shared. A parent can record consent on the consent page.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {q.data.map((c) => {
            const copy = CONSENT_COPY[c.consent_type] ?? { title: humanKey(c.consent_type), meaning: '' }
            const on = c.granted && !c.revoked_at
            return (
              <li key={c.id} className="flex gap-3 rounded-xl bg-surface-2 p-3 hairline">
                <span className={on ? 'text-ok' : 'text-muted'}>{on ? <Check className="h-5 w-5" aria-hidden /> : <X className="h-5 w-5" aria-hidden />}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {copy.title}
                    <Badge color={on ? 'rgb(var(--ok))' : 'rgb(var(--muted))'}>{on ? 'Agreed' : 'Not agreed'}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{copy.meaning}</p>
                  <p className="mt-1 text-xs text-muted">{on ? `Since ${formatDate(c.granted_at)}` : c.revoked_at ? `Withdrawn ${formatDate(c.revoked_at)}` : ''}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
