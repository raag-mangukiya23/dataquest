// Free-text chips: type and press Enter (or comma) to add; each chip has a remove button.
import { X } from 'lucide-react'
import { useState } from 'react'

export function ChipInput({ id, value, onChange, placeholder }: { id: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim().replace(/,$/, '').trim()
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t])
    setText('')
  }
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl bg-surface-2 p-1.5 hairline focus-within:ring-2 focus-within:ring-primary/60">
      {value.map((v) => (
        <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-surface py-1 pl-2.5 pr-1 text-sm hairline">
          <span className="truncate">{v}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== v))}
            aria-label={`Remove ${v}`}
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        onChange={(e) => {
          const v = e.target.value
          if (v.endsWith(',')) {
            const t = v.slice(0, -1).trim()
            if (t && !value.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...value, t])
            setText('')
          } else setText(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={add}
        placeholder={value.length ? 'Add another' : placeholder}
        className="h-8 min-w-[8rem] flex-1 bg-transparent px-1.5 text-[15px] text-ink placeholder:text-muted/70 focus:outline-none"
      />
    </div>
  )
}
