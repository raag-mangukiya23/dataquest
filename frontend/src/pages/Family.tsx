import { LinkButton } from '../components/family/LinkButton';
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HeartHandshake, Home as HomeIcon, KeyRound, MessagesSquare, Sparkles, Users, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { family } from '@/api/endpoints'
import { keys, useFamily, useLatestRun } from '@/api/queries'
import type { ConflictReport, FamilyOut } from '@/api/types'
import { ConflictGauge, FamilyGravity } from '@/components/family/Gravity'
import { InvitePanel } from '@/components/family/InvitePanel'
import { RELATIONS, dimensionLabel, useConflict } from '@/components/family/shared'
import { BandPill, Meter } from '@/components/score'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, PageSkeleton, Section, Select, Skeleton, Term, useToast } from '@/components/ui'
import { useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

export default function Family() {
  const { user } = useSession()
  const fam = useFamily()
  if (!user || (user.role !== 'student' && user.role !== 'parent')) {
    return (
      <div>
        <PageHeader eyebrow="Family" title="Family conversation" />
        <EmptyState icon={<Users className="h-6 w-6" />} title="This page is for students and parents" action={<LinkButton to="/home" variant="secondary">Go home</LinkButton>}>
          Counsellors can see each family&apos;s summary from the student list.
        </EmptyState>
      </div>
    )
  }
  if (fam.isLoading) return <PageSkeleton />
  if (fam.isError) return <ErrorState error={fam.error} onRetry={() => void fam.refetch()} title="Could not load your family" />
  if (!fam.data) return <NoFamily />
  return <FamilyHome fam={fam.data} />
}

// ---------------------------------------------------------------- no family yet
function NoFamily() {
  const { user, refreshUser } = useSession()
  const qc = useQueryClient()
  const toast = useToast()
  const [params] = useSearchParams()
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase())
  const [relation, setRelation] = useState(user?.role === 'student' ? 'self' : 'mother')
  const done = async (f: FamilyOut, msg: string) => {
    qc.setQueryData(keys.family, f)
    await refreshUser()
    toast('ok', msg)
  }
  const create = useMutation({ mutationFn: () => family.create(), onSuccess: (f) => done(f, 'Your family is ready. Now invite the others.') })
  const join = useMutation({
    mutationFn: () => family.join({ invite_code: code.trim(), relation }),
    onSuccess: (f) => done(f, `You joined ${f.name}.`),
  })
  return (
    <div>
      <PageHeader eyebrow="Family" title="Plan together" subtitle="Careers go better when the family talks. Link your accounts to compare hopes, share a budget and find careers you both like." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-family/15 text-family">
            <HomeIcon className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-xl font-semibold">Create our family</h2>
          <p className="mt-1 flex-1 text-sm text-muted">Start a family space. You get a code to share with your {user?.role === 'student' ? 'parents' : 'child'}.</p>
          {create.isError && <p className="mt-3 text-sm text-bad" role="alert">{(create.error as Error).message}</p>}
          <Button className="mt-5 w-full sm:w-auto" size="lg" loading={create.isPending} onClick={() => create.mutate()} magnetic={!code}>
            Create our family
          </Button>
        </Card>
        <Card className="flex flex-col">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary">
            <KeyRound className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-xl font-semibold">Join with an invite code</h2>
          <p className="mt-1 text-sm text-muted">Someone already made a family? Type the code they sent you.</p>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim()) join.mutate()
            }}
          >
            <Field label="Invite code" htmlFor="join-code" error={join.isError ? (join.error as Error).message : undefined}>
              <Input id="join-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. PRSM7K2Q" autoComplete="off" className="font-mono text-lg tracking-[0.2em]" />
            </Field>
            <Field label="I am the student's…" htmlFor="join-rel">
              <Select id="join-rel" value={relation} onChange={(e) => setRelation(e.target.value)}>
                {RELATIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" size="lg" variant={code ? 'primary' : 'secondary'} loading={join.isPending} disabled={!code.trim()}>
              Join family
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- family home
function FamilyHome({ fam }: { fam: FamilyOut }) {
  const { user } = useSession()
  const isParent = user?.role === 'parent'
  const child = fam.members.find((m) => m.role === 'student')
  const childName = child?.full_name.split(' ')[0] ?? 'Your child'
  const hasParent = fam.members.some((m) => m.role === 'parent')
  return (
    <div>
      <PageHeader
        eyebrow="Family"
        title={fam.name}
        subtitle={isParent ? `See where your hopes and ${childName}'s meet, and where to talk.` : 'See where your hopes and your parents’ meet, and where to talk.'}
        actions={
          <>
            <LinkButton to="/family/meeting" icon={<MessagesSquare className="h-4 w-4" />}>Start a family meeting</LinkButton>
            <LinkButton to="/family/budget" variant="secondary" icon={<Wallet className="h-4 w-4" />}>
                {isParent ? 'Budget and career hopes' : 'Family budget'}
              </LinkButton>
          </>
        }
      />

      <ConflictSection isParent={isParent} childName={childName} fam={fam} hasParent={hasParent} />

      <Section title="Members" className="mt-10">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <Card>
            <ul className="divide-y divide-[rgb(var(--muted)/0.15)]">
              {fam.members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    aria-hidden
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-base font-semibold text-white"
                    style={{ background: m.role === 'student' ? 'rgb(var(--fit))' : 'rgb(var(--family))' }}
                  >
                    {m.full_name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {m.full_name}
                      {m.user_id === user?.id && <span className="text-muted"> (you)</span>}
                    </div>
                    <div className="text-xs capitalize text-muted">{m.role === 'student' ? 'Student' : m.relation}</div>
                  </div>
                  <Badge color={m.role === 'student' ? 'rgb(var(--fit))' : 'rgb(var(--family))'}>{m.role === 'student' ? 'Student' : 'Parent'}</Badge>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
              <Badge color={fam.has_finance ? 'rgb(var(--ok))' : 'rgb(var(--warn))'}>{fam.has_finance ? 'Budget added' : 'No budget yet'}</Badge>
              <Badge color={fam.has_parent_preferences ? 'rgb(var(--ok))' : 'rgb(var(--warn))'}>{fam.has_parent_preferences ? 'Career hopes added' : 'No career hopes yet'}</Badge>
            </div>
          </Card>
          <InvitePanel forParent={!isParent} title={isParent ? 'Invite another parent or your child' : 'Invite a parent'} />
        </div>
      </Section>
    </div>
  )
}

function ConflictSection({ isParent, childName, fam, hasParent }: { isParent: boolean; childName: string; fam: FamilyOut; hasParent: boolean }) {
  const latest = useLatestRun()
  const conflict = useConflict(latest.run?.run_id ?? latest.summary?.run_id)
  const navigate = useNavigate()

  if (latest.isLoading || conflict.isLoading)
    return (
      <Card aria-busy="true">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-6 h-48 w-full" />
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-11 w-36" />
          <Skeleton className="h-11 w-36" />
        </div>
      </Card>
    )
  if (latest.error) return <ErrorState error={latest.error} onRetry={latest.refetch} title="Could not load results" />
  if (!hasParent && !isParent)
    return (
      <EmptyState icon={<HeartHandshake className="h-6 w-6" />} title="Bring a parent in">
        When a parent joins with your code below and adds their hopes, you will see where your views meet.
      </EmptyState>
    )
  if (latest.isEmpty || !latest.summary)
    return (
      <EmptyState
        icon={<Sparkles className="h-6 w-6" />}
        title="No results yet"
        action={
          isParent ? undefined : (
            <Button onClick={() => navigate('/questionnaire')}>Answer the questions</Button>
          )
        }
      >
        {isParent ? `Once ${childName} finishes the questions, you will see where your hopes meet.` : 'Finish the questionnaire to see your results and how they compare with your family’s hopes.'}
      </EmptyState>
    )
  if (conflict.isError)
    return (
      <div className="space-y-3">
        <ErrorState error={conflict.error} onRetry={() => void conflict.refetch()} title="Could not compare hopes" />
        {!fam.has_parent_preferences && isParent && (
          <Link to="/family/budget" className="text-sm text-primary underline">
            Add your career hopes first
          </Link>
        )}
      </div>
    )
  const c = conflict.data
  if (!c) return null
  return isParent && c.visibility === 'full' ? <ParentConflict c={c} childName={childName} /> : <StudentConflict c={c} childName={childName} isParent={isParent} />
}

function GravityCard({ c, childName, isParent, aside }: { c: ConflictReport; childName: string; isParent: boolean; aside?: React.ReactNode }) {
  return (
    <Card className="relative overflow-hidden p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">
          How close are your hopes?
        </h2>
        <BandPill value={c.band} />
      </div>
      <p className="mt-1 text-sm text-muted">The closer the two lights, the more you agree. Stars are <Term id="bridge">bridge careers</Term> that suit both.</p>
      <div className={aside ? 'mt-3 grid items-center gap-6 lg:grid-cols-[1fr_240px]' : 'mt-3'}>
        <FamilyGravity index={c.index} bridges={c.bridge_careers} viewerIsParent={isParent} childName={childName} />
        {aside}
      </div>
    </Card>
  )
}

function ParentConflict({ c, childName }: { c: ConflictReport; childName: string }) {
  const { reducedMotion } = useSettings()
  const dims = [...(c.dimensions ?? [])].sort((a, b) => b.contribution - a.contribution)
  return (
    <div className="space-y-8">
      <GravityCard c={c} childName={childName} isParent aside={<ConflictGauge index={c.index} band={c.band} />} />
      {c.summary && (
        <p className="max-w-3xl text-[15px] leading-relaxed">
          {c.summary} <span className="text-muted">The <Term id="conflict">difference index</Term> runs from 0 (fully aligned) to 100.</span>
        </p>
      )}

      <Section title="Where you differ" subtitle={`Each row shows how far apart you and ${childName} are, and how many points it adds to the index.`}>
        {dims.length === 0 ? (
          <EmptyState title="No details yet">Add your career hopes and budget to see the details.</EmptyState>
        ) : (
          <Card className="divide-y divide-[rgb(var(--muted)/0.15)] p-0">
            {dims.map((d, i) => (
              <motion.div
                key={d.dimension}
                className="grid gap-3 p-4 sm:p-5 md:grid-cols-[180px_1fr_120px] md:items-center"
                initial={reducedMotion ? false : { opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
              >
                <div className="font-semibold">{dimensionLabel(d.dimension)}</div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-xl bg-fit/10 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-fit">{childName}</div>
                    <div className="mt-0.5">{d.student_position}</div>
                  </div>
                  <div className="rounded-xl bg-family/10 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-family">You</div>
                    <div className="mt-0.5">{d.parent_position}</div>
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>Gap</span>
                    <span className="num font-semibold text-ink">+{d.contribution.toFixed(1)} pts</span>
                  </div>
                  <Meter value={d.gap} color="rgb(var(--family))" label={`Gap in ${dimensionLabel(d.dimension)}`} />
                </div>
              </motion.div>
            ))}
          </Card>
        )}
      </Section>

      <Drivers c={c} />
    </div>
  )
}

function StudentConflict({ c, childName, isParent }: { c: ConflictReport; childName: string; isParent: boolean }) {
  return (
    <div className="space-y-8">
      <GravityCard c={c} childName={childName} isParent={isParent} />
      {c.summary && (
        <Card className="border-family/30 bg-family/[0.06]">
          <div className="flex gap-3">
            <HeartHandshake className="mt-0.5 h-6 w-6 shrink-0 text-family" aria-hidden />
            <p className="text-[15px] leading-relaxed">{c.summary}</p>
          </div>
        </Card>
      )}
      <Drivers c={c} />
    </div>
  )
}

function Drivers({ c }: { c: ConflictReport }) {
  if (!c.top_drivers.length)
    return (
      <EmptyState icon={<HeartHandshake className="h-6 w-6" />} title="You mostly agree">
        There is nothing big to sort out. A family meeting can still help you plan the next steps.
      </EmptyState>
    )
  return (
    <Section title="Things to talk about" subtitle="Pick one over dinner. There are no wrong answers.">
      <div className="grid gap-4 md:grid-cols-3">
        {c.top_drivers.map((d, i) => (
          <Card key={d.dimension + i} className="flex flex-col">
            <Badge color="rgb(var(--family))" className="self-start">
              {dimensionLabel(d.dimension)}
            </Badge>
            <p className="mt-3 text-sm text-muted">{d.explanation}</p>
            <p className="mt-3 flex-1 text-[15px] font-medium leading-snug">&ldquo;{d.conversation_prompt}&rdquo;</p>
          </Card>
        ))}
      </div>
      <div className="mt-4">
        <LinkButton to="/family/meeting" variant="secondary" icon={<MessagesSquare className="h-4 w-4" />}>
            Talk through these together
          </LinkButton>
      </div>
    </Section>
  )
}
