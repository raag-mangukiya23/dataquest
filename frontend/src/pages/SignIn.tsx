// Sign in. Friendly API errors (wrong password, lockout, offline), show/hide password, honours ?next=.
import { AlertCircle, ArrowRight, Clock3, KeyRound, Lock, ShieldCheck, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { Button, Field, Input } from '@/components/ui'
import { AsidePoint, AuthLayout, FormAlert, PasswordInput } from '@/components/landing/AuthLayout'
import { useAfterAuth } from '@/components/landing/afterAuth'
import { safeNext } from '@/components/landing/util'
import { homeFor, useSession } from '@/state/session'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignIn() {
  const { login } = useSession()
  const go = useAfterAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | Error | null>(null)
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({})
  const passwordRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = 'Sign in · PRISM'
    // Developer tools may fill the form (window event); harmless in normal use.
    const onFill = (e: Event) => {
      const d = (e as CustomEvent<{ email?: string; password?: string }>).detail ?? {}
      if (d.email) setEmail(d.email)
      if (d.password) setPassword(d.password)
    }
    window.addEventListener('prism:fill-signin', onFill)
    return () => window.removeEventListener('prism:fill-signin', onFill)
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const fe: typeof fieldErr = {}
    if (!email.trim()) fe.email = 'Please enter your email.'
    else if (!EMAIL_RE.test(email.trim())) fe.email = 'Please enter a valid email address, like name@example.com.'
    if (!password) fe.password = 'Please enter your password.'
    setFieldErr(fe)
    setError(null)
    if (fe.email) return emailRef.current?.focus()
    if (fe.password) return passwordRef.current?.focus()
    setBusy(true)
    try {
      const user = await login(email, password)
      go(next ?? homeFor(user.role), user.role)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err : new Error('Something went wrong. Please try again.'))
      if (err instanceof ApiError && err.code === 'UNAUTHORIZED') {
        setPassword('')
        passwordRef.current?.focus()
      }
    }
  }

  const code = error instanceof ApiError ? error.code : undefined
  const alert = error ? (
    code === 'RATE_LIMITED' ? (
      <FormAlert tone="warn" icon={<Clock3 className="h-4 w-4 text-warn" aria-hidden />}>
        <b className="font-semibold">Too many tries.</b> {error.message}. This keeps your account safe.
      </FormAlert>
    ) : code === 'NETWORK' ? (
      <FormAlert icon={<WifiOff className="h-4 w-4" aria-hidden />}>{error.message}</FormAlert>
    ) : code === 'UNAUTHORIZED' ? (
      <FormAlert icon={<AlertCircle className="h-4 w-4" aria-hidden />}>
        <b className="font-semibold">{error.message}.</b> Check for typing mistakes, or use “Show password”. After a few wrong tries we pause sign-in for a few minutes.
      </FormAlert>
    ) : (
      <FormAlert icon={<AlertCircle className="h-4 w-4" aria-hidden />}>{error.message}</FormAlert>
    )
  ) : null

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={next ? 'Sign in to carry on where you were.' : 'Sign in to see your paths, your plan and your family’s conversation.'}
      aside={
        <>
          <h2 className="text-2xl font-bold leading-tight">
            Your answers, your <span className="spectrum-text">spectrum</span>.
          </h2>
          <ul className="mt-5 space-y-4">
            <AsidePoint icon={<Lock className="h-4 w-4" aria-hidden />} title="Private by default">
              Parents see the budget; students see their own results.
            </AsidePoint>
            <AsidePoint icon={<ShieldCheck className="h-4 w-4" aria-hidden />} title="Fair by design">
              No gender, caste or religion questions, ever.
            </AsidePoint>
            <AsidePoint icon={<KeyRound className="h-4 w-4" aria-hidden />} title="Shows its working">
              Every number says where it came from.
            </AsidePoint>
          </ul>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5" aria-busy={busy}>
        <Field label="Email" htmlFor="signin-email" error={fieldErr.email}>
          <Input
            ref={emailRef}
            id="signin-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErr.email}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password" htmlFor="signin-password" error={fieldErr.password}>
          <PasswordInput
            ref={passwordRef}
            id="signin-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fieldErr.password}
          />
        </Field>
        <div aria-live="polite">{alert}</div>
        <Button type="submit" size="lg" loading={busy} className="w-full">
          {busy ? 'Signing in…' : 'Sign in'}
          {!busy && <ArrowRight className="h-[18px] w-[18px]" aria-hidden />}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New to PRISM?{' '}
        <Link to={next ? `/register?next=${encodeURIComponent(next)}` : '/register'} className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
          Create account
        </Link>
      </p>
    </AuthLayout>
  )
}
