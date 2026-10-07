// Presenter mode: the demo walkthrough as a teleprompter with timers and links into the app.
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, ExternalLink, Presentation, Timer } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { demo } from '@/api/endpoints'
import { Badge, Button, EmptyState, ErrorState, PageSkeleton, cx } from '@/components/ui'
import { useSettings } from '@/state/settings'

/** Map an API call in the walkthrough to the screen that shows it. */
export function routeFor(method: string, path: string): string {
  const p = path.replace(/^\/api\/v1/, '')
  if (p.startsWith('/system/')) return '/app/trust'
  if (/^\/students\/[^/]+\/traits/.test(p)) return '/profile'
  if (/^\/families\/[^/]+\/finance/.test(p)) return '/family/budget'
  if (p.endsWith('/conflict')) return '/family'
  if (p.endsWith('/what-if')) return '/what-if'
  if (p.endsWith('/roadmap')) return '/plan'
  if (p.startsWith('/local-opportunities')) return '/explore'
  if (p.endsWith('/narrative')) return '/results'
  if (p.endsWith('/deadlines') || p.includes('/reminders')) return '/plan'
  if (p.startsWith('/analysis/runs') || (method === 'POST' && p.startsWith('/analysis'))) return '/results'
  if (p.startsWith('/scholarships')) return '/scholarships'
  if (p.startsWith('/loans')) return '/loans'
  if (p.startsWith('/careers')) return '/explore'
  return '/home'
}

function readNum(k: string, d: number) {
  try {
    const v = sessionStorage.getItem(k)
    return v == null || Number.isNaN(Number(v)) ? d : Number(v)
  } catch {
    return d
  }
}
function writeNum(k: string, v: number) {
  try {
    sessionStorage.setItem(k, String(v))
  } catch {
    /* ignore */
  }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`

export default function Presenter() {
  const q = useQuery({ queryKey: ['demo', 'walkthrough'], queryFn: demo.walkthrough, retry: false })
  const [i, setI] = useState(() => readNum('prism.presenter.step', 0))
  const [stepStart, setStepStart] = useState(() => readNum('prism.presenter.stepStart', Date.now()))
  const [start] = useState(() => {
    const v = readNum('prism.presenter.start', Date.now())
    writeNum('prism.presenter.start', v)
    return v
  })
  const firstStep = useRef(true)
  const [now, setNow] = useState(() => Date.now())
  const navigate = useNavigate()
  const { reducedMotion } = useSettings()
  const steps = q.data?.steps ?? []

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    writeNum('prism.presenter.step', i)
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    const t = Date.now()
    setStepStart(t)
    writeNum('prism.presenter.stepStart', t)
  }, [i])
  useEffect(() => {
    if (steps.length && i > steps.length - 1) setI(0)
  }, [steps.length, i])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return
      if (e.key === 'ArrowRight') setI((x) => Math.min(steps.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [steps.length])

  if (q.isLoading) return <PageSkeleton />
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="The walkthrough is not available (is demo mode on?)" />
  if (!steps.length) return <EmptyState icon={<Presentation className="h-6 w-6" />} title="No walkthrough steps">The backend returned an empty walkthrough.</EmptyState>

  const s = steps[Math.min(i, steps.length - 1)]
  const stepElapsed = (now - stepStart) / 1000
  const totalElapsed = (now - start) / 1000
  const over = stepElapsed > s.seconds
  const route = routeFor(s.call.method, s.call.path)

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Steps" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-1 lg:px-0">
        {steps.map((x, n) => (
          <button
            key={x.step}
            type="button"
            onClick={() => setI(n)}
            aria-current={n === i ? 'step' : undefined}
            className={cx('flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-3 text-left text-sm lg:w-full', n === i ? 'bg-surface-2 font-semibold hairline' : 'text-muted hover:bg-surface-2')}
          >
            <span className={cx('num grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs', n < i ? 'bg-ok/20 text-ok' : n === i ? 'bg-neon/20 text-neon' : 'bg-surface-2')}>{x.step}</span>
            <span className="whitespace-nowrap lg:truncate lg:whitespace-normal">{x.title}</span>
          </button>
        ))}
      </nav>
      <div>
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <Badge color={over ? 'rgb(var(--warn))' : 'rgb(var(--neon))'}>
            <Timer className="h-3.5 w-3.5" aria-hidden />
            <span className="num">
              {mmss(stepElapsed)} / {mmss(s.seconds)}
            </span>
          </Badge>
          <Badge color="rgb(var(--muted))">
            <span className="num">
              Total {mmss(totalElapsed)} / {mmss(q.data!.total_seconds)}
            </span>
          </Badge>
          <span className="ml-auto text-xs text-muted">Use ← → keys</span>
        </div>
        <div className="mb-4 h-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-neon transition-[width] duration-500" style={{ width: `${Math.min(100, (stepElapsed / s.seconds) * 100)}%` }} />
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={s.step} initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neon">
              Step {s.step} of {steps.length} · {s.title}
            </div>
            <p className="mt-4 font-display text-3xl font-semibold leading-tight md:text-5xl">{s.say}</p>
            <div className="mt-8 rounded-xl bg-surface-2 p-4 hairline">
              <div className="font-mono text-xs text-muted">
                <span className="text-neon">{s.call.method}</span> <span className="break-all">{s.call.path}</span>
              </div>
              {s.show.length > 0 && <div className="mt-2 text-xs text-muted">Point at: {s.show.join(', ')}</div>}
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="mt-8 flex flex-wrap gap-2">
          <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} disabled={i === 0} onClick={() => setI(i - 1)}>
            Previous
          </Button>
          <Button variant="secondary" icon={<ExternalLink className="h-4 w-4" />} onClick={() => navigate(route)}>
            Open in app
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const t = Date.now()
              writeNum('prism.presenter.start', t)
              writeNum('prism.presenter.stepStart', t)
              window.location.reload()
            }}
          >
            Restart timers
          </Button>
          <Button disabled={i === steps.length - 1} onClick={() => setI(i + 1)}>
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
