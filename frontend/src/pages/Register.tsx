// Create account: name, email, password, role (student / parent / teacher → educator), date of birth for students.
// API validation errors appear next to their field.
import { AlertCircle, ArrowRight, Backpack, Check, HeartHandshake, Info, School, WifiOff } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import type { Lang } from '@/api/endpoints'
import type { Role } from '@/api/types'
import { Button, Field, Input, cx } from '@/components/ui'
import { AsidePoint, AuthLayout, FormAlert, PasswordInput } from '@/components/landing/AuthLayout'
import { useAfterAuth } from '@/components/landing/afterAuth'
import { ageOn, fieldErrorsFrom, isoToday, safeNext, type FieldErrors } from '@/components/landing/util'
import { useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

type Kind = 'student' | 'parent' | 'educator'
const FIELDS = ['full_name', 'email', 'password', 'role', 'date_of_birth', 'preferred_language'] as const
type FieldKey = (typeof FIELDS)[number]
const MIN_PASSWORD = 8
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ROLES: { value: Kind; label: string; hint: string; icon: typeof Backpack }[] = [
  { value: 'student', label: 'Student', hint: 'Classes 9 to 12', icon: Backpack },
  { value: 'parent', label: 'Parent', hint: 'or guardian', icon: HeartHandshake },
  { value: 'educator', label: 'Teacher', hint: 'or counsellor', icon: School },
]
const NEXT_STEPS: Record<Kind, { title: string; body: string }[]> = {
  student: [
    { title: 'Answer the questionnaire', body: 'One calm question at a time. Save and come back whenever you like.' },
    { title: 'Invite a parent', body: 'They add the family budget privately and, if you are under 18, approve your account.' },
    { title: 'See every path', body: 'Your careers, scored in six parts, with a plan you can follow.' },
  ],
  parent: [
    { title: 'Join your child’s family', body: 'Enter the invite code they share with you, or create a family and invite them.' },
    { title: 'Add the budget privately', body: 'Savings, income and loan comfort. Your child sees only a gentle summary.' },
    { title: 'Talk together', body: 'See where you agree, where you differ and careers you can both support.' },
  ],
  educator: [
    { title: 'See your students', body: 'The students assigned to you, most urgent first.' },
    { title: 'Spot who needs help', body: 'Missed deadlines, big family differences and unfinished questionnaires.' },
    { title: 'Open any result', body: 'The same explainable scores the family sees.' },
  ],
}

export default function Register() {
  const { register } = useSession()
  const { reducedMotion } = useSettings()
  const go = useAfterAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [form, setForm] = useState({ full_name: '', email: '', password: '', date_of_birth: '', preferred_language: 'en' as Lang })
  const [kind, setKind] = useState<Kind>('student')
  const [errors, setErrors] = useState<FieldErrors<FieldKey>>({})
  const [general, setGeneral] = useState<{ text: string; offline: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const refs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({})

  useEffect(() => {
    document.title = 'Create account · PRISM'
  }, [])

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k as FieldKey]) setErrors((e) => ({ ...e, [k]: undefined }))
  }
  const today = isoToday()
  const age = form.date_of_birth ? ageOn(form.date_of_birth) : null
  const minor = kind === 'student' && age !== null && age < 18

  function validate(): FieldErrors<FieldKey> {
    const e: FieldErrors<FieldKey> = {}
    if (!form.full_name.trim()) e.full_name = 'Please tell us your name.'
    if (!form.email.trim()) e.email = 'Please enter your email.'
    else if (!EMAIL_RE.test(form.email.trim())) e.email = 'Please enter a valid email address, like name@example.com.'
    if (form.password.length < MIN_PASSWORD) e.password = `Use at least ${MIN_PASSWORD} characters.`
    if (kind === 'student') {
      if (!form.date_of_birth) e.date_of_birth = 'Students need a date of birth, so we know if a parent must approve.'
      else if (age === null || form.date_of_birth > today) e.date_of_birth = 'Please enter a real date of birth.'
      else if (age < 8) e.date_of_birth = 'Please check the year: PRISM is for students in Classes 9 to 12.'
    }
    return e
  }

  function focusFirst(e: FieldErrors<FieldKey>) {
    const first = FIELDS.find((k) => e[k])
    if (first) refs.current[first]?.focus()
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    setGeneral(null)
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return focusFirst(e)
    setBusy(true)
    try {
      const user = await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: kind as Role,
        date_of_birth: kind === 'student' ? form.date_of_birth : null,
        preferred_language: form.preferred_language,
      })
      const dest = next ?? (user.role === 'parent' ? '/family' : user.role === 'educator' ? '/counsellor' : '/home')
      go(dest, user.role)
    } catch (err) {
      setBusy(false)
      const { fields, general: g } = fieldErrorsFrom(err, FIELDS)
      setErrors(fields)
      if (g) setGeneral({ text: g, offline: err instanceof ApiError && err.code === 'NETWORK' })
      focusFirst(fields)
    }
  }

  const ref = (k: FieldKey) => (el: HTMLElement | null) => {
    refs.current[k] = el
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Private, and it takes about a minute."
      aside={
        <>
          <h2 className="text-2xl font-bold leading-tight">What happens next</h2>
          <motion.ol key={kind} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mt-5 space-y-4">
            {NEXT_STEPS[kind].map((s, i) => (
              <AsidePoint key={s.title} icon={<span className="num text-xs font-semibold">0{i + 1}</span>} title={s.title}>
                {s.body}
              </AsidePoint>
            ))}
          </motion.ol>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5" aria-busy={busy}>
        <fieldset>
          <legend className="mb-2 block text-sm font-medium">I am a…</legend>
          <div role="radiogroup" aria-label="I am a" className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => {
              const on = kind === r.value
              return (
                <button
                  key={r.value}
                  ref={r.value === 'student' ? ref('role') : undefined}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setKind(r.value)}
                  onKeyDown={(e) => {
                    const i = ROLES.findIndex((x) => x.value === kind)
                    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
                    if (!d) return
                    e.preventDefault()
                    const nextKind = ROLES[(i + d + ROLES.length) % ROLES.length]
                    setKind(nextKind.value)
                    ;(e.currentTarget.parentElement?.children[(i + d + ROLES.length) % ROLES.length] as HTMLElement | undefined)?.focus()
                  }}
                  tabIndex={on ? 0 : -1}
                  className={cx(
                    'relative flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 text-center transition-colors',
                    on ? 'bg-primary/10 text-ink' : 'bg-surface-2 text-muted hairline hover:text-ink',
                  )}
                  style={on ? { boxShadow: 'inset 0 0 0 1.5px rgb(var(--primary))' } : undefined}
                >
                  {on && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" aria-hidden />}
                  <r.icon className={cx('h-5 w-5', on && 'text-primary')} aria-hidden />
                  <span className="text-sm font-semibold">{r.label}</span>
                  <span className="text-[11px] leading-tight text-muted">{r.hint}</span>
                </button>
              )
            })}
          </div>
          {errors.role && <p className="mt-1.5 text-xs text-bad">{errors.role}</p>}
        </fieldset>

        <Field label="Full name" htmlFor="reg-name" error={errors.full_name}>
          <Input ref={ref('full_name')} id="reg-name" autoComplete="name" value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} aria-invalid={!!errors.full_name} placeholder={kind === 'student' ? 'e.g. Priya Sharma' : 'Your name'} />
        </Field>

        <Field label="Email" htmlFor="reg-email" error={errors.email}>
          <Input ref={ref('email')} id="reg-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={form.email} onChange={(e) => set('email')(e.target.value)} aria-invalid={!!errors.email} placeholder="you@example.com" />
        </Field>

        <Field label="Password" htmlFor="reg-password" error={errors.password} hint={<PasswordHint value={form.password} />}>
          <PasswordInput ref={ref('password')} id="reg-password" autoComplete="new-password" value={form.password} onChange={(e) => set('password')(e.target.value)} aria-invalid={!!errors.password} aria-describedby="reg-password-hint" />
        </Field>

        {kind === 'student' && (
          <Field label="Date of birth" htmlFor="reg-dob" error={errors.date_of_birth} hint="We use it only to check whether a parent needs to approve.">
            <Input ref={ref('date_of_birth')} id="reg-dob" type="date" max={today} min="1990-01-01" value={form.date_of_birth} onChange={(e) => set('date_of_birth')(e.target.value)} aria-invalid={!!errors.date_of_birth} />
          </Field>
        )}
        {minor && (
          <Note icon={<Info className="h-4 w-4 text-neon" aria-hidden />}>A parent or guardian will be asked to approve before we use your answers.</Note>
        )}

        <div aria-live="polite">
          {general && (
            <FormAlert icon={general.offline ? <WifiOff className="h-4 w-4" aria-hidden /> : <AlertCircle className="h-4 w-4" aria-hidden />}>{general.text}</FormAlert>
          )}
        </div>

        <Button type="submit" size="lg" loading={busy} className="w-full">
          {busy ? 'Creating your account…' : 'Create account'}
          {!busy && <ArrowRight className="h-[18px] w-[18px]" aria-hidden />}
        </Button>
        <p className="text-center text-xs text-muted">We never ask for gender, caste, religion or community.</p>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to={next ? `/signin?next=${encodeURIComponent(next)}` : '/signin'} className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}

function PasswordHint({ value }: { value: string }) {
  const ok = value.length >= MIN_PASSWORD
  return (
    <span id="reg-password-hint" className={cx('inline-flex items-center gap-1', ok ? 'text-ok' : 'text-muted')}>
      {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
      At least {MIN_PASSWORD} characters{value.length > 0 && !ok ? ` (${MIN_PASSWORD - value.length} more)` : ''}
    </span>
  )
}

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-neon/10 px-3.5 py-3 text-sm" style={{ boxShadow: 'inset 0 0 0 1px rgb(var(--neon) / 0.25)' }}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  )
}
