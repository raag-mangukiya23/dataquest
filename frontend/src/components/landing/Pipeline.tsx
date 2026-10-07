// "How PRISM works": six stages joined by a line of light. Each stage is a tab; its panel shows the plain
// explanation and the exact formulas, weights and parameters from GET /system/methodology.
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDownRight, ArrowRight, FunctionSquare, SlidersHorizontal } from 'lucide-react'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { Methodology } from '@/api/types'
import { ErrorState, Skeleton, cx } from '@/components/ui'
import { useSettings } from '@/state/settings'
import { WeightsBar } from './sections'
import { GROUP_LABELS, STAGES, formatParam, formulaTitle, type Stage } from './stages'

/** Node label; the profile stage names its live dimension count once methodology has loaded. */
const stageLabel = (s: Stage, dims?: number) => (s.short.includes('{dims}') ? (dims ? s.short.replace('{dims}', String(dims)) : 'Your profile') : s.short)

function useTabKeys(count: number, index: number, select: (i: number) => void, refs: React.MutableRefObject<(HTMLButtonElement | null)[]>) {
  return (e: KeyboardEvent) => {
    const map: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    let to: number | null = null
    if (e.key in map) to = (index + map[e.key] + count) % count
    if (e.key === 'Home') to = 0
    if (e.key === 'End') to = count - 1
    if (to === null) return
    e.preventDefault()
    select(to)
    refs.current[to]?.focus()
  }
}

export function Pipeline({
  index,
  onSelect,
  dims,
  playing,
  vertical,
  renderPanel,
  stepSeconds,
}: {
  index: number
  onSelect: (i: number) => void
  dims?: number
  playing: boolean
  vertical: boolean
  /** phones: the open stage's panel is shown right under it */
  renderPanel: () => ReactNode
  stepSeconds: number
}) {
  const { reducedMotion } = useSettings()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = useTabKeys(STAGES.length, index, onSelect, refs)
  const lit = STAGES.length > 1 ? index / (STAGES.length - 1) : 1

  if (vertical) {
    return (
      <div role="tablist" aria-label="Pipeline stages" aria-orientation="vertical" className="relative">
        <span aria-hidden className="absolute bottom-6 left-[27px] top-6 w-px bg-[rgb(var(--line)/0.14)]" />
        <motion.span
          aria-hidden
          className="absolute left-[26px] top-6 w-[3px] origin-top rounded-full"
          style={{ height: 'calc(100% - 3rem)', background: 'linear-gradient(180deg, rgb(var(--neon)), rgb(var(--primary)))', boxShadow: '0 0 12px rgb(var(--neon) / .6)' }}
          initial={false}
          animate={{ scaleY: lit }}
          transition={{ type: 'spring', stiffness: 160, damping: 26 }}
        />
        <ol className="relative space-y-2">
          {STAGES.map((s, i) => {
            const on = i === index
            return (
              <li key={s.key}>
                <button
                  ref={(el) => (refs.current[i] = el)}
                  role="tab"
                  id={`stage-tab-${s.key}`}
                  aria-selected={on}
                  aria-controls="stage-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => onSelect(i)}
                  onKeyDown={onKey}
                  className={cx('flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-1.5 py-1.5 text-left transition-colors', on ? 'bg-surface hairline' : 'hover:bg-surface/60')}
                >
                  <Node stage={s} on={on} past={i < index} i={i} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{stageLabel(s, dims)}</span>
                    <span className="block truncate text-xs text-muted">{s.output}</span>
                  </span>
                  <ArrowDownRight className={cx('mr-2 h-4 w-4 shrink-0 transition-transform', on ? 'rotate-45 text-neon' : 'text-muted')} aria-hidden />
                </button>
                {on && playing && <TourBar seconds={stepSeconds} k={i} />}
                <AnimatePresence initial={false}>
                  {on && (
                    <motion.div key={s.key} initial={reducedMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="relative z-[1] mt-2 mb-3 rounded-2xl bg-surface p-4 hairline">
                      {renderPanel()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  return (
    <div className="card relative overflow-hidden px-6 pb-6 pt-8">
      <div role="tablist" aria-label="Pipeline stages" className="relative grid grid-cols-6 gap-2">
        {/* the line of light */}
        <span aria-hidden className="absolute left-[8.33%] right-[8.33%] top-[27px] h-px bg-[rgb(var(--line)/0.14)]" />
        <motion.span
          aria-hidden
          className="absolute left-[8.33%] top-[26px] h-[3px] origin-left rounded-full"
          style={{ width: '83.34%', background: 'linear-gradient(90deg, rgb(var(--neon)), rgb(var(--primary)))', boxShadow: '0 0 14px rgb(var(--neon) / .7)' }}
          initial={false}
          animate={{ scaleX: lit }}
          transition={{ type: 'spring', stiffness: 140, damping: 24 }}
        />
        {/* hero moment: one photon travels the whole pipeline when the page opens */}
        {!reducedMotion && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute left-[8.33%] top-[21px] h-[13px] w-[83.34%]"
            initial={{ x: '0%', opacity: 0 }}
            animate={{ x: ['0%', '0%', '100%', '100%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.4, times: [0, 0.1, 0.85, 1], ease: 'easeInOut', delay: 0.3 }}
          >
            <span className="absolute left-0 top-0 h-[13px] w-[13px] -translate-x-1/2 rounded-full bg-white" style={{ boxShadow: '0 0 16px 4px rgb(var(--neon)), 0 0 40px 8px rgb(var(--primary) / .6)' }} />
          </motion.span>
        )}
        {STAGES.map((s, i) => {
          const on = i === index
          return (
            <button
              key={s.key}
              ref={(el) => (refs.current[i] = el)}
              role="tab"
              id={`stage-tab-${s.key}`}
              aria-selected={on}
              aria-controls="stage-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => onSelect(i)}
              onKeyDown={onKey}
              className="group relative flex flex-col items-center gap-3 rounded-2xl px-1 pb-2 text-center"
            >
              <Node stage={s} on={on} past={i < index} i={i} big />
              <span className="space-y-0.5">
                <span className="num block text-[11px] font-semibold tracking-[0.18em] text-muted">0{i + 1}</span>
                <span className={cx('block text-sm font-semibold leading-snug transition-colors', on ? 'text-ink' : 'text-muted group-hover:text-ink')}>{stageLabel(s, dims)}</span>
              </span>
              {on && playing && (
                <span className="absolute inset-x-3 bottom-0">
                  <TourBar seconds={stepSeconds} k={i} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Node({ stage, on, past, i, big }: { stage: Stage; on: boolean; past: boolean; i: number; big?: boolean }) {
  const { reducedMotion } = useSettings()
  const Icon = stage.icon
  return (
    <motion.span
      className={cx(
        'relative z-[1] grid shrink-0 place-items-center rounded-full transition-colors duration-300',
        big ? 'h-14 w-14' : 'h-11 w-11',
        on ? 'bg-neon/15 text-neon' : past ? 'bg-surface-2 text-neon' : 'bg-surface-2 text-muted',
      )}
      style={{ boxShadow: on ? '0 0 0 1.5px rgb(var(--neon)), 0 0 28px -4px rgb(var(--neon) / .8)' : 'inset 0 0 0 1px rgb(var(--line) / var(--line-alpha))' }}
      initial={reducedMotion ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 380, damping: 22 }}
    >
      {/* the node lights up as the opening photon passes */}
      {!reducedMotion && big && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-neon/40"
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: [0, 0.9, 0], scale: [1, 1.5, 1.7] }}
          transition={{ delay: 0.55 + i * 0.36, duration: 0.6 }}
        />
      )}
      <Icon className={big ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden />
    </motion.span>
  )
}

function TourBar({ seconds, k }: { seconds: number; k: number }) {
  return (
    <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-[rgb(var(--line)/0.12)]" aria-hidden>
      <motion.span key={k} className="block h-full origin-left rounded-full bg-neon" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: seconds, ease: 'linear' }} />
    </span>
  )
}

// ---------------------------------------------------------------- the panel for one stage
export function StagePanel({ stage, index, methodology, loading, error, onRetry, compact }: { stage: Stage; index: number; methodology?: Methodology; loading: boolean; error: unknown; onRetry: () => void; compact?: boolean }) {
  const formulas = stage.formulas.map((n) => methodology?.formulas.find((f) => f.name === n)).filter(Boolean) as Methodology['formulas']
  const params = stage.params.filter((p) => methodology?.parameters && p in methodology.parameters)
  const dims = stage.key === 'profile' ? methodology?.dimensions : undefined
  return (
    <div id="stage-panel" role="tabpanel" aria-labelledby={`stage-tab-${stage.key}`} tabIndex={0} className={cx('grid gap-5 focus:outline-none', !compact && 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8')}>
      <div>
        {!compact && (
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neon">
            Step <span className="num">{index + 1}</span> of <span className="num">{STAGES.length}</span>
          </div>
        )}
        {!compact && <h2 className="text-2xl font-bold md:text-3xl">{stage.title}</h2>}
        <p className={cx('text-[15px] leading-relaxed text-muted', !compact && 'mt-3')}>{stage.plain}</p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-xl bg-surface-2 p-3.5 hairline">
            <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Goes in</dt>
            <dd>
              <ul className="space-y-1">
                {stage.inputs.map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                    {x}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3.5 hairline">
            <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Comes out</dt>
            <dd className="font-medium">{stage.output}</dd>
          </div>
        </dl>
        {stage.key === 'score' && (
          <div className="mt-4">
            <WeightsBar methodology={methodology} loading={loading} />
          </div>
        )}
        {dims && dims.length > 0 && <Dimensions dims={dims} />}
      </div>

      <div className="min-w-0 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
          <FunctionSquare className="h-4 w-4" aria-hidden /> The working
        </h3>
        {loading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} title="Could not load the formulas" />
        ) : formulas.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted hairline">No formula is published for this step yet. The plain explanation above describes what it does.</p>
        ) : (
          <ul className="space-y-3">
            {formulas.map((f) => (
              <li key={f.name} className="rounded-xl bg-surface-2 p-4 hairline">
                <div className="text-[15px] font-semibold">{formulaTitle(f.name)}</div>
                <code className="num mt-2 block whitespace-pre-wrap rounded-lg bg-bg/70 px-3 py-2.5 text-[12.5px] leading-relaxed text-neon [overflow-wrap:anywhere] hairline">{f.expression}</code>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.explanation}</p>
              </li>
            ))}
          </ul>
        )}
        {params.length > 0 && methodology && (
          <div className="rounded-xl p-4 hairline">
            <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Settings used
            </h3>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {params.map((k) => {
                const p = formatParam(k, methodology.parameters[k])
                return (
                  <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed border-[rgb(var(--line)/var(--line-alpha))] pb-1.5">
                    <dt className="text-muted">{p.label}</dt>
                    <dd className="num text-right font-semibold">{p.value}</dd>
                  </div>
                )
              })}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}

function Dimensions({ dims }: { dims: Methodology['dimensions'] }) {
  const groups = new Map<string, string[]>()
  for (const d of dims) {
    const g = d.group ?? 'other'
    groups.set(g, [...(groups.get(g) ?? []), d.label ?? d.key])
  }
  return (
    <div className="mt-4 rounded-xl bg-surface-2 p-4 hairline">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        The <span className="num">{dims.length}</span> dimensions
      </div>
      <div className="space-y-3">
        {[...groups.entries()].map(([g, labels]) => (
          <div key={g}>
            <div className="mb-1.5 text-xs font-semibold">{GROUP_LABELS[g] ?? g}</div>
            <ul className="flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <li key={l} className="rounded-full bg-surface px-2.5 py-1 text-xs text-muted hairline">
                  {l}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
