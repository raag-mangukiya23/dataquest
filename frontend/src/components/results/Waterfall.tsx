// "Why this score": a horizontal waterfall. Each score part starts where the previous one ended; automation risk
// steps back (hatched). The last row is the final score, which the parts add up to.
import { motion } from 'motion/react'
import type { Contribution } from '@/api/types'
import { Tip } from '@/components/ui'
import { COMPONENTS, componentMeta, pct } from '@/lib/format'
import { useSettings } from '@/state/settings'

const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}`
const GRID = [0, 25, 50, 75, 100]

export function Waterfall({ contributions, finalScore }: { contributions: Contribution[]; finalScore: number }) {
  const { reducedMotion } = useSettings()
  const ordered = COMPONENTS.map((c) => contributions.find((x) => x.component === c.key)).filter(Boolean) as Contribution[]
  let cum = 0
  const rows = ordered.map((c) => {
    const start = c.contribution >= 0 ? cum : cum + c.contribution
    const width = Math.abs(c.contribution)
    cum += c.contribution
    return { c, start: Math.max(0, start), width, end: cum }
  })

  const Track = ({ children }: { children?: React.ReactNode }) => (
    <div className="relative h-8 w-full">
      {GRID.map((g) => (
        <span key={g} aria-hidden className="absolute inset-y-0 w-px bg-[rgb(var(--line)/0.07)]" style={{ left: `${g}%` }} />
      ))}
      {children}
    </div>
  )

  return (
    <div>
      <table className="sr-only">
        <caption>How the score adds up</caption>
        <thead>
          <tr>
            <th>Part</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c }) => (
            <tr key={c.component}>
              <td>{componentMeta(c.component).label}</td>
              <td>{pts(c.contribution)}</td>
            </tr>
          ))}
          <tr>
            <td>Final score</td>
            <td>{(finalScore * 100).toFixed(1)}</td>
          </tr>
        </tbody>
      </table>

      <div aria-hidden className="space-y-1.5">
        {rows.map(({ c, start, width, end }, i) => {
          const m = componentMeta(c.component)
          const neg = c.contribution < 0
          return (
            <div key={c.component} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[11.5rem_1fr_4rem]">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className={neg ? 'hatch h-2.5 w-2.5 shrink-0 rounded-full' : 'h-2.5 w-2.5 shrink-0 rounded-full'} style={neg ? undefined : { background: m.color }} />
                <span className="truncate font-medium">{m.label}</span>
              </div>
              <div className="order-last col-span-2 sm:order-none sm:col-span-1">
                <Track>
                  <Tip
                    content={
                      <span>
                        <b>{m.label}</b>: {pct(c.raw_value)} × weight {c.weight.toFixed(2)} = <span className="num">{pts(c.contribution)}</span> points. {m.meaning}
                      </span>
                    }
                  >
                    <motion.span
                      className={neg ? 'hatch absolute top-1 h-6 origin-right rounded-md opacity-90' : 'absolute top-1 h-6 origin-left rounded-md'}
                      style={{ left: `${start * 100}%`, width: `max(${width * 100}%, 2px)`, background: neg ? undefined : m.color }}
                      initial={reducedMotion ? false : { scaleX: 0, opacity: 0.4 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={{ duration: 0.45, delay: 0.1 + i * 0.09, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </Tip>
                  {i < rows.length - 1 && (
                    <span className="absolute top-7 h-3.5 w-px border-l border-dashed border-muted/50" style={{ left: `${end * 100}%` }} />
                  )}
                </Track>
              </div>
              <div className="text-right">
                <span className="num text-sm font-semibold">{pts(c.contribution)}</span>
                <span className="block text-[11px] text-muted">
                  {pct(c.raw_value)} × {c.weight.toFixed(2)}
                </span>
              </div>
            </div>
          )
        })}
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-[rgb(var(--line)/var(--line-alpha))] pt-2 sm:grid-cols-[11.5rem_1fr_4rem]">
          <div className="text-sm font-semibold">Final score</div>
          <div className="order-last col-span-2 sm:order-none sm:col-span-1">
            <Track>
              <motion.span
                className="absolute left-0 top-1 h-6 origin-left rounded-md bg-ink/85"
                style={{ width: `${finalScore * 100}%` }}
                initial={reducedMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, delay: 0.1 + rows.length * 0.09, ease: [0.22, 1, 0.36, 1] }}
              />
            </Track>
          </div>
          <div className="num text-right text-lg font-semibold">{(finalScore * 100).toFixed(1)}</div>
        </div>
        <div className="grid grid-cols-[1fr] gap-x-3 sm:grid-cols-[11.5rem_1fr_4rem]">
          <span className="hidden sm:block" />
          <div className="relative h-4 text-[10px] text-muted">
            {GRID.map((g) => (
              <span key={g} className="num absolute -translate-x-1/2" style={{ left: `${g}%` }}>
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
