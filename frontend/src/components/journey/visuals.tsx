// Small SVG pieces for the journey screens: the spectrum progress ring and the answer constellation.
import { motion } from 'motion/react'
import { useId, useMemo } from 'react'
import { useSettings } from '@/state/settings'

export function ProgressRing({ done, total, size = 120 }: { done: number; total: number; size?: number }) {
  const { reducedMotion } = useSettings()
  const id = useId().replace(/:/g, '')
  const r = size / 2 - 9
  const c = 2 * Math.PI * r
  const frac = total ? done / total : 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${done} of ${total} steps done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--fit))" />
            <stop offset="35%" stopColor="rgb(var(--market))" />
            <stop offset="65%" stopColor="rgb(var(--afford))" />
            <stop offset="100%" stopColor="rgb(var(--family))" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line) / var(--line-alpha))" strokeWidth={9} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g${id})`}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reducedMotion ? c * (1 - frac) : c }}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: reducedMotion ? 0 : 1.1, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="num text-3xl font-bold leading-none">
            {done}
            <span className="text-base font-medium text-muted">/{total}</span>
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-wider text-muted">steps</div>
        </div>
      </div>
    </div>
  )
}

const COLORS = ['--fit', '--market', '--afford', '--roi', '--family', '--disrupt']

/** A star field that gains a star per answer; lines join consecutive stars. `lit` glows everything (section done). */
export function Constellation({ total, filled, lit = false, size = 96 }: { total: number; filled: number; lit?: boolean; size?: number }) {
  const { reducedMotion } = useSettings()
  // Deterministic positions on a gentle spiral so the shape is the same on every visit.
  const pts = useMemo(() => {
    const out: { x: number; y: number }[] = []
    const n = Math.max(total, 1)
    for (let i = 0; i < n; i++) {
      const t = i / n
      const a = i * 2.399963 // golden angle
      const rad = 0.18 + 0.32 * Math.sqrt(t + 0.05)
      out.push({ x: 0.5 + rad * Math.cos(a), y: 0.5 + rad * Math.sin(a) })
    }
    return out
  }, [total])
  const shown = pts.slice(0, filled)
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="overflow-visible">
      {shown.slice(1).map((p, i) => (
        <line
          key={`l${i}`}
          x1={shown[i].x * 100}
          y1={shown[i].y * 100}
          x2={p.x * 100}
          y2={p.y * 100}
          stroke={lit ? 'rgb(var(--neon) / 0.55)' : 'rgb(var(--ink) / 0.14)'}
          strokeWidth={0.6}
        />
      ))}
      {pts.map((p, i) => {
        const on = i < filled
        const col = `rgb(var(${COLORS[i % COLORS.length]}))`
        return on ? (
          <motion.circle
            key={i}
            cx={p.x * 100}
            cy={p.y * 100}
            r={lit ? 2.6 : 2}
            fill={col}
            initial={reducedMotion ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, delay: lit && !reducedMotion ? i * 0.02 : 0 }}
            style={{ filter: lit ? `drop-shadow(0 0 3px ${col})` : undefined, transformOrigin: `${p.x * 100}px ${p.y * 100}px` }}
          />
        ) : (
          <circle key={i} cx={p.x * 100} cy={p.y * 100} r={0.9} fill="rgb(var(--ink) / 0.18)" />
        )
      })}
    </svg>
  )
}
