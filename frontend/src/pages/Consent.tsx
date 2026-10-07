import { LinkButton } from '../components/family/LinkButton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CheckCircle2, Clock, Eye, EyeOff, Hourglass, Lock, RefreshCw, ShieldCheck, Send, XCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { consents, family } from '@/api/endpoints'
import { keys, useFamily } from '@/api/queries'
import type { ConsentOut, ConsentType, FamilyMember } from '@/api/types'
import { InvitePanel } from '@/components/family/InvitePanel'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Section, Skeleton, Switch, useToast } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { homeFor, useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

const CONSENTS_KEY = ['consents'] as const

/** The newest record of a type for a subject (the list comes oldest first). */
function latest(list: ConsentOut[] | undefined, type: ConsentType, subject: string) {
  return [...(list ?? [])].reverse().find((c) => c.consent_type === type && c.subject_user_id === subject)
}

const COLLECTED = [
  { what: 'Answers to the interest and ability questions', why: 'To find careers that suit how your child thinks and what they enjoy.' },
  { what: 'School marks, grade and city', why: 'To check eligibility for courses, exams and local scholarships.' },
  { what: "The family's budget (parents only)", why: 'To show which courses are affordable. Your child never sees the figures.' },
]

export default function Consent() {
  const { user } = useSession()
  if (!user) return <PageSkeleton />
  if (user.role === 'student') return <StudentConsent />
  if (user.role === 'parent') return <ParentConsent />
  return (
    <div>
      <PageHeader eyebrow="Privacy" title="Parental approval" />
      <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Nothing to approve here" action={<LinkButton to={homeFor(user.role)} variant="secondary">Go home</LinkButton>}>
        Parents approve how PRISM uses data about students under 18. Counsellors and admins only see what families allow.
      </EmptyState>
    </div>
  )
}

function WhatWeCollect() {
  return (
    <ul className="mt-3 space-y-3">
      {COLLECTED.map((c) => (
        <li key={c.what} className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden />
          <div>
            <div className="font-medium">{c.what}</div>
            <div className="text-sm text-muted">{c.why}</div>
          </div>
        </li>
      ))}
      <li className="flex gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <div className="text-sm text-muted">We never sell data or show ads. You can change your mind at any time from this page.</div>
      </li>
    </ul>
  )
}

// ---------------------------------------------------------------- student
function StudentConsent() {
  const { user, refreshUser } = useSession()
  const { reducedMotion } = useSettings()
  const qc = useQueryClient()
  const fam = useFamily()
  const [asked, setAsked] = useState(false)
  const [checking, setChecking] = useState(false)
  const create = useMutation({
    mutationFn: () => family.create(),
    onSuccess: async (f) => {
      qc.setQueryData(keys.family, f)
      await refreshUser()
      setAsked(true)
    },
  })
  const pending = user?.consent_status === 'pending'
  const recheck = async () => {
    setChecking(true)
    try {
      await refreshUser()
      await qc.invalidateQueries({ queryKey: CONSENTS_KEY })
    } finally {
      setChecking(false)
    }
  }

  if (!pending) {
    const granted = user?.consent_status === 'granted'
    return (
      <div>
        <PageHeader eyebrow="Privacy" title={granted ? 'Your parent approved' : 'Your privacy'} subtitle={granted ? 'You can use everything in PRISM.' : 'You are 18 or older, so no parent approval is needed.'} />
        <Card className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ok/15 text-ok">
            <BadgeCheck className="h-6 w-6" aria-hidden />
          </span>
          <div className="flex-1">
            <div className="font-semibold">{granted ? 'Approved' : 'Not needed'}</div>
            <div className="text-sm text-muted">Your answers and results are ready to use.</div>
          </div>
          <LinkButton to="/home" variant="secondary">Go home</LinkButton>
        </Card>
        {user && <SharingToggles subjectId={user.id} type="share_raw_answers_with_parent" />}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative mb-8 text-center">
        <motion.div
          aria-hidden
          className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-family/15 text-family"
          animate={reducedMotion ? undefined : { scale: [1, 1.06, 1], opacity: [0.9, 1, 0.9] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Hourglass className="h-9 w-9" />
        </motion.div>
        <h1 className="mt-5 text-3xl font-bold md:text-4xl">Waiting for a parent&apos;s OK</h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-muted">
          Because you are under 18, the law asks a parent or guardian to say yes before we use your answers. It only takes them a minute.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">What PRISM uses, and why</h2>
          <WhatWeCollect />
        </Card>
        <Card className="flex flex-col">
          <h2 className="text-lg font-semibold">How it works</h2>
          <ol className="mt-3 flex-1 space-y-3 text-[15px]">
            {['Send your parent a family code.', 'They sign up as a parent and type the code.', 'They read this page and tap Approve.'].map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge color="rgb(var(--warn))">
              <Clock className="h-3.5 w-3.5" aria-hidden /> Pending
            </Badge>
            <Button variant="ghost" size="sm" loading={checking} icon={<RefreshCw className="h-4 w-4" />} onClick={recheck}>
              Check again
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        {fam.isLoading ? (
          <Skeleton className="h-48" />
        ) : fam.isError ? (
          <ErrorState error={fam.error} onRetry={() => void fam.refetch()} />
        ) : fam.data ? (
          <InvitePanel forParent title="Send the request to my parent" autoCreate={asked} />
        ) : (
          <Card className="text-center">
            <h2 className="text-lg font-semibold">Send the request to my parent</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">We will set up your family space and give you a code to send on WhatsApp.</p>
            {create.isError && (
              <p className="mt-3 text-sm text-bad" role="alert">
                {(create.error as Error).message}
              </p>
            )}
            <Button className="mt-4" size="lg" magnetic loading={create.isPending} icon={<Send className="h-5 w-5" />} onClick={() => create.mutate()}>
              Send the request to my parent
            </Button>
          </Card>
        )}
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Already approved? Tap <b>Check again</b>.
        <span className="sr-only" aria-live="polite">
          {checking ? 'Checking' : ''}
        </span>
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- parent
function ParentConsent() {
  const fam = useFamily()
  const list = useQuery({ queryKey: CONSENTS_KEY, queryFn: () => consents.list() })
  if (fam.isLoading || list.isLoading) return <PageSkeleton />
  if (fam.isError) return <ErrorState error={fam.error} onRetry={() => void fam.refetch()} />
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  const students = fam.data?.members.filter((m) => m.role === 'student') ?? []
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Privacy" title="Your approval" subtitle="PRISM asks a parent before it uses data about a child under 18. Here is everything in one place." />
      {!fam.data ? (
        <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Join your child's family first" action={<LinkButton to="/family">Join with a code</LinkButton>}>
          Your child can send you a family code from their account. Once you join, you can approve here.
        </EmptyState>
      ) : students.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="No student in your family yet" action={<LinkButton to="/family">Invite your child</LinkButton>}>
          When your child joins, you can approve their account here.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {students.map((s) => (
            <StudentApproval key={s.user_id} student={s} records={list.data} />
          ))}
        </div>
      )}
    </div>
  )
}

function StudentApproval({ student, records }: { student: FamilyMember; records: ConsentOut[] | undefined }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { refreshUser } = useSession()
  const rec = latest(records, 'minor_data_processing', student.user_id)
  const first = student.full_name.split(' ')[0]
  const status: 'approved' | 'declined' | 'waiting' = rec ? (rec.granted ? 'approved' : 'declined') : 'waiting'
  const decide = useMutation({
    mutationFn: (granted: boolean) => consents.create({ consent_type: 'minor_data_processing', subject_user_id: student.user_id, granted }),
    onSuccess: async (_r, granted) => {
      await qc.invalidateQueries({ queryKey: CONSENTS_KEY })
      void qc.invalidateQueries({ queryKey: ['runs'] })
      void refreshUser()
      toast(granted ? 'ok' : 'info', granted ? `Thank you. ${first} can now see their results.` : `Declined. PRISM will not use ${first}'s answers.`)
    },
    onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save'),
  })

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-fit text-lg font-semibold text-white">
            {student.full_name.charAt(0)}
          </span>
          <div>
            <h2 className="text-xl font-semibold">{student.full_name}</h2>
            <div className="text-sm text-muted">Joined {formatDate(student.joined_at)}</div>
          </div>
        </div>
        {status === 'approved' ? (
          <Badge color="rgb(var(--ok))">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Approved {rec && formatDate(rec.granted_at)}
          </Badge>
        ) : status === 'declined' ? (
          <Badge color="rgb(var(--bad))">
            <XCircle className="h-3.5 w-3.5" aria-hidden /> Declined
          </Badge>
        ) : (
          <Badge color="rgb(var(--warn))">
            <Clock className="h-3.5 w-3.5" aria-hidden /> Waiting for you
          </Badge>
        )}
      </div>

      <div className="mt-5 rounded-2xl bg-surface-2/50 p-4 hairline">
        <h3 className="font-semibold">What PRISM uses, and why</h3>
        <WhatWeCollect />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        {status !== 'approved' && (
          <Button size="lg" magnetic={status === 'waiting'} loading={decide.isPending && decide.variables === true} onClick={() => decide.mutate(true)} icon={<CheckCircle2 className="h-5 w-5" />}>
            Approve for {first}
          </Button>
        )}
        {status !== 'declined' && (
          <Button size="lg" variant="secondary" loading={decide.isPending && decide.variables === false} onClick={() => decide.mutate(false)} icon={<XCircle className="h-5 w-5" />}>
            {status === 'approved' ? 'Withdraw approval' : 'Decline'}
          </Button>
        )}
      </div>

      <Section title="Sharing in your family" className="mt-8">
        <SharingToggles subjectId={student.user_id} type="share_raw_finance_with_student" records={records} childName={first} />
        {(() => {
          const a = latest(records, 'share_raw_answers_with_parent', student.user_id)
          return (
            <div className="mt-2 flex items-start gap-3 rounded-xl p-3 text-sm text-muted hairline">
              {a?.granted ? <Eye className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /> : <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              <span>
                {a?.granted ? `${first} shares their raw answers with you.` : `${first} keeps their raw answers private. You still see their results.`} Only {first} can change this.
              </span>
            </div>
          )
        })()}
      </Section>
    </Card>
  )
}

/** A consent toggle owned by the viewer: students for their answers, parents for the finance figures. */
function SharingToggles({ subjectId, type, records, childName }: { subjectId: string; type: 'share_raw_answers_with_parent' | 'share_raw_finance_with_student'; records?: ConsentOut[]; childName?: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const own = useQuery({ queryKey: CONSENTS_KEY, queryFn: () => consents.list(), enabled: !records })
  const data = records ?? own.data
  const rec = latest(data, type, subjectId)
  const set = useMutation({
    mutationFn: (granted: boolean) => consents.create({ consent_type: type, subject_user_id: subjectId, granted }),
    onSuccess: async (_r, granted) => {
      await qc.invalidateQueries({ queryKey: CONSENTS_KEY })
      toast('ok', granted ? 'Sharing turned on.' : 'Sharing turned off.')
    },
    onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save'),
  })
  if (!records && own.isLoading) return <Skeleton className="mt-6 h-20" />
  if (!records && own.isError) return <div className="mt-6"><ErrorState error={own.error} onRetry={() => void own.refetch()} /></div>
  const checked = set.isPending ? !!set.variables : !!rec?.granted
  const body =
    type === 'share_raw_answers_with_parent'
      ? { label: 'Let my parents see my raw answers', description: 'Off by default. Your parents always see your results, but not each answer you gave.' }
      : { label: `Show ${childName ?? 'your child'} the exact budget figures`, description: 'Off by default. When off, they only see a simple summary like "a middle budget".' }
  const inner = <Switch checked={checked} onChange={(v) => set.mutate(v)} label={body.label} description={body.description} />
  return type === 'share_raw_answers_with_parent' ? (
    <Section title="Sharing with your parents" className="mt-8">
      <Card>{inner}</Card>
    </Section>
  ) : (
    <div className="rounded-xl px-3 hairline">{inner}</div>
  )
}
