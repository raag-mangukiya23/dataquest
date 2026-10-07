// Developer / judging tools. Only bundled when VITE_DEV_TOOLS=true (loaded with a dynamic import in App.tsx).
import { useMutation, useQuery } from '@tanstack/react-query'
import { Presentation, RotateCcw, Wrench, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AUTH_MODE, DATA_MODE } from '@/api/client'
import { demo } from '@/api/endpoints'
import type { Role } from '@/api/types'
import { Badge, Button, cx } from '@/components/ui'
import { homeFor, useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

const PASSWORD_FALLBACK = 'Prism@Demo2026'
const STAFF = [
  { label: 'Counsellor', email: 'counsellor@prism.example' },
  { label: 'Admin', email: 'admin@prism.example' },
]

export default function DevTools() {
  const [open, setOpen] = useState(false)
  const { reducedMotion } = useSettings()
  return (
    <div className="no-print fixed bottom-[76px] left-3 z-[55] md:bottom-4 md:left-auto md:right-4 md:flex md:flex-col md:items-end">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 10 }}
            transition={{ duration: 0.18 }}
            className="glass mb-2 max-h-[70dvh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-4 shadow-lift hairline"
            role="dialog"
            aria-label="Developer tools"
          >
            <Panel onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close developer tools' : 'Open developer tools'}
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-2/90 px-3 text-xs font-semibold text-muted shadow-lift backdrop-blur hairline hover:text-ink"
      >
        {open ? <X className="h-4 w-4" /> : <Wrench className="h-4 w-4" />} Dev
      </button>
    </div>
  )
}

function Panel({ onClose }: { onClose: () => void }) {
  const { user, login, switchMockRole } = useSession()
  const navigate = useNavigate()
  const personas = useQuery({ queryKey: ['demo', 'personas'], queryFn: demo.personas, retry: false, staleTime: 5 * 60_000 })
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const reset = useMutation({ mutationFn: demo.reset, onSettled: () => setConfirm(false) })

  const signIn = async (email: string, password: string) => {
    setBusy(email)
    setErr(null)
    try {
      const u = await login(email, password)
      onClose()
      navigate(homeFor(u.role))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const pw = personas.data?.[0]?.demo_password ?? PASSWORD_FALLBACK

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Dev tools</span>
        <Badge color={DATA_MODE === 'api' ? 'rgb(var(--ok))' : 'rgb(var(--warn))'}>data: {DATA_MODE}</Badge>
        <Badge color={AUTH_MODE === 'live' ? 'rgb(var(--ok))' : 'rgb(var(--warn))'}>auth: {AUTH_MODE}</Badge>
      </div>
      {user && (
        <p className="text-xs text-muted">
          Signed in as {user.full_name} ({user.role})
        </p>
      )}

      {personas.data && personas.data.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Sign in as demo family</h3>
          <ul className="space-y-2">
            {personas.data.map((p) => (
              <li key={p.key} className="rounded-xl bg-surface-2 p-2.5 hairline">
                <div className="font-medium">
                  {p.student_name} <span className="text-xs font-normal text-muted">· {p.location}</span>
                </div>
                <div className="mb-2 text-xs text-muted">{p.scenario}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" loading={busy === p.student_email} onClick={() => void signIn(p.student_email, p.demo_password)}>
                    Student
                  </Button>
                  <Button size="sm" variant="secondary" loading={busy === p.parent_email} onClick={() => void signIn(p.parent_email, p.demo_password)}>
                    Parent
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Staff</h3>
        <div className="flex flex-wrap gap-2">
          {STAFF.map((s) => (
            <Button key={s.email} size="sm" variant="secondary" loading={busy === s.email} onClick={() => void signIn(s.email, pw)}>
              {s.label}
            </Button>
          ))}
        </div>
      </section>
      {err && <p className="text-xs text-bad" role="alert">{err}</p>}

      {AUTH_MODE === 'mock' && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Mock role</h3>
          <div className="flex flex-wrap gap-1.5">
            {(['student', 'parent', 'educator', 'admin'] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => void switchMockRole(r).then(() => navigate(homeFor(r)))}
                className={cx('h-9 rounded-lg px-3 text-xs font-medium hairline', user?.role === r ? 'bg-primary text-primary-ink' : 'bg-surface-2')}
              >
                {r}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-wrap gap-2 hairline-t pt-3">
        <Link to="/presenter" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-sm font-medium hairline">
          <Presentation className="h-4 w-4" aria-hidden /> Presenter
        </Link>
        {personas.isSuccess &&
          (confirm ? (
            <span className="flex items-center gap-2">
              <Button size="sm" variant="danger" loading={reset.isPending} onClick={() => reset.mutate()}>
                Yes, reset
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirm(true)}>
              Reset demo data
            </Button>
          ))}
      </section>
      {reset.data && (
        <p className="text-xs text-ok">
          Reset: {reset.data.personas} families, {reset.data.runs_precomputed} runs in {reset.data.took_ms} ms.
        </p>
      )}
      {reset.error && <p className="text-xs text-bad">{(reset.error as Error).message}</p>}
    </div>
  )
}
