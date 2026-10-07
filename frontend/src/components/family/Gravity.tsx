// Signature motion "family gravity": two orbs whose distance is the conflict index, bridge careers as stars between
// them, and a spring-needle gauge. Pure SVG + motion (transform/opacity only).
import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { useId, useState } from 'react'
import type { BridgeCareer, ConflictBand } from '@/api/types'
import { Meter } from '@/components/score'
import { cx } from '@/components/ui'
import { BAND, pct } from '@/lib/format'
import { useSettings } from '@/state/settings'

const W = 640
const H = 250
const CY = 112
const CX = W / 2
// star offsets around the field line, so several bridges never overlap
const STAR_Y = [-58, 52, -22, 78, -86, 20]

export function FamilyGravity({
  index,
  bridges,
  viewerIsParent,
  childName,
}: {
  index: number
  bridges: BridgeCareer[]
  viewerIsParent: boolean
  childName: string
}) {
  const { reducedMotion } = useSettings()
  const uid = useId().replace(/:/g, '')
  const [active, setActive] = useState<number | null>(null)
  const clamped = Math.max(0, Math.min(100, index))
  const half = 48 + clamped * 2.3
  // the student orb sits on the left for both viewers; only the labels change
  const sx = CX - half
  const px = CX + half
  const leftLabel = viewerIsParent ? childName : 'You'
  const rightLabel = viewerIsParent ? 'You (parents)' : 'Parents'
  const stars = bridges.slice(0, 6).map((b, i) => {
    const t = b.parent_acceptance / Math.max(0.001, b.student_fit + b.parent_acceptance)
    return { b, x: sx + (px - sx) * t, y: CY + STAR_Y[i % STAR_Y.length], r: 4 + 5 * b.bridge_score }
  })
  const spring = reducedMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 55, damping: 9, mass: 1.1 }
  const sel = active !== null ? stars[active] : null

  return (
    <div>
      <div className="relative -mx-2 overflow-hidden rounded-2xl sm:mx-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${leftLabel} and ${rightLabel} on a field. The further apart, the more your hopes differ. ${bridges.length} bridge careers sit between you.`}>
          <defs>
            <radialGradient id={`${uid}-s`}>
              <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="35%" stopColor="rgb(var(--fit))" stopOpacity="0.95" />
              <stop offset="100%" stopColor="rgb(var(--fit))" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-p`}>
              <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="35%" stopColor="rgb(var(--family))" stopOpacity="0.95" />
              <stop offset="100%" stopColor="rgb(var(--family))" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${uid}-f`} x1="0" x2="1">
              <stop offset="0%" stopColor="rgb(var(--fit))" stopOpacity="0" />
              <stop offset="30%" stopColor="rgb(var(--fit))" stopOpacity="0.5" />
              <stop offset="70%" stopColor="rgb(var(--family))" stopOpacity="0.5" />
              <stop offset="100%" stopColor="rgb(var(--family))" stopOpacity="0" />
            </linearGradient>
            <filter id={`${uid}-g`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {/* faint field */}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={i} x1={40 + i * 70} x2={40 + i * 70} y1={20} y2={H - 50} stroke="rgb(var(--muted))" strokeOpacity="0.08" />
          ))}
          <line x1={0} x2={W} y1={CY} y2={CY} stroke={`url(#${uid}-f)`} strokeWidth="1.5" />

          {/* threads to the active star */}
          <AnimatePresence>
            {sel && (
              <motion.g key={active} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <motion.line x1={sel.x} y1={sel.y} x2={sx} y2={CY} stroke="rgb(var(--fit))" strokeWidth="1.5" strokeLinecap="round" initial={reducedMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} />
                <motion.line x1={sel.x} y1={sel.y} x2={px} y2={CY} stroke="rgb(var(--family))" strokeWidth="1.5" strokeLinecap="round" initial={reducedMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} />
              </motion.g>
            )}
          </AnimatePresence>

          {/* orbs: start together in the middle, then drift apart to the conflict distance */}
          <motion.g initial={reducedMotion ? false : { x: half, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={spring}>
            <circle cx={sx} cy={CY} r={46} fill={`url(#${uid}-s)`} opacity="0.55" />
            <circle cx={sx} cy={CY} r={20} fill="rgb(var(--fit))" />
            <circle cx={sx - 6} cy={CY - 6} r={6} fill="#fff" opacity="0.55" />
            <text x={sx} y={CY + 68} textAnchor="middle" className="fill-ink" style={{ fontSize: 17, fontWeight: 600 }}>
              {leftLabel}
            </text>
          </motion.g>
          <motion.g initial={reducedMotion ? false : { x: -half, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={spring}>
            <circle cx={px} cy={CY} r={46} fill={`url(#${uid}-p)`} opacity="0.55" />
            <circle cx={px} cy={CY} r={20} fill="rgb(var(--family))" />
            <circle cx={px - 6} cy={CY - 6} r={6} fill="#fff" opacity="0.55" />
            <text x={px} y={CY + 68} textAnchor="middle" className="fill-ink" style={{ fontSize: 17, fontWeight: 600 }}>
              {rightLabel}
            </text>
          </motion.g>

          {/* bridge careers as stars */}
          {stars.map((s, i) => (
            <motion.g
              key={s.b.career.id}
              role="button"
              tabIndex={0}
              aria-label={`${s.b.career.name}: fits ${leftLabel === 'You' ? 'you' : childName} ${pct(s.b.student_fit)}, parents' hopes ${pct(s.b.parent_acceptance)}`}
              aria-pressed={active === i}
              className="cursor-pointer outline-none [&:focus-visible>circle.ring]:opacity-100"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.2 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: reducedMotion ? 0 : 0.7 + i * 0.12, duration: 0.35 }}
              style={{ transformOrigin: `${s.x}px ${s.y}px`, transformBox: 'view-box' }}
            >
              <circle cx={s.x} cy={s.y} r={22} fill="transparent" />
              <circle className="ring" cx={s.x} cy={s.y} r={s.r + 7} fill="none" stroke="rgb(var(--neon))" strokeWidth="1.5" opacity={active === i ? 1 : 0} />
              <circle cx={s.x} cy={s.y} r={s.r * 1.8} fill="#fff" opacity="0.35" filter={`url(#${uid}-g)`} />
              <path d={starPath(s.x, s.y, s.r + 2, s.r * 0.45)} fill="#fff" />
            </motion.g>
          ))}
        </svg>
      </div>

      {/* readable detail for the active star (also the touch / keyboard path) */}
      <div className="mt-2 flex flex-wrap gap-2" role="list" aria-label="Bridge careers">
        {stars.map((s, i) => (
          <button
            key={s.b.career.id}
            role="listitem"
            type="button"
            onClick={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
            className={cx(
              'inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors hairline',
              active === i ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink',
            )}
          >
            <span aria-hidden className="text-neon">✦</span>
            {s.b.career.name}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {sel ? (
          <motion.div
            key={sel.b.career.id}
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 rounded-2xl bg-surface-2/60 p-4 hairline"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link to={`/results/${sel.b.career.id}`} className="text-lg font-semibold hover:underline">
                {sel.b.career.name}
              </Link>
              <span className="text-xs text-muted">{sel.b.why}</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span>Fits {viewerIsParent ? childName : 'you'}</span>
                  <span className="num font-semibold">{pct(sel.b.student_fit)}</span>
                </div>
                <Meter value={sel.b.student_fit} color="rgb(var(--fit))" label="Student fit" />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span>Parents&apos; hopes</span>
                  <span className="num font-semibold">{pct(sel.b.parent_acceptance)}</span>
                </div>
                <Meter value={sel.b.parent_acceptance} color="rgb(var(--family))" label="Parent acceptance" />
              </div>
            </div>
          </motion.div>
        ) : (
          bridges.length > 0 && (
            <p className="mt-3 text-sm text-muted" key="hint">
              Tap a star to see how a bridge career fits both sides.
            </p>
          )
        )}
      </AnimatePresence>
    </div>
  )
}

function starPath(cx: number, cy: number, R: number, r: number) {
  const pts: string[] = []
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2
    const rad = i % 2 === 0 ? R : r
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`)
  }
  return `M${pts.join('L')}Z`
}

// ---------------------------------------------------------------- semicircle gauge
const ZONES: { from: number; to: number; band: ConflictBand }[] = [
  { from: 0, to: 20, band: 'aligned' },
  { from: 20, to: 40, band: 'mild' },
  { from: 40, to: 60, band: 'moderate' },
  { from: 60, to: 100, band: 'high' },
]
function arc(r: number, a0: number, a1: number) {
  // a in 0..100 → angle 180°..0° on the upper semicircle centred at (100,100)
  const p = (a: number) => {
    const t = Math.PI * (1 - a / 100)
    return `${(100 + r * Math.cos(t)).toFixed(2)} ${(100 - r * Math.sin(t)).toFixed(2)}`
  }
  return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`
}

export function ConflictGauge({ index, band, showNumber = true }: { index: number; band: ConflictBand; showNumber?: boolean }) {
  const { reducedMotion } = useSettings()
  const v = Math.max(0, Math.min(100, index))
  return (
    <figure className="mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 118" className="w-full" role="img" aria-label={`Difference index ${Math.round(v)} out of 100: ${BAND[band].label}`}>
        {ZONES.map((z) => (
          <path key={z.band} d={arc(80, z.from + 0.8, z.to - 0.8)} stroke={BAND[z.band].color} strokeOpacity={z.band === band ? 1 : 0.28} strokeWidth="14" fill="none" strokeLinecap="butt" />
        ))}
        <motion.g
          initial={reducedMotion ? false : { rotate: -90 }}
          animate={{ rotate: -90 + v * 1.8 }}
          transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 60, damping: 8, delay: 0.3 }}
          style={{ transformOrigin: '100px 100px', transformBox: 'view-box' }}
        >
          <line x1="100" y1="100" x2="100" y2="34" stroke="rgb(var(--ink))" strokeWidth="3" strokeLinecap="round" />
        </motion.g>
        <circle cx="100" cy="100" r="7" fill="rgb(var(--ink))" />
        <text x="18" y="116" className="fill-muted" style={{ fontSize: 9 }}>Aligned</text>
        <text x="182" y="116" textAnchor="end" className="fill-muted" style={{ fontSize: 9 }}>Far apart</text>
      </svg>
      <figcaption className="-mt-1 text-center">
        {showNumber && (
          <span className="num text-3xl font-bold">
            {Math.round(v)}
            <span className="text-base font-medium text-muted">/100</span>
          </span>
        )}
        <div className="text-sm font-medium" style={{ color: BAND[band].color }}>
          {BAND[band].label}
        </div>
      </figcaption>
    </figure>
  )
}
