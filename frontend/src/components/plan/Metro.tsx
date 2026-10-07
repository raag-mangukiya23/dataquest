// The roadmap as a metro map: a line that draws itself as it scrolls into view, one station per milestone.
// Horizontal (scrollable) on desktop, vertical on phones. Estimated dates get a dashed station ring.
import { Award, Briefcase, GraduationCap, Hammer, PenLine, Send, Sparkles, Wallet, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import type { Milestone, MilestoneType, RoadmapPhase } from '@/api/types'
import { Badge, cx } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { useNarrow } from './controls'

export const MILESTONE: Record<MilestoneType, { label: string; Icon: LucideIcon; color: string }> = {
  academic: { label: 'School', Icon: GraduationCap, color: 'rgb(var(--fit))' },
  exam: { label: 'Exam', Icon: PenLine, color: 'rgb(var(--market))' },
  application: { label: 'Application', Icon: Send, color: 'rgb(var(--primary))' },
  scholarship: { label: 'Scholarship', Icon: Award, color: 'rgb(var(--afford))' },
  skill: { label: 'Skill', Icon: Sparkles, color: 'rgb(var(--roi))' },
  project: { label: 'Project', Icon: Hammer, color: 'rgb(var(--family))' },
  finance: { label: 'Money', Icon: Wallet, color: 'rgb(var(--loan))' },
  career: { label: 'Career', Icon: Briefcase, color: 'rgb(var(--neon))' },
}

const meta = (t: MilestoneType) => MILESTONE[t] ?? MILESTONE.academic

export function MetroMap({ phases }: { phases: RoadmapPhase[] }) {
  const narrow = useNarrow()
  return narrow ? <Vertical phases={phases} /> : <Horizontal phases={phases} />
}

function Line({ vertical }: { vertical?: boolean }) {
  const { reducedMotion } = useSettings()
  return (
    <svg
      aria-hidden
      className={cx('pointer-events-none absolute', vertical ? 'bottom-0 left-[21px] top-0 h-full w-2' : 'left-0 right-0 top-[61px] h-2 w-full')}
      viewBox={vertical ? '0 0 2 100' : '0 0 100 2'}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={vertical ? 'metro-v' : 'metro-h'} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
          <stop offset="0" stopColor="rgb(var(--fit))" />
          <stop offset="0.5" stopColor="rgb(var(--market))" />
          <stop offset="1" stopColor="rgb(var(--afford))" />
        </linearGradient>
      </defs>
      <motion.path
        d={vertical ? 'M1 0 L1 100' : 'M0 1 L100 1'}
        stroke={`url(#${vertical ? 'metro-v' : 'metro-h'})`}
        strokeWidth={4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        fill="none"
        initial={reducedMotion ? false : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  )
}

function Station({ m, index }: { m: Milestone; index: number }) {
  const { reducedMotion } = useSettings()
  const { Icon, color, label } = meta(m.type)
  return (
    <motion.span
      className="relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface"
      style={{
        border: `3px ${m.date_is_estimate ? 'dashed' : 'solid'} ${color}`,
        boxShadow: `0 0 0 4px rgb(var(--bg)), 0 0 18px -4px ${color}`,
      }}
      initial={reducedMotion ? false : { scale: 0.4, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22, delay: reducedMotion ? 0 : Math.min(index * 0.05, 0.6) }}
      title={`${label}${m.date_is_estimate ? ' · estimated date' : ''}`}
    >
      <Icon className="h-4 w-4" style={{ color }} aria-hidden />
    </motion.span>
  )
}

function StationText({ m }: { m: Milestone }) {
  const { label, color } = meta(m.type)
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-semibold uppercase tracking-wider" style={{ color }}>
          {label}
        </span>
        {m.due && <span className="num text-muted">{formatDate(m.due)}</span>}
        {m.date_is_estimate && m.due && <Badge color="rgb(var(--muted))">Estimated</Badge>}
      </div>
      <div className="mt-1 text-sm font-medium leading-snug">{m.title}</div>
      {m.detail && <LinkifiedDetail text={m.detail} />}
    </div>
  )
}

/** Milestone details sometimes carry a URL ("SWAYAM: https://swayam.gov.in"); make it a link. */
function LinkifiedDetail({ text }: { text: string }) {
  const m = text.match(/https?:\/\/\S+/)
  if (!m) return <p className="mt-0.5 text-xs leading-relaxed text-muted">{text}</p>
  const [before, after] = [text.slice(0, m.index), text.slice((m.index ?? 0) + m[0].length)]
  return (
    <p className="mt-0.5 break-words text-xs leading-relaxed text-muted">
      {before}
      <a className="text-primary underline-offset-2 hover:underline" href={m[0]} target="_blank" rel="noreferrer">
        {m[0].replace(/^https?:\/\//, '')}
      </a>
      {after}
    </p>
  )
}

function Horizontal({ phases }: { phases: RoadmapPhase[] }) {
  let idx = 0
  return (
    <div className="no-scrollbar -mx-5 overflow-x-auto px-5 pb-2" tabIndex={0} aria-label="Roadmap, scroll sideways">
      <div className="relative flex w-max min-w-full">
        <Line />
        {phases.map((p) => (
          <section key={p.year_index} className="relative flex shrink-0 flex-col border-l border-dashed border-[rgb(var(--line)/0.15)] pl-4 pr-2 first:border-l-0 first:pl-0">
            <header className="h-10">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Year {p.year_index}</div>
              <div className="max-w-[440px] truncate text-xs text-muted" title={p.label}>
                {p.label.replace(/^Year \d+\s*[-–]\s*/, '')}
              </div>
            </header>
            <ol className="mt-[3px] flex">
              {p.milestones.length === 0 ? (
                <li className="w-52 pt-14 text-xs text-muted">Keep going: no fixed dates this year.</li>
              ) : (
                p.milestones.map((m, i) => {
                  const k = idx++
                  return (
                    <li key={`${m.title}-${i}`} className="flex w-52 flex-col gap-3 pr-4">
                      <Station m={m} index={k} />
                      <StationText m={m} />
                    </li>
                  )
                })
              )}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}

function Vertical({ phases }: { phases: RoadmapPhase[] }) {
  let idx = 0
  return (
    <div className="relative">
      <Line vertical />
      {phases.map((p) => (
        <section key={p.year_index} className="relative pb-4">
          <header className="relative z-10 mb-3 ml-14">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Year {p.year_index}</div>
            <div className="text-xs text-muted">{p.label.replace(/^Year \d+\s*[-–]\s*/, '')}</div>
          </header>
          <ol className="space-y-4">
            {p.milestones.map((m, i) => {
              const k = idx++
              return (
                <li key={`${m.title}-${i}`} className="flex gap-3">
                  <Station m={m} index={k} />
                  <div className="pt-1">
                    <StationText m={m} />
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}

export function MilestoneLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {(Object.keys(MILESTONE) as MilestoneType[]).map((t) => {
        const { Icon, label, color } = MILESTONE[t]
        return (
          <li key={t} className="inline-flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5" style={{ color }} aria-hidden />
            {label}
          </li>
        )
      })}
      <li className="inline-flex items-center gap-1.5">
        <span className="h-3.5 w-3.5 rounded-full border-2 border-dashed border-muted" aria-hidden /> Estimated date
      </li>
    </ul>
  )
}
