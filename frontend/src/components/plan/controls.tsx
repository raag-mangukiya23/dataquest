// Small building blocks shared by the plan group's screens (What-if, Plan, Loans).
import { useEffect, useState, type ReactNode } from 'react'
import { cx } from '@/components/ui'

/** The value, but only after it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms = 500): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** true below the md breakpoint. */
export function useNarrow(query = '(max-width: 767px)') {
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? matchMedia(query).matches : false))
  useEffect(() => {
    const mq = matchMedia(query)
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return narrow
}

/**
 * A labelled range slider with plain words at both ends. Native input for keyboard and screen-reader support;
 * the track is painted with the given colour up to the thumb. 44px tall hit area.
 */
export function RangeField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  left,
  right,
  color = 'rgb(var(--primary))',
  hint,
  valueText,
}: {
  id: string
  label: ReactNode
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  display?: ReactNode
  left?: string
  right?: string
  color?: string
  hint?: ReactNode
  valueText?: string
}) {
  const p = max === min ? 0 : ((value - min) / (max - min)) * 100
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {display !== undefined && <span className="num text-sm font-semibold" style={{ color }}>{display}</span>}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        className="prism-range mt-1 h-11 w-full cursor-pointer"
        style={{ ['--fill' as string]: `${p}%`, ['--c' as string]: color }}
      />
      {(left || right) && (
        <div className="-mt-1 flex justify-between gap-2 text-xs text-muted">
          <span>{left}</span>
          <span className="text-right">{right}</span>
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

/** Styles for RangeField (scoped class, injected once). */
export function RangeStyles() {
  return (
    <style>{`
.prism-range{-webkit-appearance:none;appearance:none;background:transparent}
.prism-range:focus{outline:none}
.prism-range::-webkit-slider-runnable-track{height:6px;border-radius:999px;background:linear-gradient(to right,var(--c) var(--fill),rgb(var(--surface-2)) var(--fill));box-shadow:inset 0 0 0 1px rgb(var(--line)/var(--line-alpha))}
.prism-range::-moz-range-track{height:6px;border-radius:999px;background:rgb(var(--surface-2))}
.prism-range::-moz-range-progress{height:6px;border-radius:999px;background:var(--c)}
.prism-range::-webkit-slider-thumb{-webkit-appearance:none;margin-top:-9px;height:24px;width:24px;border-radius:999px;background:rgb(var(--ink));border:4px solid var(--c);box-shadow:0 2px 10px rgb(0 0 0/.35);transition:transform .12s}
.prism-range::-moz-range-thumb{height:16px;width:16px;border-radius:999px;background:rgb(var(--ink));border:4px solid var(--c)}
.prism-range:active::-webkit-slider-thumb{transform:scale(1.12)}
.prism-range:focus-visible::-webkit-slider-thumb{outline:3px solid var(--c);outline-offset:3px}
.prism-range:focus-visible::-moz-range-thumb{outline:3px solid var(--c);outline-offset:3px}
`}</style>
  )
}

/** A chip-style toggle button (44px tall). */
export function Chip({ active, onClick, children, className, ariaLabel }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string; ariaLabel?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors hairline',
        active ? 'bg-primary text-primary-ink' : 'bg-surface-2 text-ink hover:bg-surface',
        className,
      )}
    >
      {children}
    </button>
  )
}
