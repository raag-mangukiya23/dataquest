// A small prism: beam in, six score-part rays out. Used beside the sign-in and register forms and on the 404 page.
import { motion } from 'motion/react'
import { useId } from 'react'
import { componentMeta } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { RAY_ORDER } from './PrismScene'

const A = { x: 170, y: 40 }
const B = { x: 100, y: 170 }
const C = { x: 240, y: 170 }
const E = { x: 127, y: 120 }
const X = { x: 217, y: 128 }
const RAY_Y = [48, 80, 112, 144, 176, 208]
const EASE = [0.22, 1, 0.36, 1] as const

export function PrismGlyph({
  className,
  label = 'A beam of light enters a prism and splits into six colours.',
  lost = false,
}: {
  className?: string
  label?: string
  /** 404: the rays scatter and flicker as if looking for a path */
  lost?: boolean
}) {
  const { reducedMotion } = useSettings()
  const id = useId().replace(/:/g, '')
  const draw = (delay: number, duration = 0.6) =>
    reducedMotion
      ? { initial: false as const }
      : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { delay, duration, ease: EASE } }
  const tri = `M${A.x} ${A.y} L${C.x} ${C.y} L${B.x} ${B.y} Z`
  return (
    <svg viewBox="-10 20 380 210" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} className={className} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.5" style={{ stopColor: 'rgb(var(--neon))' }} stopOpacity="0.08" />
          <stop offset="1" style={{ stopColor: 'rgb(var(--primary))' }} stopOpacity="0.24" />
        </linearGradient>
        <filter id={`${id}-b`} filterUnits="userSpaceOnUse" x="-40" y="0" width="460" height="260">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <radialGradient id={`${id}-r`}>
          <stop offset="0" style={{ stopColor: 'rgb(var(--neon))' }} stopOpacity="0.35" />
          <stop offset="1" style={{ stopColor: 'rgb(var(--primary))' }} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={170} cy={120} r={120} fill={`url(#${id}-r)`} />
      {/* beam */}
      <motion.path d={`M-10 132 L${E.x} ${E.y}`} stroke="#fff" strokeWidth={6} strokeOpacity={0.35} fill="none" filter={`url(#${id}-b)`} {...draw(0.1)} />
      <motion.path d={`M-10 132 L${E.x} ${E.y}`} stroke="#fff" strokeWidth={2} strokeLinecap="round" fill="none" {...draw(0.1)} />
      {/* prism */}
      <motion.path d={tri} fill={`url(#${id}-g)`} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.5 }} />
      <path d={tri} fill="none" strokeWidth={5} filter={`url(#${id}-b)`} style={{ stroke: 'rgb(var(--neon))', strokeOpacity: 0.45 }} />
      <motion.path d={tri} fill="none" strokeWidth={1.6} strokeLinejoin="round" style={{ stroke: 'rgb(var(--neon))' }} {...draw(0.3, 0.7)} />
      <motion.path d={`M${E.x} ${E.y} L${X.x} ${X.y}`} stroke="#fff" strokeWidth={1.8} fill="none" {...draw(0.7, 0.2)} />
      {/* six rays */}
      {RAY_ORDER.map((k, i) => {
        const color = componentMeta(k).color
        const d = `M${X.x} ${X.y} L370 ${RAY_Y[i]}`
        return (
          <g key={k} className={lost && !reducedMotion ? 'lp-breathe' : undefined} style={lost ? { animationDelay: `${i * 0.7}s`, animationDuration: `${2.4 + i * 0.35}s` } : undefined}>
            <motion.path d={d} strokeWidth={6} fill="none" filter={`url(#${id}-b)`} style={{ stroke: color, strokeOpacity: 0.45 }} {...draw(0.85 + i * 0.06, 0.5)} />
            <motion.path
              d={d}
              strokeWidth={1.8}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={k === 'disruption' ? '5 5' : undefined}
              style={{ stroke: color }}
              {...(k === 'disruption'
                ? reducedMotion
                  ? { initial: false as const }
                  : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.85, duration: 0.5 } }
                : draw(0.85 + i * 0.06, 0.5))}
            />
          </g>
        )
      })}
    </svg>
  )
}
