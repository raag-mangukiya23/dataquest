// "Light through a prism", drawn in SVG. A white beam (the student) enters a glass prism (PRISM's analysis) and
// leaves as six coloured rays, one per score part. On the wide layout the rays then bend into branching paths
// that end at glowing career nodes, because every career's score is made of all six parts.
//
// Modes:
//   scroll  – the beam, prism and rays draw in on load; the branches and career nodes follow the scroll progress.
//   intro   – everything draws in once on load (phones), then rests.
//   static  – the finished composition, no movement (reduced motion).
import { animate, motion, useInView, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useId, useRef } from 'react'
import type { CareerSummary, ScoreComponent } from '@/api/types'
import { componentMeta, sectorLabel } from '@/lib/format'

export type SceneMode = 'scroll' | 'intro' | 'static'
export type SceneVariant = 'wide' | 'compact'

/** Top to bottom, as a real prism disperses light: red bends least, violet most. */
export const RAY_ORDER: ScoreComponent[] = ['disruption', 'family_alignment', 'roi', 'affordability', 'market', 'fit']

// ---------------------------------------------------------------- geometry (viewBox units)
const A = { x: 560, y: 270 } // apex
const B = { x: 395, y: 560 } // base left
const C = { x: 725, y: 560 } // base right
const DEPTH = { x: 30, y: -22 } // back face offset, for a little depth
const E = { x: 463, y: 440 } // beam enters the left face
const X = { x: 669, y: 462 } // spectrum leaves the right face
// The beam comes from far off to the left (clipped by the stage), along the same line.
const BEAM_FROM = { x: -900, y: Math.round(440 + (463 + 900) * (68 / 523)) }
const RAY_X = 1010
const RAY_Y = [262, 340, 418, 496, 574, 652]
const NODE_X = 1236
const NODE_Y = [252, 366, 480, 594, 708]

const add = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: p.x + q.x, y: p.y + q.y })
const A2 = add(A, DEPTH)
const B2 = add(B, DEPTH)
const C2 = add(C, DEPTH)

/** Wide viewBox size, and the share of its height at the top that holds nothing (the headline may overlap it). */
export const SCENE_W = 1480
export const SCENE_H = 560
export const SCENE_EMPTY_TOP = 0.08
const VIEWBOX: Record<SceneVariant, string> = {
  wide: '0 200 1480 560',
  compact: '300 220 760 470',
}

function rayPath(i: number) {
  return `M${X.x} ${X.y} L${RAY_X} ${RAY_Y[i]}`
}
function threadPath(i: number, j: number) {
  const rx = RAY_X
  const ry = RAY_Y[i]
  const dx = rx - X.x
  const dy = ry - X.y
  const len = Math.hypot(dx, dy)
  const c1 = { x: rx + (dx / len) * 80, y: ry + (dy / len) * 80 }
  const ny = NODE_Y[j]
  return `M${rx} ${ry} C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${NODE_X - 110} ${ny} ${NODE_X - 10} ${ny}`
}

const EASE = [0.22, 1, 0.36, 1] as const
/** A dark outline behind text so labels stay readable where the light paths cross them. */
const HALO: React.CSSProperties = { paintOrder: 'stroke', stroke: 'rgb(var(--bg))', strokeWidth: 5, strokeLinejoin: 'round' }

/** 0→1 over time (intro), from the scroll progress (scroll), or 1 straight away (static). */
function useReveal(mode: SceneMode, progress: MotionValue<number> | undefined, range: [number, number], delay: number, duration = 0.6) {
  const zero = useMotionValue(0)
  const timed = useMotionValue(mode === 'static' ? 1 : 0)
  const scrolled = useTransform(progress ?? zero, range, [0, 1], { clamp: true })
  useEffect(() => {
    if (mode === 'static') {
      timed.set(1)
      return
    }
    if (mode === 'scroll') return
    timed.set(0)
    const ctl = animate(timed, 1, { delay, duration, ease: EASE })
    return () => ctl.stop()
  }, [mode, delay, duration, timed])
  return mode === 'scroll' ? scrolled : timed
}

/** Hide the round line-cap dot while a path has not started drawing. */
function useVisible(v: MotionValue<number>) {
  return useTransform(v, [0, 0.015], [0, 1])
}

// ---------------------------------------------------------------- pieces
function DrawPath({ d, reveal, className, style, strokeWidth = 2, dash }: { d: string; reveal: MotionValue<number>; className?: string; style?: React.CSSProperties; strokeWidth?: number; dash?: string }) {
  const opacity = useVisible(reveal)
  return (
    <motion.path
      d={d}
      fill="none"
      strokeLinecap="round"
      strokeWidth={strokeWidth}
      strokeDasharray={dash}
      className={className}
      style={{ ...style, pathLength: dash ? undefined : reveal, opacity: dash ? reveal : opacity }}
    />
  )
}

function Ray({ i, mode, weightLabel, ids, showLabel, labelSize }: { i: number; mode: SceneMode; weightLabel?: string; ids: Ids; showLabel: boolean; labelSize: number }) {
  const key = RAY_ORDER[i]
  const meta = componentMeta(key)
  const reveal = useReveal(mode === 'static' ? 'static' : 'intro', undefined, [0, 1], 1.0 + i * 0.07, 0.62)
  const labelOpacity = useTransform(reveal, [0.55, 1], [0, 1])
  const dotOpacity = useTransform(reveal, [0.9, 1], [0, 1])
  const d = rayPath(i)
  const isRisk = key === 'disruption'
  return (
    <g>
      {/* soft glow underneath */}
      <DrawPath d={d} reveal={reveal} strokeWidth={9} style={{ stroke: meta.color, filter: `url(#${ids.soft})` }} className="lp-ray-glow" />
      {isRisk ? (
        // Automation risk subtracts from the score, so its ray is dashed (the app hatches it).
        <motion.path d={d} fill="none" strokeWidth={2.4} strokeDasharray="7 6" style={{ stroke: meta.color, opacity: reveal }} mask={`url(#${ids.riskMask})`} />
      ) : (
        <DrawPath d={d} reveal={reveal} strokeWidth={2.4} style={{ stroke: meta.color }} />
      )}
      <motion.circle cx={RAY_X} cy={RAY_Y[i]} r={4.5} style={{ fill: meta.color, opacity: dotOpacity }} filter={`url(#${ids.glow})`} />
      {showLabel && (
        <motion.text
          x={RAY_X + 16}
          y={RAY_Y[i] + 5}
          style={{ opacity: labelOpacity, fontSize: labelSize, fontWeight: 600, fill: 'rgb(var(--ink))', ...HALO }}
        >
          {meta.label}
          {weightLabel && (
            <tspan dx={7} style={{ fill: meta.color, fontWeight: 500 }} className="num">
              {weightLabel}
            </tspan>
          )}
        </motion.text>
      )}
    </g>
  )
}

function Thread({ i, j, mode, progress }: { i: number; j: number; mode: SceneMode; progress?: MotionValue<number> }) {
  const start = 0.38 + j * 0.03 + i * 0.01
  const reveal = useReveal(mode, progress, [start, start + 0.18], 1.75 + j * 0.08 + i * 0.03, 0.8)
  const meta = componentMeta(RAY_ORDER[i])
  const isRisk = RAY_ORDER[i] === 'disruption'
  return (
    <DrawPath
      d={threadPath(i, j)}
      reveal={reveal}
      strokeWidth={1.4}
      dash={isRisk ? '4 5' : undefined}
      style={{ stroke: meta.color, strokeOpacity: isRisk ? 0.5 : 0.55 }}
    />
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
}

function CareerNode({ j, mode, progress, career, ids }: { j: number; mode: SceneMode; progress?: MotionValue<number>; career?: CareerSummary; ids: Ids }) {
  const s = 0.56 + j * 0.03
  const reveal = useReveal(mode, progress, [s, s + 0.08], 2.4 + j * 0.1, 0.5)
  const labelReveal = useReveal(mode, progress, [s + 0.06, s + 0.14], 2.6 + j * 0.1, 0.5)
  const scale = useTransform(reveal, [0, 1], [0.4, 1])
  const y = NODE_Y[j]
  return (
    <g>
      <motion.g style={{ opacity: reveal, scale }}>
        <circle cx={NODE_X} cy={y} r={30} fill={`url(#${ids.node})`} className={mode === 'static' ? undefined : 'lp-pulse'} style={{ animationDelay: `${j * 0.45}s` }} />
        <circle cx={NODE_X} cy={y} r={12} fill="none" strokeWidth={1.2} style={{ stroke: 'rgb(var(--neon))', strokeOpacity: 0.7 }} />
        <circle cx={NODE_X} cy={y} r={6} fill="#fff" filter={`url(#${ids.glow})`} />
      </motion.g>
      {career && (
        <motion.g style={{ opacity: labelReveal }}>
          <title>{career.name}</title>
          <text x={NODE_X + 24} y={y - 2} style={{ fontSize: 15, fontWeight: 600, fill: 'rgb(var(--ink))', ...HALO }}>
            {truncate(career.name, 24)}
          </text>
          <text x={NODE_X + 24} y={y + 17} style={{ fontSize: 12.5, fill: 'rgb(var(--muted))', ...HALO }}>
            {sectorLabel(career.sector)}
          </text>
        </motion.g>
      )}
    </g>
  )
}

interface Ids {
  glow: string
  soft: string
  glass: string
  edge: string
  sweep: string
  clip: string
  node: string
  beam: string
  riskMask: string
}

// ---------------------------------------------------------------- the scene
export function PrismScene({
  mode,
  variant,
  progress,
  careers,
  weights,
  className,
  title = 'A beam of white light enters a glass prism and splits into six coloured rays: fit, job market, affordability, return on investment, family alignment and automation risk.',
}: {
  mode: SceneMode
  variant: SceneVariant
  progress?: MotionValue<number>
  careers?: CareerSummary[]
  /** score weights from /system/methodology, shown next to each ray when known */
  weights?: Record<string, number>
  className?: string
  title?: string
}) {
  const raw = useId().replace(/:/g, '')
  const ids: Ids = {
    glow: `${raw}-glow`,
    soft: `${raw}-soft`,
    glass: `${raw}-glass`,
    edge: `${raw}-edge`,
    sweep: `${raw}-sweep`,
    clip: `${raw}-clip`,
    node: `${raw}-node`,
    beam: `${raw}-beam`,
    riskMask: `${raw}-risk`,
  }
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { margin: '120px' })
  const wide = variant === 'wide'
  const intro = mode === 'static' ? 'static' : 'intro'

  const beam = useReveal(intro, undefined, [0, 1], 0.15, 0.85)
  const edges = useReveal(intro, undefined, [0, 1], 0.55, 0.8)
  const inner = useReveal(intro, undefined, [0, 1], 0.92, 0.22)
  const faces = useTransform(edges, [0, 0.6], [0, 1])
  const glowOn = useTransform(edges, [0.4, 1], [0, 1])
  const riskReveal = useReveal(intro, undefined, [0, 1], 1.0, 0.62)
  const flowOpacity = useTransform(beam, [0.9, 1], [0, 0.9])

  const weightLabel = (k: ScoreComponent) => {
    const w = weights?.[k]
    if (w === undefined) return undefined
    return `${k === 'disruption' ? '−' : ''}${Math.round(w * 100)}%`
  }
  const tri = `M${A.x} ${A.y} L${C.x} ${C.y} L${B.x} ${B.y} Z`
  const ambient = mode !== 'static'

  return (
    <svg
      ref={ref}
      viewBox={VIEWBOX[variant]}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title}
      className={[className, ambient && !inView ? 'lp-paused' : ''].filter(Boolean).join(' ')}
      style={{ fontFamily: 'Inter, system-ui, sans-serif', overflow: 'visible' }}
    >
      <defs>
        <filter id={ids.glow} filterUnits="userSpaceOnUse" x="-1000" y="0" width="2600" height="900">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={ids.soft} filterUnits="userSpaceOnUse" x="-1000" y="0" width="2600" height="900">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <linearGradient id={ids.glass} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="0.45" style={{ stopColor: 'rgb(var(--neon))' }} stopOpacity="0.07" />
          <stop offset="1" style={{ stopColor: 'rgb(var(--primary))' }} stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={ids.edge} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" style={{ stopColor: 'rgb(var(--neon))' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--neon))' }} />
        </linearGradient>
        <linearGradient id={ids.sweep} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ids.beam} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <radialGradient id={ids.node}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.35" style={{ stopColor: 'rgb(var(--neon))' }} stopOpacity="0.28" />
          <stop offset="1" style={{ stopColor: 'rgb(var(--primary))' }} stopOpacity="0" />
        </radialGradient>
        <clipPath id={ids.clip}>
          <path d={tri} />
        </clipPath>
        <mask id={ids.riskMask} maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
          <motion.path d={rayPath(0)} stroke="#fff" strokeWidth={12} fill="none" style={{ pathLength: riskReveal }} />
        </mask>
      </defs>

      {/* faint glow behind the prism */}
      <circle cx={A.x + 10} cy={455} r={250} fill={`url(#${ids.node})`} opacity={0.32} />

      {/* the beam: one student, white light */}
      <DrawPath d={`M${BEAM_FROM.x} ${BEAM_FROM.y} L${E.x} ${E.y}`} reveal={beam} strokeWidth={10} style={{ stroke: '#fff', strokeOpacity: 0.35, filter: `url(#${ids.soft})` }} />
      <DrawPath d={`M${BEAM_FROM.x} ${BEAM_FROM.y} L${E.x} ${E.y}`} reveal={beam} strokeWidth={2.6} style={{ stroke: `url(#${ids.beam})` }} />
      {ambient && (
        <motion.path
          d={`M${BEAM_FROM.x} ${BEAM_FROM.y} L${E.x} ${E.y}`}
          fill="none"
          stroke="#fff"
          strokeWidth={3}
          strokeLinecap="round"
          className="lp-flow"
          style={{ opacity: flowOpacity }}
        />
      )}

      {/* the prism: back face, depth edges, glass front, neon edges */}
      <motion.g style={{ opacity: faces }}>
        <path d={`M${A2.x} ${A2.y} L${C2.x} ${C2.y} L${B2.x} ${B2.y} Z`} fill={`url(#${ids.glass})`} fillOpacity={0.35} strokeWidth={1} style={{ stroke: 'rgb(var(--neon))', strokeOpacity: 0.18 }} />
        <path d={`M${A.x} ${A.y} L${A2.x} ${A2.y} M${C.x} ${C.y} L${C2.x} ${C2.y} M${B.x} ${B.y} L${B2.x} ${B2.y}`} strokeWidth={1} style={{ stroke: 'rgb(var(--neon))', strokeOpacity: 0.22 }} />
        <path d={tri} fill={`url(#${ids.glass})`} />
        {ambient && (
          <g clipPath={`url(#${ids.clip})`}>
            <rect x={A.x - 260} y={A.y} width={120} height={300} fill={`url(#${ids.sweep})`} className="lp-sweep" />
          </g>
        )}
        {/* light inside the glass */}
        <DrawPath d={`M${E.x} ${E.y} L${X.x} ${X.y}`} reveal={inner} strokeWidth={2.2} style={{ stroke: '#fff', strokeOpacity: 0.9 }} />
      </motion.g>
      <motion.g style={{ opacity: glowOn }} className={ambient ? 'lp-breathe' : undefined}>
        <path d={tri} fill="none" strokeWidth={6} style={{ stroke: 'rgb(var(--neon))', strokeOpacity: 0.35, filter: `url(#${ids.soft})` }} />
      </motion.g>
      <DrawPath d={tri} reveal={edges} strokeWidth={1.8} style={{ stroke: `url(#${ids.edge})`, strokeLinejoin: 'round' }} />

      {/* six rays: the six score parts */}
      {RAY_ORDER.map((k, i) => (
        <Ray key={k} i={i} mode={mode} ids={ids} weightLabel={weightLabel(k)} showLabel={wide} labelSize={17} />
      ))}

      {/* rays bend into branching paths that end at career nodes */}
      {wide && (
        <g>
          {NODE_Y.map((_, j) => RAY_ORDER.map((k, i) => <Thread key={`${k}-${j}`} i={i} j={j} mode={mode} progress={progress} />))}
          {NODE_Y.map((_, j) => (
            <CareerNode key={j} j={j} mode={mode} progress={progress} career={careers?.[j]} ids={ids} />
          ))}
        </g>
      )}
    </svg>
  )
}

/** Keyframes for the scene's quiet ambient motion. Paused off-screen; the global reduce-motion rule stops them. */
export function SceneStyles() {
  return (
    <style>{`
.lp-flow{stroke-dasharray:2 30;animation:lp-flow 1.4s linear infinite}
@keyframes lp-flow{to{stroke-dashoffset:-32}}
.lp-breathe{animation:lp-breathe 4.8s ease-in-out infinite}
@keyframes lp-breathe{50%{opacity:.45}}
.lp-sweep{animation:lp-sweep 6s ease-in-out infinite}
@keyframes lp-sweep{0%{transform:skewX(-18deg) translateX(-120px)}55%,100%{transform:skewX(-18deg) translateX(560px)}}
.lp-pulse{transform-box:fill-box;transform-origin:center;animation:lp-pulse 3.4s ease-in-out infinite}
@keyframes lp-pulse{50%{transform:scale(1.3);opacity:.6}}
.lp-paused,.lp-paused *{animation-play-state:paused!important}
`}</style>
  )
}
