// Everything about one career: description, salary bands, skills, courses, alternatives, mentors.
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Briefcase, Orbit, GraduationCap, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { catalog, mentors } from '@/api/endpoints'
import { Badge, Button, Dialog, EmptyState, ErrorState, InfoTip, Skeleton, Term } from '@/components/ui'
import { Meter, ProvenanceBadge } from '@/components/score'
import { formatINR, pct, sectorLabel } from '@/lib/format'
import type { CareerDetail, Recommendation } from '@/api/types'
import { exploreKeys, STEAM } from './shared'

const RIASEC: [string, string][] = [
  ['riasec_r', 'Hands-on'],
  ['riasec_i', 'Curious'],
  ['riasec_a', 'Creative'],
  ['riasec_s', 'Helping'],
  ['riasec_e', 'Leading'],
  ['riasec_c', 'Organising'],
]

export function CareerSheet({ slug, open, onClose, rec, regionName }: { slug?: string; open: boolean; onClose: () => void; rec?: Recommendation; regionName: (code: string) => string }) {
  const q = useQuery({
    queryKey: exploreKeys.career(slug),
    enabled: !!slug,
    queryFn: () => catalog.career(slug!),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  })
  const c = q.data
  const notFound = q.error instanceof ApiError && q.error.status === 404
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title={c?.name ?? (notFound ? 'Career not found' : q.isError ? 'Something went wrong' : 'Loading career…')} description={c ? `${sectorLabel(c.sector)} · ${c.short_description}` : undefined} wide>
      {q.isLoading && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </div>
      )}
      {notFound && (
        <EmptyState icon={<Orbit className="h-6 w-6" />} title="We couldn't find that career" action={<Button onClick={onClose}>Back to galaxy</Button>}>
          The link may be old or mistyped. Every career we know is in the galaxy.
        </EmptyState>
      )}
      {q.isError && !notFound && <ErrorState error={q.error} onRetry={() => void q.refetch()} title="We could not open this career" />}
      {c && <SheetBody c={c} rec={rec} regionName={regionName} />}
    </Dialog>
  )
}

function SheetBody({ c, rec, regionName }: { c: CareerDetail; rec?: Recommendation; regionName: (code: string) => string }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(c.steam_tags ?? []).map((t) => (
          <Badge key={t} color={STEAM[t]?.color}>
            {STEAM[t]?.label ?? t}
          </Badge>
        ))}
        {rec && (
          <Link to={`/results/${c.slug}`} className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary/15 px-3 text-sm font-semibold text-primary hover:bg-primary/25">
            <Sparkles className="h-4 w-4" aria-hidden /> Your match #{rec.rank}: see why <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>

      {c.long_description && c.long_description.trim() !== c.short_description.trim() && <p className="text-[15px] leading-relaxed">{c.long_description}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-surface-2 p-3 hairline">
          <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden /> How people start
          </div>
          <div className="mt-1 text-sm">{c.typical_entry_education}</div>
        </div>
        <div className="rounded-xl bg-surface-2 p-3 hairline">
          <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted">
            Demand in India <InfoTip text="How many openings there are for this career across India, from 0 (few) to 100 (many)." />
          </div>
          <div className="num mt-1 text-xl font-semibold">{c.national_demand_index == null ? '—' : pct(c.national_demand_index)}</div>
          {c.national_demand_index != null && <Meter value={c.national_demand_index} color="rgb(var(--market))" className="mt-2" label="National demand" />}
        </div>
        <div className="rounded-xl bg-surface-2 p-3 hairline">
          <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted">
            <Term id="disruption">Automation risk</Term>
          </div>
          <div className="num mt-1 text-xl font-semibold">{pct(c.automation_risk)}</div>
          <Meter value={c.automation_risk} color="rgb(var(--disrupt))" className="mt-2" label="Automation risk" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">
            Who enjoys it <InfoTip term="riasec" />
          </h3>
          <ul className="space-y-1.5">
            {RIASEC.map(([k, label]) => {
              const v = c.riasec_profile[k]
              if (v == null) return null
              return (
                <li key={k} className="grid grid-cols-[88px_1fr_36px] items-center gap-2 text-sm">
                  <span className="text-muted">{label}</span>
                  <Meter value={v} color="rgb(var(--fit))" label={label} />
                  <span className="num text-right text-xs text-muted">{Math.round(v * 100)}</span>
                </li>
              )
            })}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Skills you will use</h3>
          {c.skills.length === 0 ? (
            <p className="text-sm text-muted">No skills listed yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {[...c.skills]
                .sort((a, b) => b.importance - a.importance)
                .map((s) => (
                  <span key={s.skill} title={`Importance ${pct(s.importance)}`} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs hairline">
                    {s.skill}
                    <span className="num text-muted">{Math.round(s.importance * 100)}</span>
                  </span>
                ))}
            </div>
          )}
          {(c.day_in_life ?? []).length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-sm font-semibold">A day in the life</h3>
              <ol className="space-y-1.5 text-sm">
                {c.day_in_life!.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] text-primary">{i + 1}</span>
                    {d}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">What people earn (yearly, middle of the range)</h3>
        {c.salary_bands.length === 0 ? (
          <p className="text-sm text-muted">No salary data for this career yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl hairline">
            <table className="w-full min-w-[460px] text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Where</th>
                  <th className="px-3 py-2 text-right font-medium">Starting</th>
                  <th className="px-3 py-2 text-right font-medium">5–10 yrs</th>
                  <th className="px-3 py-2 text-right font-medium">Senior</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Source</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.salary_bands.map((b) => (
                  <tr key={b.region_code} className="border-t border-[rgb(var(--ink)/0.06)]">
                    <td className="px-3 py-2">{regionName(b.region_code)}</td>
                    <td className="num px-3 py-2 text-right">{formatINR(b.entry_p50, { compact: true })}</td>
                    <td className="num px-3 py-2 text-right">{formatINR(b.mid_p50, { compact: true })}</td>
                    <td className="num px-3 py-2 text-right">{formatINR(b.senior_p50, { compact: true })}</td>
                    <td className="px-3 py-2 text-right">
                      <ProvenanceBadge p={b.provenance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {c.related_exam_codes.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-muted">
            Entrance exams:
            {c.related_exam_codes.map((e) => (
              <Link key={e} to="/exams" className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink hairline hover:text-primary">
                {e.replace(/_/g, ' ')}
              </Link>
            ))}
          </p>
        )}
      </div>

      <Pathways careerId={c.id} />
      <Alternatives slug={c.slug} />
      <Mentors careerId={c.id} />
    </div>
  )
}

function Pathways({ careerId }: { careerId: string }) {
  const q = useQuery({ queryKey: ['catalog', 'pathways', careerId], queryFn: () => catalog.pathways({ career_id: careerId }) })
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Courses that lead here</h3>
      {q.isLoading && <Skeleton className="h-24" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && q.data.items.length === 0 && <p className="text-sm text-muted">We have no courses listed for this career yet. Ask your counsellor for local options.</p>}
      {q.data && q.data.items.length > 0 && (
        <ul className="space-y-2">
          {q.data.items.map((p) => (
            <li key={p.id} className="rounded-xl bg-surface-2 p-3 hairline">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{p.course}</div>
                  <div className="text-sm text-muted">
                    {p.institution.name}, {p.institution.city}
                  </div>
                </div>
                <ProvenanceBadge p={p.provenance} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span>
                  <span className="num font-semibold">{formatINR(p.tuition_per_year)}</span>
                  <span className="text-muted"> fees a year ({p.fee_academic_year}–{String((p.fee_academic_year + 1) % 100).padStart(2, '0')})</span>
                </span>
                <span className="text-muted">
                  <span className="num">{formatINR(p.tuition_per_year + p.hostel_per_year + p.living_per_year + p.misc_per_year, { compact: true })}</span> with hostel and living
                </span>
                <Badge className="bg-surface-2 hairline">
                  <Term id="quota">{p.quota.charAt(0).toUpperCase() + p.quota.slice(1)} quota</Term>
                </Badge>
                <span className="text-muted">{p.duration_years} years</span>
                {p.entrance_exam_codes.length > 0 && <span className="text-muted">via {p.entrance_exam_codes.map((e) => e.replace(/_/g, ' ')).join(', ')}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Alternatives({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: ['catalog', 'alternatives', slug], queryFn: () => catalog.alternatives(slug) })
  if (q.isLoading) return <Skeleton className="h-16" />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data?.length) return null
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Close cousins of this career</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {q.data.map((a) => (
          <Link key={a.career.id} to={`/explore/${a.career.slug}`} className="group rounded-xl bg-surface-2 p-3 hairline hover:ring-1 hover:ring-primary/50">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium group-hover:text-primary">{a.career.name}</span>
              {a.interdisciplinary && <Badge color="rgb(var(--family))">Cross-field</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">{a.why}</p>
            <div className="mt-2 text-xs text-muted">
              <span className="num">{pct(a.skill_overlap)}</span> skills in common
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Mentors({ careerId }: { careerId: string }) {
  const q = useQuery({ queryKey: ['mentors', careerId], queryFn: () => mentors.list({ career_id: careerId }) })
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Users className="h-4 w-4" aria-hidden /> Talk to someone who does this
      </h3>
      {q.isLoading && <Skeleton className="h-16" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && q.data.items.length === 0 && (
        <EmptyState icon={<Briefcase className="h-6 w-6" />} title="No mentors listed yet">
          {q.data.notice}
        </EmptyState>
      )}
      {q.data && q.data.items.length > 0 && (
        <>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {q.data.items.map((m) => (
              <li key={m.id} className="rounded-xl bg-surface-2 p-3 hairline">
                <div className="font-medium">{m.display_name}</div>
                <div className="text-xs text-muted">
                  {[m.organisation, m.district].filter(Boolean).join(' · ')} · {m.languages.join(', ')}
                </div>
                <p className="mt-1 text-sm">{m.bio}</p>
                <div className="mt-1 text-sm text-primary">{m.contact}</div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{q.data.notice}</p>
        </>
      )}
    </div>
  )
}
