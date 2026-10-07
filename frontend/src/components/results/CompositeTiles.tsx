// The six composite scores (0–100). Overall readiness is the hero dial; the other five are compact tiles.
import { motion } from 'motion/react'
import type { CompositeScores } from '@/api/types'
import { Meter } from '@/components/score'
import { Roll } from './Roll'
import { InfoTip } from '@/components/ui'
import { useSettings } from '@/state/settings'

type Key = Exclude<keyof CompositeScores, 'overall_readiness'>

const TILES: { key: Key; label: string; color: string; info: string }[] = [
  { key: 'aptitude_index', label: 'Aptitude', color: 'rgb(var(--fit))', info: 'Reasoning, number, word and spatial skills from the questionnaire, on a 0–100 scale.' },
  { key: 'interest_clarity', label: 'Interest clarity', color: 'rgb(var(--fit))', info: 'How clearly the interests point one way. A low number just means many paths appeal; that is normal.' },
  { key: 'financial_capacity', label: 'Money capacity', color: 'rgb(var(--afford))', info: 'How well the family budget, scholarships and a manageable loan cover the top options.' },
  { key: 'family_alignment', label: 'Family agreement', color: 'rgb(var(--family))', info: '100 minus the conflict index: higher means the student and parents want similar things.' },
  { key: 'market_outlook', label: 'Job outlook', color: 'rgb(var(--market))', info: 'Demand and growth for the top careers in the places the student could work.' },
]

export function ReadinessDial({ value, className }: { value: number; className?: string }) {
  const { reducedMotion } = useSettings()
  const r = 54
  const frac = Math.max(0, Math.min(100, value)) / 100
  return (
    <div className={className}>
      <div className="relative mx-auto h-32 w-32 lg:h-44 lg:w-44">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden>
          <defs>
            <linearGradient id="readiness-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgb(var(--neon))" />
              <stop offset="100%" stopColor="rgb(var(--primary))" />
            </linearGradient>
          </defs>
          <circle cx="64" cy="64" r={r} fill="none" stroke="rgb(var(--surface-2))" strokeWidth="10" />
          <motion.circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke="url(#readiness-ring)"
            strokeWidth="10"
            strokeLinecap="round"
            initial={reducedMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: frac }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            style={reducedMotion ? { pathLength: frac } : undefined}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <Roll value={value} className="block text-4xl font-semibold leading-none lg:text-6xl" />
            <span className="mt-1 block text-xs text-muted">out of 100</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CompositeTiles({ scores }: { scores: CompositeScores }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {TILES.map((t, i) => (
        <li key={t.key} className={'card flex flex-col gap-2 p-4' + (i === TILES.length - 1 ? ' col-span-2 sm:col-span-1' : '')}>
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">{t.label}</span>
            <InfoTip text={t.info} />
          </div>
          <Roll value={scores[t.key]} className="text-3xl font-semibold leading-none" />
          <Meter value={scores[t.key] / 100} color={t.color} label={`${t.label} ${Math.round(scores[t.key])} out of 100`} />
        </li>
      ))}
    </ul>
  )
}
