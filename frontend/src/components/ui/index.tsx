// Base UI kit. Crisp surfaces with a 1px hairline; colour comes from tokens in index.css.
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import clsx from 'clsx'
import { AlertTriangle, Info, Loader2, RefreshCw, X } from 'lucide-react'
import { motion, useMotionValue, useSpring } from 'motion/react'
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { ApiError } from '@/api/client'
import { GLOSSARY } from '@/lib/glossary'
import { useSettings } from '@/state/settings'

export const cx = clsx

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  /** desktop-only magnetic pull towards the pointer (use on the one primary action of a screen) */
  magnetic?: boolean
}
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:brightness-110 shadow-glow',
  secondary: 'bg-surface-2 text-ink hairline hover:bg-surface',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-bad text-white hover:brightness-110',
}
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-[15px] gap-2',
  lg: 'px-6 text-base gap-2.5 min-h-[52px]',
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, magnetic, className, children, disabled, ...rest },
  ref,
) {
  const { reducedMotion } = useSettings()
  const x = useSpring(useMotionValue(0), { stiffness: 300, damping: 20 })
  const y = useSpring(useMotionValue(0), { stiffness: 300, damping: 20 })
  const active = magnetic && !reducedMotion
  return (
    <motion.button
      ref={ref}
      style={active ? { x, y } : undefined}
      onPointerMove={(e) => {
        if (!active || e.pointerType !== 'mouse') return
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - r.left - r.width / 2) * 0.18)
        y.set((e.clientY - r.top - r.height / 2) * 0.25)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
      whileTap={reducedMotion ? undefined : { scale: 0.97 }}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center rounded-xl font-semibold transition-[filter,background-color,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...(rest as object)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </motion.button>
  )
})

// ---------------------------------------------------------------- Card, Badge, Stat
export function Card({ className, children, as: As = 'div', ...rest }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' } & Record<string, unknown>) {
  return (
    <As className={cx('card p-5', className)} {...rest}>
      {children}
    </As>
  )
}

export function Badge({ children, color, className, title }: { children: ReactNode; color?: string; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', className)}
      style={color ? { color, background: `color-mix(in srgb, ${color} 14%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)` } : undefined}
    >
      {children}
    </span>
  )
}

export function Stat({ label, value, hint, accent, size = 'md' }: { label: ReactNode; value: ReactNode; hint?: ReactNode; accent?: string; size?: 'md' | 'lg' }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className={cx('num mt-1 font-semibold leading-none', size === 'lg' ? 'text-4xl md:text-5xl' : 'text-2xl')} style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- loading / empty / error
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('shimmer rounded-xl', className)} />
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-1/2 max-w-sm" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Please try again.'
  return (
    <div role="alert" className="card flex flex-col items-start gap-3 border-bad/30 p-5 sm:flex-row sm:items-center">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bad/15 text-bad">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted">{message}</div>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- page structure
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neon">{eyebrow}</div>}
        <h1 className="text-3xl font-bold leading-tight md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] text-muted">{subtitle}</p>}
        <div aria-hidden className="mt-4 h-[2px] w-24 rounded-full" style={{ background: 'linear-gradient(90deg, rgb(var(--fit)), rgb(var(--market)), rgb(var(--afford)), rgb(var(--roi)), rgb(var(--family)), rgb(var(--disrupt)))' }} />
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function Section({ title, subtitle, actions, children, className }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mt-8 first:mt-0', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-xl font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

// ---------------------------------------------------------------- glossary + tooltips
export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-xl bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink shadow-lift hairline">
          {content}
          <TooltipPrimitive.Arrow className="fill-[rgb(var(--surface-2))]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/** An ⓘ next to a metric, explaining it in one sentence (from src/lib/glossary.ts). */
export function InfoTip({ term, text }: { term?: keyof typeof GLOSSARY | string; text?: string }) {
  const content = text ?? (term ? GLOSSARY[term] : undefined)
  if (!content) return null
  return (
    <Tip content={content}>
      <button type="button" aria-label={`What is this? ${content}`} className="inline-grid h-5 w-5 place-items-center rounded-full text-muted hover:text-ink">
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
    </Tip>
  )
}

/** Underlined glossary term: hover/tap for a plain explanation. */
export function Term({ id, children }: { id: string; children: ReactNode }) {
  const content = GLOSSARY[id]
  if (!content) return <>{children}</>
  return (
    <Tip content={content}>
      <button type="button" className="cursor-help underline decoration-dotted decoration-muted underline-offset-4">
        {children}
      </button>
    </Tip>
  )
}

// ---------------------------------------------------------------- forms
export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-bad">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

const inputCls =
  'h-11 w-full rounded-xl bg-surface-2 px-3 text-[15px] text-ink placeholder:text-muted/70 hairline focus:outline-none focus:ring-2 focus:ring-primary/60'
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputCls, className)} {...rest} />
})
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'appearance-none pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1 hairline">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('relative h-9 rounded-lg px-3 text-sm font-medium transition-colors', value === o.value ? 'text-ink' : 'text-muted hover:text-ink')}
        >
          {value === o.value && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-lg bg-surface shadow-lift hairline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-surface-2 hairline')}
      >
        <motion.span layout className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow', checked ? 'right-0.5' : 'left-0.5')} />
      </button>
    </label>
  )
}

// ---------------------------------------------------------------- dialog + tabs
export function Dialog({ open, onOpenChange, title, description, children, wide }: { open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cx(
            'fixed left-1/2 top-1/2 z-50 max-h-[88dvh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-surface p-6 shadow-lift hairline',
            wide ? 'max-w-3xl' : 'max-w-lg',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="font-display text-xl font-semibold">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-lg p-1 text-muted hover:text-ink" aria-label="Close">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function Tabs<T extends string>({ value, onValueChange, tabs, children, label }: { value: T; onValueChange: (v: T) => void; tabs: { value: T; label: ReactNode }[]; children: ReactNode; label: string }) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <TabsPrimitive.List aria-label={label} className="no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className={cx('relative h-10 shrink-0 rounded-xl px-3.5 text-sm font-medium transition-colors', value === t.value ? 'text-ink' : 'text-muted hover:text-ink')}
          >
            {value === t.value && <motion.span layoutId={`tab-${label}`} className="absolute inset-0 rounded-xl bg-surface-2 hairline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            <span className="relative">{t.label}</span>
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  )
}
export const TabPanel = TabsPrimitive.Content

// ---------------------------------------------------------------- toasts
type Toast = { id: number; tone: 'ok' | 'error' | 'info'; text: ReactNode }
const ToastCtx = createContext<(tone: Toast['tone'], text: ReactNode) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const push = useCallback((tone: Toast['tone'], text: ReactNode) => {
    const id = ++seq.current
    setToasts((t) => [...t.slice(-3), { id, tone, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={cx(
              'pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm shadow-lift glass hairline',
              t.tone === 'error' && 'text-bad',
              t.tone === 'ok' && 'text-ok',
            )}
          >
            {t.text}
          </motion.div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
