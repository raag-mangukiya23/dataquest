import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ChevronRight, List, Orbit, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { catalog } from '@/api/endpoints'
import type { CareerSummary } from '@/api/types'
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Skeleton, TabPanel, Tabs, cx } from '@/components/ui'
import { pct, sectorLabel } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { Galaxy } from '@/components/explore/Galaxy'
import { CareerSheet } from '@/components/explore/CareerSheet'
import { MarketPanel } from '@/components/explore/MarketPanel'
import { NearYou } from '@/components/explore/NearYou'
import { STEAM, exploreKeys, sectorColor, useAllCareers, useMediaQuery, useMyProfile, useRecommendations } from '@/components/explore/shared'

type Tab = 'galaxy' | 'market' | 'near'
const TABS: { value: Tab; label: string }[] = [
  { value: 'galaxy', label: 'Galaxy' },
  { value: 'market', label: 'Market' },
  { value: 'near', label: 'Near you' },
]

export default function Explore() {
  const { careerId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'galaxy') as Tab
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params)
    if (t === 'galaxy') p.delete('tab')
    else p.set('tab', t)
    setParams(p, { replace: true })
  }

  const careers = useAllCareers()
  const regions = useQuery({ queryKey: exploreKeys.regions, queryFn: catalog.regions, staleTime: 30 * 60_000 })
  const me = useMyProfile()
  const recs = useRecommendations()
  const recRank = useMemo(() => new Map(recs.recs.map((r) => [r.career.id, r.rank])), [recs.recs])

  const [region, setRegion] = useState<string>('')
  useEffect(() => {
    if (region || !regions.data) return
    const mine = me.data?.region_code
    const pick = mine && regions.data.some((r) => r.code === mine) ? mine : regions.data.some((r) => r.code === 'IN-TN-CHN') ? 'IN-TN-CHN' : regions.data[0]?.code
    if (pick) setRegion(pick)
  }, [regions.data, me.data, region])
  const regionName = (code: string) => regions.data?.find((r) => r.code === code)?.name ?? code

  const openCareer = (c: { slug: string }) => navigate({ pathname: `/explore/${c.slug}`, search: location.search })
  const closeCareer = () => navigate({ pathname: '/explore', search: location.search })
  const openRec = careerId ? recs.recs.find((r) => r.career.slug === careerId || r.career.id === careerId) : undefined

  return (
    <div>
      <PageHeader
        eyebrow="Explore"
        title={<>Every career, <span className="spectrum-text">one sky</span></>}
        subtitle="Wander through careers grouped by field. Bigger stars have more openings across India. Tap any star to see what the work is like, what it pays and how to get there."
      />
      <Tabs value={tab} onValueChange={setTab} tabs={TABS} label="Explore views">
        <TabPanel value="galaxy" className="outline-none">
          <GalaxyView careers={careers} recRank={recRank} hasRun={recs.recs.length > 0} onPick={openCareer} focusSlug={careerId} />
        </TabPanel>
        <TabPanel value="market" className="outline-none">
          {regions.isLoading ? (
            <Skeleton className="h-80" />
          ) : regions.isError ? (
            <ErrorState error={regions.error} onRetry={() => void regions.refetch()} />
          ) : !regions.data?.length ? (
            <EmptyState title="No regions available">Please check back later.</EmptyState>
          ) : (
            <MarketPanel regions={regions.data} region={region} onRegion={setRegion} />
          )}
        </TabPanel>
        <TabPanel value="near" className="outline-none">
          <NearYou defaultPincode={me.data?.pincode} />
        </TabPanel>
      </Tabs>
      <CareerSheet slug={careerId} open={!!careerId} onClose={closeCareer} rec={openRec} regionName={regionName} />
    </div>
  )
}

function GalaxyView({
  careers,
  recRank,
  hasRun,
  onPick,
  focusSlug,
}: {
  careers: ReturnType<typeof useAllCareers>
  recRank: Map<string, number>
  hasRun: boolean
  onPick: (c: CareerSummary) => void
  focusSlug?: string
}) {
  const { reducedMotion } = useSettings()
  const wide = useMediaQuery('(min-width: 640px)')
  const [forceGalaxy, setForceGalaxy] = useState(false)
  const [q, setQ] = useState('')
  const [sector, setSector] = useState<string | null>(null)
  const [steam, setSteam] = useState<string | null>(null)
  const [onlyMine, setOnlyMine] = useState(false)

  const items = useMemo(() => careers.data?.items ?? [], [careers.data])
  const sectors = useMemo(() => [...new Set(items.map((c) => c.sector))].sort(), [items])
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return new Set(
      items
        .filter((c) => (!sector || c.sector === sector) && (!steam || (c.steam_tags ?? []).includes(steam)) && (!onlyMine || recRank.has(c.id)))
        .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.short_description.toLowerCase().includes(needle) || sectorLabel(c.sector).toLowerCase().includes(needle))
        .map((c) => c.id),
    )
  }, [items, q, sector, steam, onlyMine, recRank])

  if (careers.isLoading)
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading careers">
        <Skeleton className="h-11 max-w-md" />
        <Skeleton className="aspect-[16/10] w-full" />
      </div>
    )
  if (careers.isError) return <ErrorState error={careers.error} onRetry={() => void careers.refetch()} title="We could not load the careers" />
  if (!items.length)
    return (
      <EmptyState icon={<Orbit className="h-6 w-6" />} title="No careers in the catalogue yet">
        Ask your counsellor to load the career catalogue, then come back.
      </EmptyState>
    )

  const showGalaxy = wide || forceGalaxy
  const filtered = items.filter((c) => matches.has(c.id)).sort((a, b) => (recRank.get(a.id) ?? 999) - (recRank.get(b.id) ?? 999) || (b.national_demand_index ?? 0) - (a.national_demand_index ?? 0))
  const anyFilter = q || sector || steam || onlyMine

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search careers" placeholder="Search careers, e.g. design, doctor, drones" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="STEAM filter">
          {Object.entries(STEAM).map(([k, v]) => (
            <Chip key={k} active={steam === k} onClick={() => setSteam(steam === k ? null : k)} color={v.color}>
              {v.label}
            </Chip>
          ))}
          {hasRun && (
            <Chip active={onlyMine} onClick={() => setOnlyMine(!onlyMine)} color="rgb(var(--neon))">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> My matches
            </Chip>
          )}
        </div>
      </div>
      <div className="no-scrollbar flex min-w-0 gap-1.5 overflow-x-auto pb-1 md:flex-wrap" role="group" aria-label="Sector filter">
        <Chip active={!sector} onClick={() => setSector(null)}>
          All fields
        </Chip>
        {sectors.map((s) => (
          <Chip key={s} active={sector === s} onClick={() => setSector(sector === s ? null : s)} color={sectorColor(s, sectors)}>
            {sectorLabel(s)}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted" aria-live="polite">
        <span>
          <span className="num text-ink">{matches.size}</span> of <span className="num">{items.length}</span> careers
          {hasRun && (
            <>
              {' · '}
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-neon" aria-hidden /> your top matches
              </span>
            </>
          )}
        </span>
        <div className="flex gap-2">
          {anyFilter && (
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="h-4 w-4" />}
              onClick={() => {
                setQ('')
                setSector(null)
                setSteam(null)
                setOnlyMine(false)
              }}
            >
              Clear filters
            </Button>
          )}
          {!wide && (
            <Button variant="secondary" size="sm" className="min-h-[44px]" icon={forceGalaxy ? <List className="h-4 w-4" /> : <Orbit className="h-4 w-4" />} onClick={() => setForceGalaxy(!forceGalaxy)}>
              {forceGalaxy ? 'Show list' : 'Show galaxy'}
            </Button>
          )}
        </div>
      </div>

      {showGalaxy ? (
        <motion.div initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <Galaxy careers={items} sectors={sectors} matches={matches} recIds={recRank} onPick={onPick} focusSlug={focusSlug} />
        </motion.div>
      ) : null}

      {(!wide && !forceGalaxy) || (wide && anyFilter) ? (
        filtered.length === 0 ? (
          <EmptyState icon={<Search className="h-6 w-6" />} title="No careers match">
            Try a shorter word or clear a filter.
          </EmptyState>
        ) : (
          <ul className={cx('grid grid-cols-1 gap-2', wide && 'sm:grid-cols-2 lg:grid-cols-3')}>
            {filtered.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onPick(c)} className="flex min-h-[60px] w-full items-center gap-3 rounded-xl bg-surface p-3 text-left hairline hover:bg-surface-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: sectorColor(c.sector, sectors), boxShadow: recRank.has(c.id) ? '0 0 0 3px rgb(var(--neon) / 0.6)' : undefined }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate font-medium">{c.name}</span>
                      {recRank.has(c.id) && <Badge color="rgb(var(--neon))">Match #{recRank.get(c.id)}</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {sectorLabel(c.sector)}
                      {c.national_demand_index != null && <> · demand {pct(c.national_demand_index)}</>}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}

function Chip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx('inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors hairline', active ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink')}
      style={active && color ? { color, boxShadow: `inset 0 0 0 1px ${color}`, background: `color-mix(in srgb, ${color} 14%, transparent)` } : undefined}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </button>
  )
}
