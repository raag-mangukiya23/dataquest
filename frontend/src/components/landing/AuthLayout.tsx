// Split layout for sign in and register: the form on the left, a small "observatory" panel with the prism on the
// right (desktop only). On phones only the form shows, with a small prism above the heading.
import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Input, cx } from '@/components/ui'
import { COMPONENTS } from '@/lib/format'
import { PrismGlyph } from './PrismGlyph'
import { SceneStyles } from './PrismScene'

export function AuthLayout({ title, subtitle, children, aside }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; aside: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-page items-start gap-8 px-4 py-8 md:px-8 md:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
      <SceneStyles />
      <div className="mx-auto w-full max-w-md lg:mx-0 lg:justify-self-center">
        <div data-theme="dark" className="mb-6 grid h-14 w-24 place-items-center overflow-hidden rounded-2xl bg-bg hairline lg:hidden">
          <PrismGlyph className="h-12 w-20" label="" />
        </div>
        <h1 className="text-3xl font-bold leading-tight md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
        <div className="mt-7">{children}</div>
      </div>
      <aside data-theme="dark" aria-label="About PRISM" className="relative hidden overflow-hidden rounded-[28px] bg-bg p-10 text-ink hairline lg:block">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(520px 320px at 45% 35%, rgb(var(--primary) / 0.22), transparent 70%), radial-gradient(360px 220px at 90% 100%, rgb(var(--neon) / 0.1), transparent 70%)' }} />
        <div className="relative">
          <PrismGlyph className="mx-auto h-auto w-full max-w-[420px]" />
          <div className="mt-8">{aside}</div>
          <ul className="mt-8 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[rgb(var(--line)/var(--line-alpha))] pt-5 text-xs text-muted" aria-label="The six score parts">
            {COMPONENTS.map((c) => (
              <li key={c.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cx('h-2 w-2 rounded-full', c.key === 'disruption' && 'hatch')} style={c.key === 'disruption' ? undefined : { background: c.color }} />
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}

/** Password input with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PasswordInput({ className, ...rest }, ref) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input ref={ref} type={shown ? 'text' : 'password'} className={cx('pr-12', className)} {...rest} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        className="absolute right-0.5 top-1/2 grid h-10 w-11 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-ink"
      >
        {shown ? <EyeOff className="h-[18px] w-[18px]" aria-hidden /> : <Eye className="h-[18px] w-[18px]" aria-hidden />}
      </button>
    </div>
  )
})

/** A friendly error box above the submit button. */
export function FormAlert({ children, icon, tone = 'bad' }: { children: ReactNode; icon: ReactNode; tone?: 'bad' | 'warn' }) {
  return (
    <div role="alert" className={cx('flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm', tone === 'bad' ? 'bg-bad/10 text-bad' : 'bg-warn/10 text-warn')} style={{ boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.3)` }}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="text-ink">{children}</span>
    </div>
  )
}

export function AsidePoint({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-neon hairline">{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-sm text-muted">{children}</span>
      </span>
    </li>
  )
}
