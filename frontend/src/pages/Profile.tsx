// My profile: traits from the questionnaire (Holland code, radar, bars) and the editable school/location details.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Lock, Save } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { catalog, profile } from '@/api/endpoints'
import { useStudentId } from '@/api/queries'
import type { StudentProfileIn, StudentProfileOut } from '@/api/types'
import { Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, PageSkeleton, Section, Select, Skeleton, Tabs, TabPanel, cx, useToast } from '@/components/ui'
import { Meter } from '@/components/score'
import { ChipInput } from '@/components/journey/ChipInput'
import { TraitsView } from '@/components/journey/TraitsView'
import { journeyKeys, useTraits } from '@/components/journey/lib'
import { useSession } from '@/state/session'

type TabKey = 'traits' | 'details'

export default function Profile() {
  const { user } = useSession()
  const isStudent = user?.role === 'student'
  const [tab, setTab] = useState<TabKey>('traits')
  if (!isStudent) return <ParentProfile />
  return (
    <div>
      <PageHeader eyebrow="My profile" title="What makes you, you" subtitle="Your questionnaire results and your school details. Keep them current so suggestions stay right for you." />
      <Tabs
        value={tab}
        onValueChange={setTab}
        label="Profile sections"
        tabs={[
          { value: 'traits', label: 'My traits' },
          { value: 'details', label: 'My details' },
        ]}
      >
        <TabPanel value="traits" className="mt-5 focus-visible:outline-none">
          <StudentTraits />
        </TabPanel>
        <TabPanel value="details" className="mt-5 focus-visible:outline-none">
          <Details />
        </TabPanel>
      </Tabs>
    </div>
  )
}

function StudentTraits() {
  const { studentId } = useStudentId()
  const navigate = useNavigate()
  const traits = useTraits(studentId)
  if (traits.isLoading) return <TraitsSkeleton />
  if (traits.error) return <ErrorState error={traits.error} onRetry={() => void traits.refetch()} title="We could not load your traits" />
  if (!traits.data || traits.data.instruments_completed.length === 0)
    return (
      <EmptyState
        icon={<ClipboardList className="h-6 w-6" />}
        title="Your profile appears here"
        action={<Button magnetic onClick={() => navigate('/questionnaire')}>Start the questionnaire</Button>}
      >
        Answer the short question sets and we will show your interests, strengths and values, in plain words.
      </EmptyState>
    )
  return <TraitsView t={traits.data} />
}

function TraitsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading traits">
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64 lg:col-span-3" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}

function ParentProfile() {
  const { studentId, isLoading } = useStudentId()
  const navigate = useNavigate()
  const traits = useTraits(studentId)
  const header = <PageHeader eyebrow="Profile" title="Your child’s profile" subtitle="What the questionnaire says about interests, strengths and values." />
  if (isLoading) return <PageSkeleton />
  if (!studentId)
    return (
      <>
        {header}
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No child linked yet" action={<Button onClick={() => navigate('/family')}>Link your child</Button>}>
          Join your child’s family with their invite code to see their profile.
        </EmptyState>
      </>
    )
  if (traits.isLoading)
    return (
      <>
        {header}
        <TraitsSkeleton />
      </>
    )
  if (traits.error) {
    const forbidden = traits.error instanceof ApiError && (traits.error.status === 403 || traits.error.code === 'CONSENT_REQUIRED' || traits.error.code === 'FORBIDDEN')
    return (
      <>
        {header}
        {forbidden ? (
          <EmptyState icon={<Lock className="h-6 w-6" />} title="This stays private for now" action={<Button variant="secondary" onClick={() => navigate('/results')}>See the results instead</Button>}>
            Your child’s detailed profile is shared only if they turn on sharing. You can still see their career results and join the family meeting.
          </EmptyState>
        ) : (
          <ErrorState error={traits.error} onRetry={() => void traits.refetch()} title="We could not load the profile" />
        )}
      </>
    )
  }
  if (!traits.data)
    return (
      <>
        {header}
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Not answered yet" action={<Button variant="secondary" onClick={() => navigate('/questionnaire')}>About the questionnaire</Button>}>
          Once your child finishes the questionnaire, their profile appears here.
        </EmptyState>
      </>
    )
  return (
    <>
      {header}
      <TraitsView t={traits.data} who="child" />
    </>
  )
}

// ---------------------------------------------------------------- details form
const BOARDS = ['CBSE', 'ICSE', 'IB', 'Cambridge (IGCSE)', 'TN State Board', 'Karnataka State Board', 'Maharashtra State Board', 'Kerala State Board', 'Other State Board']
const STREAMS = ['PCM', 'PCB', 'PCMB', 'Commerce', 'Humanities', 'Vocational']

const EMPTY: StudentProfileIn = {
  grade: 11,
  board: '',
  stream: null,
  pincode: '',
  city: '',
  state: '',
  languages: [],
  interests: [],
  extracurriculars: [],
  recent_score_pct: null,
  preferred_regions: [],
  willing_to_relocate: 0.5,
  willing_abroad: 0.2,
}

function toIn(p: StudentProfileOut): StudentProfileIn {
  return {
    grade: p.grade,
    board: p.board,
    stream: p.stream ?? null,
    pincode: p.pincode,
    city: p.city,
    state: p.state,
    languages: p.languages ?? [],
    interests: p.interests ?? [],
    extracurriculars: p.extracurriculars ?? [],
    recent_score_pct: p.recent_score_pct ?? null,
    preferred_regions: p.preferred_regions ?? [],
    willing_to_relocate: p.willing_to_relocate,
    willing_abroad: p.willing_abroad,
  }
}

function Details() {
  const qc = useQueryClient()
  const toast = useToast()
  const prof = useQuery({
    queryKey: journeyKeys.profile,
    retry: false,
    queryFn: async () => {
      try {
        return await profile.get()
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null
        throw e
      }
    },
  })
  const regions = useQuery({ queryKey: ['regions'], queryFn: catalog.regions, staleTime: 60 * 60_000 })
  const [form, setForm] = useState<StudentProfileIn>(EMPTY)
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (prof.data) setForm(toIn(prof.data))
  }, [prof.data])

  const save = useMutation({
    mutationFn: (b: StudentProfileIn) => profile.put(b),
    onSuccess: (p) => {
      qc.setQueryData(journeyKeys.profile, p)
      void qc.invalidateQueries({ queryKey: ['runs'] })
      toast('ok', 'Saved. New results will use these details.')
    },
    onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save.'),
  })

  const errors = useMemo(() => {
    const e: Partial<Record<keyof StudentProfileIn, string>> = {}
    if (!/^\d{6}$/.test(form.pincode)) e.pincode = 'Enter the 6-digit PIN code.'
    if (!form.board.trim()) e.board = 'Choose your board.'
    if (!form.city.trim()) e.city = 'Enter your city or town.'
    if (!form.state.trim()) e.state = 'Enter your state.'
    if (form.recent_score_pct !== null && form.recent_score_pct !== undefined && (form.recent_score_pct < 0 || form.recent_score_pct > 100)) e.recent_score_pct = 'Between 0 and 100.'
    return e
  }, [form])

  if (prof.isLoading) return <PageSkeleton />
  if (prof.error) return <ErrorState error={prof.error} onRetry={() => void prof.refetch()} title="We could not load your details" />

  const set = <K extends keyof StudentProfileIn>(k: K, v: StudentProfileIn[K]) => setForm((f) => ({ ...f, [k]: v }))
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (Object.keys(errors).length) {
      toast('error', 'A few details need a look before saving.')
      return
    }
    save.mutate({ ...form, stream: form.grade >= 11 ? form.stream || null : null })
  }
  const err = (k: keyof StudentProfileIn) => (touched ? errors[k] : undefined)
  const regionList = (regions.data ?? []).filter((r) => r.type !== 'international')
  const completeness = save.data?.completeness ?? prof.data?.completeness

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="text-sm font-semibold">{completeness !== undefined ? 'Profile completeness' : 'Let’s set up your profile'}</div>
          <p className="text-xs text-muted">{completeness !== undefined ? 'The more we know, the better the suggestions.' : 'A few details about school and where you live help us find careers and colleges near you.'}</p>
        </div>
        {completeness !== undefined && (
          <div className="flex w-full items-center gap-3 sm:w-64">
            <Meter value={completeness} label="Profile completeness" color="rgb(var(--neon))" />
            <span className="num text-sm font-semibold">{Math.round(completeness * 100)}%</span>
          </div>
        )}
      </Card>

      <Section title="School">
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Grade" htmlFor="grade">
            <Select id="grade" value={form.grade} onChange={(e) => set('grade', Number(e.target.value))}>
              {[9, 10, 11, 12].map((g) => (
                <option key={g} value={g}>Grade {g}</option>
              ))}
              <option value={13}>Gap year / repeating</option>
            </Select>
          </Field>
          <Field label="Board" htmlFor="board" error={err('board')}>
            <Select id="board" value={form.board} onChange={(e) => set('board', e.target.value)}>
              <option value="">Choose…</option>
              {[...new Set([...BOARDS, form.board].filter(Boolean))].map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
          </Field>
          {form.grade >= 11 && (
            <Field label="Stream" htmlFor="stream" hint="Leave blank if not chosen yet.">
              <Select id="stream" value={form.stream ?? ''} onChange={(e) => set('stream', e.target.value || null)}>
                <option value="">Not chosen yet</option>
                {[...new Set([...STREAMS, form.stream ?? ''].filter(Boolean))].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Latest exam score (%)" htmlFor="score" hint="Your most recent overall percentage." error={err('recent_score_pct')}>
            <Input
              id="score"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.1}
              value={form.recent_score_pct ?? ''}
              onChange={(e) => set('recent_score_pct', e.target.value === '' ? null : Number(e.target.value))}
            />
          </Field>
        </Card>
      </Section>

      <Section title="Where you live">
        <Card className="grid gap-4 sm:grid-cols-3">
          <Field label="PIN code" htmlFor="pin" error={err('pincode')} hint={prof.data?.region_code ? `Region: ${regions.data?.find((r) => r.code === prof.data?.region_code)?.name ?? prof.data.region_code}` : 'Six digits.'}>
            <Input id="pin" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </Field>
          <Field label="City or town" htmlFor="city" error={err('city')}>
            <Input id="city" autoComplete="address-level2" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="State" htmlFor="state" error={err('state')}>
            <Input id="state" autoComplete="address-level1" value={form.state} onChange={(e) => set('state', e.target.value)} />
          </Field>
        </Card>
      </Section>

      <Section title="About you" subtitle="Type and press Enter to add each one.">
        <Card className="grid gap-4">
          <Field label="Languages you speak" htmlFor="langs">
            <ChipInput id="langs" value={form.languages ?? []} onChange={(v) => set('languages', v)} placeholder="e.g. Tamil, English" />
          </Field>
          <Field label="Interests" htmlFor="ints">
            <ChipInput id="ints" value={form.interests ?? []} onChange={(v) => set('interests', v)} placeholder="e.g. robotics, sketching" />
          </Field>
          <Field label="Activities outside class" htmlFor="extras">
            <ChipInput id="extras" value={form.extracurriculars ?? []} onChange={(v) => set('extracurriculars', v)} placeholder="e.g. science club, football" />
          </Field>
        </Card>
      </Section>

      <Section title="Where you would study and work">
        <Card className="space-y-5">
          <div>
            <div className="text-sm font-medium" id="regions-label">Places you would like</div>
            <p className="text-xs text-muted">Pick any. We look at jobs and colleges there.</p>
            {regions.isLoading ? (
              <Skeleton className="mt-3 h-20" />
            ) : regions.error ? (
              <div className="mt-3"><ErrorState error={regions.error} onRetry={() => void regions.refetch()} title="Places did not load" /></div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-labelledby="regions-label">
                {regionList.map((r) => {
                  const on = (form.preferred_regions ?? []).includes(r.code)
                  return (
                    <button
                      key={r.code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set('preferred_regions', on ? (form.preferred_regions ?? []).filter((c) => c !== r.code) : [...(form.preferred_regions ?? []), r.code])}
                      className={cx(
                        'min-h-[44px] rounded-xl px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        on ? 'bg-primary/20 text-ink ring-1 ring-primary' : 'bg-surface-2 text-muted hairline hover:text-ink',
                      )}
                    >
                      {r.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <Slider id="reloc" label="Moving to another city" value={form.willing_to_relocate} onChange={(v) => set('willing_to_relocate', v)} low="Stay home" high="Happy to move" />
          <Slider id="abroad" label="Studying or working abroad" value={form.willing_abroad} onChange={(v) => set('willing_abroad', v)} low="Not for me" high="Very keen" />
        </Card>
      </Section>

      <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
        <Button type="submit" size="lg" magnetic loading={save.isPending} icon={<Save className="h-4 w-4" />}>
          Save details
        </Button>
      </div>
    </form>
  )
}

function Slider({ id, label, value, onChange, low, high }: { id: string; label: string; value: number; onChange: (v: number) => void; low: string; high: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <span className="num text-sm text-muted">{Math.round(value * 100)}%</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-11 w-full cursor-pointer accent-[rgb(var(--primary))]"
        aria-valuetext={`${Math.round(value * 100)}%`}
      />
      <div className="flex justify-between text-xs text-muted">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  )
}
