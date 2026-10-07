// The career galaxy: every career is a star, grouped into one nebula per sector. Pure SVG, deterministic layout.
import { animate } from 'motion/react'
import { Crosshair, Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import type { CareerSummary } from '@/api/types'
import { sectorLabel } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { sectorColor } from './shared'

interface Star {
  c: CareerSummary
  x: number
  y: number
  r: number
  demand: number
}
interface Cluster {
  sector: string
  x: number
  y: number
  radius: number
  /** label anchor, placed outward from the galaxy centre so it never sits inside a neighbouring nebula */
  lx: number
  ly: number
  anchor: 'start' | 'middle' | 'end'
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const SPACING = 26

export function layoutGalaxy(careers: CareerSummary[], sectors: string[]) {
  const n = sectors.length
  const groups = sectors.map((s) => careers.filter((c) => c.sector === s).sort((a, b) => a.slug.localeCompare(b.slug)))
  const maxSize = Math.max(1, ...groups.map((g) => g.length))
  const ring = n <= 1 ? 0 : Math.max(240, (SPACING * Math.sqrt(maxSize) * 3.1 * n) / (2 * Math.PI))
  const stars: Star[] = []
  const clusters: Cluster[] = []
  sectors.forEach((sector, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2
    const cx = Math.cos(a) * ring
    const cy = Math.sin(a) * ring
    const g = groups[i]
    g.forEach((c, k) => {
      const rr = SPACING * Math.sqrt(k + 0.6)
      const t = k * GOLDEN + i
      const demand = c.national_demand_index ?? 0.5
      stars.push({ c, x: cx + Math.cos(t) * rr, y: cy + Math.sin(t) * rr, r: 3 + demand * 7, demand })
    })
    const spread = SPACING * Math.sqrt(Math.max(0, g.length - 1) + 0.6) + 12
    const ux = n <= 1 ? 0 : Math.cos(a)
    const uy = n <= 1 ? -1 : Math.sin(a)
    const anchor = ux > 0.35 ? 'start' : ux < -0.35 ? 'end' : 'middle'
    clusters.push({ sector, x: cx, y: cy, radius: spread + 18, lx: cx + ux * (spread + 10), ly: cy + uy * (spread + 10) + (uy > 0.35 ? 12 : uy < -0.35 ? -2 : 5), anchor })
  })
  // room for the longest outward labels on the left and right
  return { stars, clusters, extent: ring + SPACING * Math.sqrt(maxSize) + 150 }
}

interface Cam {
  x: number
  y: number
  z: number
}

export function Galaxy({
  careers,
  sectors,
  matches,
  recIds,
  onPick,
  focusSlug,
}: {
  careers: CareerSummary[]
  sectors: string[]
  /** ids that pass the current filters (others are dimmed) */
  matches: Set<string>
  /** the student's recommendations: id -> rank */
  recIds: Map<string, number>
  onPick: (c: CareerSummary) => void
  focusSlug?: string
}) {
  const { reducedMotion } = useSettings()
  const { stars, clusters, extent } = useMemo(() => layoutGalaxy(careers, sectors), [careers, sectors])
  const home: Cam = useMemo(() => ({ x: 0, y: 0, z: 1 }), [])
  const [cam, setCam] = useState<Cam>(home)
  const camRef = useRef(cam)
  camRef.current = cam
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<string | null>(null)
  const anim = useRef<{ stop: () => void } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ moved: number; pinch?: number } | null>(null)

  const size = extent * 2
  const vw = size / cam.z
  const viewBox = `${cam.x - vw / 2} ${cam.y - vw / 2} ${vw} ${vw}`

  const clampZ = (z: number) => Math.min(6, Math.max(0.6, z))
  const flyTo = (to: Cam, ms = 700) => {
    anim.current?.stop()
    if (reducedMotion) {
      setCam(to)
      return
    }
    const from = camRef.current
    anim.current = animate(0, 1, {
      duration: ms / 1000,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (t) => setCam({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z * Math.pow(to.z / from.z, t) }),
    })
  }

  // fly to the star named in the route
  useEffect(() => {
    if (!focusSlug) return
    const s = stars.find((st) => st.c.slug === focusSlug)
    if (s) flyTo({ x: s.x, y: s.y, z: 2.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSlug, stars])

  // wheel zoom (non-passive so the page does not scroll)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      anim.current?.stop()
      setCam((c) => ({ ...c, z: clampZ(c.z * Math.exp(-e.deltaY * 0.0015)) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const unitsPerPx = () => {
    const el = svgRef.current
    if (!el) return 1
    return vw / Math.min(el.clientWidth, el.clientHeight || el.clientWidth)
  }
  const onDown = (e: RPointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      drag.current = { moved: 99, pinch: Math.hypot(a.x - b.x, a.y - b.y) }
    } else drag.current = { moved: 0 }
  }
  const onMove = (e: RPointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !drag.current) return
    const next = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, next)
    if (pointers.current.size === 2 && drag.current.pinch) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const ratio = d / drag.current.pinch
      drag.current.pinch = d
      setCam((c) => ({ ...c, z: clampZ(c.z * ratio) }))
      return
    }
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    drag.current.moved += Math.abs(dx) + Math.abs(dy)
    if (drag.current.moved > 4) {
      if (!(e.target as Element).hasPointerCapture?.(e.pointerId)) (e.currentTarget as Element).setPointerCapture(e.pointerId)
      anim.current?.stop()
      const u = unitsPerPx()
      setCam((c) => ({ ...c, x: c.x - dx * u, y: c.y - dy * u }))
    }
  }
  const onUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) setTimeout(() => (drag.current = null), 0)
  }
  const pick = (s: Star) => {
    if (drag.current && drag.current.moved > 4) return
    flyTo({ x: s.x, y: s.y, z: 2.6 })
    onPick(s.c)
  }

  const hovered = hover ? stars.find((s) => s.c.id === hover) : undefined
  const labelScale = 1 / cam.z

  return (
    <div className="relative overflow-hidden rounded-2xl hairline" style={{ background: 'radial-gradient(ellipse at center, rgb(var(--surface-2) / 0.6), rgb(var(--bg)) 75%)' }}>
      <style>{`
        @keyframes prism-twinkle { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
        @keyframes prism-pulse { 0% { transform: scale(1); opacity: .9 } 100% { transform: scale(2.6); opacity: 0 } }
        .prism-twinkle { animation: prism-twinkle var(--tw, 3s) ease-in-out infinite; }
        .prism-pulse { transform-box: fill-box; transform-origin: center; animation: prism-pulse 2.4s ease-out infinite; }
      `}</style>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        role="img"
        aria-label={`Career galaxy with ${careers.length} careers in ${sectors.length} sectors. Use the list view or the stars' buttons to open a career.`}
        className="block aspect-[16/10] w-full max-h-[70vh] cursor-grab touch-none select-none active:cursor-grabbing"
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      >
        <defs>
          {clusters.map((cl) => (
            <radialGradient key={cl.sector} id={`neb-${cl.sector}`}>
              <stop offset="0%" stopColor={sectorColor(cl.sector, sectors)} stopOpacity={0.28} />
              <stop offset="60%" stopColor={sectorColor(cl.sector, sectors)} stopOpacity={0.08} />
              <stop offset="100%" stopColor={sectorColor(cl.sector, sectors)} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>
        {clusters.map((cl) => (
          <g key={cl.sector}>
            <circle cx={cl.x} cy={cl.y} r={cl.radius * 1.35} fill={`url(#neb-${cl.sector})`} />
            <text
              x={cl.lx}
              y={cl.ly}
              textAnchor={cl.anchor}
              fill={sectorColor(cl.sector, sectors)}
              style={{ fontSize: Math.max(10, 19 * labelScale), fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}
              opacity={0.85}
            >
              {sectorLabel(cl.sector)}
            </text>
          </g>
        ))}
        {stars.map((s, i) => {
          const on = matches.has(s.c.id)
          const rank = recIds.get(s.c.id)
          const color = sectorColor(s.c.sector, sectors)
          return (
            <g
              key={s.c.id}
              role="button"
              tabIndex={on ? 0 : -1}
              aria-label={`${s.c.name}${rank ? `, your match number ${rank}` : ''}`}
              className="cursor-pointer outline-none [&:focus-visible>circle.core]:stroke-[rgb(var(--ink))]"
              style={{ opacity: on ? 1 : 0.14, transition: 'opacity 250ms' }}
              onPointerEnter={() => setHover(s.c.id)}
              onPointerLeave={() => setHover((h) => (h === s.c.id ? null : h))}
              onFocus={() => setHover(s.c.id)}
              onBlur={() => setHover(null)}
              onClick={() => on && pick(s)}
              onKeyDown={(e) => {
                if (on && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  pick(s)
                }
              }}
            >
              {rank && !reducedMotion && <circle className="prism-pulse" cx={s.x} cy={s.y} r={s.r + 2} fill="none" stroke="rgb(var(--neon))" strokeWidth={1.5} style={{ animationDelay: `${(rank % 5) * 0.4}s` }} />}
              {rank && <circle cx={s.x} cy={s.y} r={s.r + 4} fill="none" stroke="rgb(var(--neon))" strokeWidth={1} opacity={0.7} />}
              <circle cx={s.x} cy={s.y} r={s.r * 2.2} fill={color} opacity={0.12} />
              <circle
                className={`core ${!reducedMotion && s.demand >= 0.7 ? 'prism-twinkle' : ''}`}
                cx={s.x}
                cy={s.y}
                r={s.r}
                fill={color}
                stroke="transparent"
                strokeWidth={2}
                style={{ ['--tw' as string]: `${2.2 + (i % 7) * 0.35}s`, animationDelay: `${(i % 5) * 0.3}s` }}
              />
              <circle cx={s.x} cy={s.y} r={Math.max(1.2, s.r * 0.35)} fill="white" opacity={0.85} pointerEvents="none" />
              <circle cx={s.x} cy={s.y} r={Math.max(14, s.r + 6)} fill="transparent" />
            </g>
          )
        })}
        {hovered && (
          <g pointerEvents="none">
            <text
              x={hovered.x}
              y={hovered.y - hovered.r - 8 * labelScale}
              textAnchor="middle"
              fill="rgb(var(--ink))"
              stroke="rgb(var(--bg))"
              strokeWidth={4 * labelScale}
              paintOrder="stroke"
              style={{ fontSize: 14 * labelScale, fontWeight: 600 }}
            >
              {hovered.c.name}
            </text>
          </g>
        )}
      </svg>
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <GalaxyBtn label="Zoom in" onClick={() => flyTo({ ...camRef.current, z: clampZ(camRef.current.z * 1.5) }, 250)}>
          <Plus className="h-4 w-4" />
        </GalaxyBtn>
        <GalaxyBtn label="Zoom out" onClick={() => flyTo({ ...camRef.current, z: clampZ(camRef.current.z / 1.5) }, 250)}>
          <Minus className="h-4 w-4" />
        </GalaxyBtn>
        <GalaxyBtn label="Show the whole galaxy" onClick={() => flyTo(home, 500)}>
          <Crosshair className="h-4 w-4" />
        </GalaxyBtn>
      </div>
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg px-2.5 py-1.5 text-xs text-muted glass hairline">
        Drag to move · scroll or pinch to zoom · tap a star
      </div>
    </div>
  )
}

function GalaxyBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-11 w-11 place-items-center rounded-xl text-ink glass hairline hover:bg-surface-2">
      {children}
    </button>
  )
}
