// Counsellor dashboard: assigned students sorted by urgency, plus adding consented local mentors.
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronRight, GraduationCap, Search, UserPlus, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { catalog, educator, mentors } from '@/api/endpoints'
import type { DashboardRow, FlagSeverity, MentorIn, MentorOut } from '@/api/types'
import { ApiError } from '@/api/client'
import { Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, PageSkeleton, Section, Segmented, Select, Skeleton, cx, useToast } from '@/components/ui'
import { BandPill } from '@/components/score'
import { formatDate } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { SEVERITY, SeverityChip, humanKey } from '@/components/system/shared'
import type { ConflictBand } from '@/api/types'

const SEVS: FlagSeverity[] = ['urgent', 'warn', 'info']
type Filter = 'all' | FlagSeverity

function worst(r: DashboardRow): number {
  return r.flags.reduce((m, f) => Math.min(m, SEVERITY[f.severity]?.order ?? 3), 3)
}

export default function Counsellor() {
  const q = useQuery({ queryKey: ['educator', 'dashboard'], queryFn: educator.dashboard })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const navigate = useNavigate()
  const { reducedMotion } = useSettings()

  const rows = useMemo(() => {
    const list = [...(q.data?.students ?? [])].sort((a, b) => worst(a) - worst(b) || b.flags.length - a.flags.length || a.display_name.localeCompare(b.display_name))
    const s = search.trim().toLowerCase()
    return list.filter(
      (r) =>
        (!s || r.display_name.toLowerCase().includes(s) || (r.top_career ?? '').toLowerCase().includes(s)) &&
        (filter === 'all' || r.flags.some((f) => f.severity === filter)),
    )
  }, [q.data, search, filter])

  if (q.isLoading) return <PageSkeleton />
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load your students" />
  const d = q.data!

  return (
    <div>
      <PageHeader
        eyebrow="Counsellor"
        title="Your students"
        subtitle={`Who needs you first, as of ${formatDate(d.as_of)}. Family money is never shown here.`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">Students</div>
          <div className="num mt-1 text-3xl font-semibold">{d.students.length}</div>
        </Card>
        {SEVS.map((s, i) => {
          const meta = SEVERITY[s]
          const Icon = meta.icon
          const n = d.flag_counts[s] ?? 0
          return (
            <motion.button
              key={s}
              type="button"
              onClick={() => setFilter(filter === s ? 'all' : s)}
              aria-pressed={filter === s}
              className={cx('card p-4 text-left transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon', filter === s && 'shadow-glow')}
              initial={reducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider" style={{ color: meta.color }}>
                <Icon className="h-3.5 w-3.5" aria-hidden /> {meta.label}
              </div>
              <div className="num mt-1 text-3xl font-semibold">{n}</div>
              <div className="text-xs text-muted">{n === 1 ? 'flag' : 'flags'}</div>
            </motion.button>
          )
        })}
      </div>

      <Section title="Students" className="mt-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search students</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or career" className="pl-9" />
          </label>
          <div className="no-scrollbar overflow-x-auto">
            <Segmented<Filter>
              label="Filter by flag"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'urgent', label: 'Urgent' },
                { value: 'warn', label: 'Check soon' },
                { value: 'info', label: 'Info' },
              ]}
            />
          </div>
        </div>

        {d.students.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No students assigned yet">
            When a school links students to you, they appear here with anything that needs attention.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Search className="h-6 w-6" />} title="No students match" action={<Button variant="secondary" onClick={() => { setSearch(''); setFilter('all') }}>Clear filters</Button>}>
            Try a different name or show all flags.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {rows.map((r, i) => (
              <motion.li key={r.student_id} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.04 }}>
                <button
                  type="button"
                  onClick={() => navigate(`/results?student=${encodeURIComponent(r.student_id)}`)}
                  className="card group flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon md:flex-row md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3 md:w-56">
                    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                      {r.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.display_name}</div>
                      <div className="text-xs text-muted">{r.grade ? `Grade ${r.grade}` : 'Grade not set'}</div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted">Top career</div>
                    <div className="truncate text-sm font-medium">{r.top_career ?? 'No results yet'}</div>
                    <div className="text-xs text-muted">{r.latest_run_at ? `Last run ${formatDate(r.latest_run_at)}` : 'Has not run an analysis'}</div>
                  </div>
                  <div className="md:w-44">{r.conflict_band ? <BandPill value={r.conflict_band as ConflictBand} /> : <span className="text-xs text-muted">No family view yet</span>}</div>
                  <div className="flex flex-wrap gap-1.5 md:w-[34%] md:justify-end">
                    {r.flags.length ? r.flags.map((f) => <SeverityChip key={f.code} severity={f.severity}>{f.message}</SeverityChip>) : <span className="text-xs text-ok">Nothing flagged</span>}
                  </div>
                  <ChevronRight className="hidden h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 md:block" aria-hidden />
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </Section>

      <MentorSection />
    </div>
  )
}

// ---------------------------------------------------------------- mentors
function MentorSection() {
  const careers = useQuery({ queryKey: ['catalog', 'careers', 'all'], queryFn: () => catalog.careers({ page_size: 100 }), staleTime: 10 * 60_000 })
  const regions = useQuery({ queryKey: ['catalog', 'regions'], queryFn: catalog.regions, staleTime: 10 * 60_000 })
  const toast = useToast()
  const empty = { display_name: '', career_id: '', region_code: '', district: '', organisation: '', languages: 'English, Tamil', bio: '', consent_on: '', verified_by: '' }
  const [f, setF] = useState(empty)
  const [added, setAdded] = useState<MentorOut[]>([])
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))
  const create = useMutation({
    mutationFn: (body: MentorIn) => mentors.create(body),
    onSuccess: (m) => {
      setAdded((a) => [m, ...a])
      setF(empty)
      toast('ok', `${m.display_name} added to the mentor list`)
    },
  })
  const errs = create.error instanceof ApiError ? create.error.details : {}
  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate({
      display_name: f.display_name.trim(),
      career_id: f.career_id,
      region_code: f.region_code,
      district: f.district.trim(),
      organisation: f.organisation.trim() || null,
      languages: f.languages.split(',').map((s) => s.trim()).filter(Boolean),
      bio: f.bio.trim(),
      consent_on: f.consent_on,
      verified_by: f.verified_by.trim(),
    })
  }
  const loading = careers.isLoading || regions.isLoading
  return (
    <Section title="Add a mentor" subtitle="Local people students can talk to about a career." className="mt-10">
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <p className="mb-4 rounded-xl bg-primary/10 p-3 text-sm">
            Only add people who have <strong>agreed in writing</strong> to be listed. PRISM never lists anyone without their consent; record the date they signed and who checked it.
          </p>
          {loading ? (
            <Skeleton className="h-72" />
          ) : careers.error || regions.error ? (
            <ErrorState error={careers.error ?? regions.error} onRetry={() => { void careers.refetch(); void regions.refetch() }} title="Could not load careers and regions" />
          ) : (
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Mentor's name" htmlFor="m-name">
                <Input id="m-name" required minLength={2} value={f.display_name} onChange={set('display_name')} />
              </Field>
              <Field label="Career" htmlFor="m-career">
                <Select id="m-career" required value={f.career_id} onChange={set('career_id')}>
                  <option value="">Choose a career</option>
                  {careers.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Region" htmlFor="m-region">
                <Select id="m-region" required value={f.region_code} onChange={set('region_code')}>
                  <option value="">Choose a region</option>
                  {regions.data?.map((r) => <option key={r.code} value={r.code}>{r.name}{r.state ? `, ${r.state}` : ''}</option>)}
                </Select>
              </Field>
              <Field label="District" htmlFor="m-district">
                <Input id="m-district" required value={f.district} onChange={set('district')} />
              </Field>
              <Field label="Organisation (optional)" htmlFor="m-org">
                <Input id="m-org" value={f.organisation} onChange={set('organisation')} />
              </Field>
              <Field label="Languages" hint="Separate with commas" htmlFor="m-lang">
                <Input id="m-lang" value={f.languages} onChange={set('languages')} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Short bio" hint="What they do and how they can help a student" htmlFor="m-bio">
                  <textarea id="m-bio" required minLength={10} rows={3} value={f.bio} onChange={set('bio')} className="w-full rounded-xl bg-surface-2 p-3 text-[15px] hairline focus:outline-none focus-visible:ring-2 focus-visible:ring-neon" />
                </Field>
              </div>
              <Field label="Date they agreed in writing" hint="Day they signed" htmlFor="m-consent">
                <Input id="m-consent" type="date" lang="en-IN" required value={f.consent_on} onChange={set('consent_on')} />
              </Field>
              <Field label="Checked by" hint="Your name or the school's" htmlFor="m-ver">
                <Input id="m-ver" required value={f.verified_by} onChange={set('verified_by')} />
              </Field>
              {create.error && (
                <div className="sm:col-span-2">
                  <ErrorState error={create.error} title="Could not add the mentor" />
                  {errs && typeof errs === 'object' && Object.keys(errs).length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                      {Object.entries(errs as Record<string, unknown>).map(([k, v]) => (
                        <li key={k}>
                          <span className="font-medium text-ink">{humanKey(k.split('.').pop() ?? k)}</span>: {Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : JSON.stringify(v)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" loading={create.isPending} icon={<UserPlus className="h-4 w-4" />}>
                  Add mentor
                </Button>
              </div>
            </form>
          )}
        </Card>
        <Card className="h-fit">
          <h3 className="mb-3 font-semibold">Added this session</h3>
          {added.length === 0 ? (
            <p className="text-sm text-muted">Mentors you add appear here and in the directory students see on career pages.</p>
          ) : (
            <ul className="space-y-3">
              {added.map((m) => (
                <li key={m.id} className="rounded-xl bg-surface-2 p-3 hairline">
                  <div className="flex items-center gap-2 font-medium">
                    <GraduationCap className="h-4 w-4 text-neon" aria-hidden /> {m.display_name}
                  </div>
                  <div className="text-xs text-muted">
                    {m.career.name} · {m.district}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Section>
  )
}
