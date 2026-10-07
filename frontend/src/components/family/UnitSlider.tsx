// A 0–1 slider with plain words at both ends (Radix Slider).
import * as Slider from '@radix-ui/react-slider'
import { useId } from 'react'

export function UnitSlider({ label, value, onChange, low, high, hint, color = 'rgb(var(--primary))' }: { label: string; value: number; onChange: (v: number) => void; low: string; high: string; hint?: string; color?: string }) {
  const id = useId()
  return (
    <div>
      <div id={id} className="text-sm font-medium">
        {label}
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <Slider.Root
        className="relative mt-3 flex h-11 w-full touch-none select-none items-center"
        min={0}
        max={1}
        step={0.05}
        value={[value]}
        onValueChange={(v) => onChange(Math.round(v[0] * 100) / 100)}
        aria-labelledby={id}
      >
        <Slider.Track className="relative h-2 grow overflow-hidden rounded-full bg-surface-2 hairline">
          <Slider.Range className="absolute h-full rounded-full" style={{ background: color }} />
        </Slider.Track>
        <Slider.Thumb
          aria-labelledby={id}
          aria-valuetext={`${Math.round(value * 100)}%: ${value < 0.34 ? low : value > 0.66 ? high : 'in between'}`}
          className="block h-7 w-7 rounded-full border-2 bg-white shadow-lift focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/50"
          style={{ borderColor: color }}
        />
      </Slider.Root>
      <div className="flex justify-between text-xs text-muted">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  )
}
