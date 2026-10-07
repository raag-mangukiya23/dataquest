// First-visit guided tour: four steps with a spotlight cut-out. Shown to students and parents once.
// Targets are found in the shell's DOM (by landmark / aria-label) so the shell needs no extra markup.
import { ArrowRight, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

interface Step {
  title: string
  body: string
  find: () => Element | null
}

const visible = (el: Element | null) => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? el : null
}
const firstVisible = (sel: string) => Array.from(document.querySelectorAll(sel)).find((e) => visible(e)) ?? null

const STEPS: Step[] = [
  { title: 'Find your way', body: 'Your results, family view and plan live here. Tap any of them at any time.', find: () => firstVisible('nav[aria-label="Main"]') },
  {
    title: 'Search anything',
    body: 'Look up a career, a scholarship or a page. On a computer press Ctrl K.',
    find: () => Array.from(document.querySelectorAll('header button')).find((b) => visible(b) && (b.getAttribute('aria-label') === 'Search' || b.textContent?.includes('Search'))) ?? null,
  },
  { title: 'Never miss a date', body: 'The bell shows exam and scholarship deadlines coming up in the next 30 days.', find: () => firstVisible('header [aria-label^="Deadlines"]') },
  { title: 'Your page', body: 'Everything you open appears here. Every number shows its source, and whether it is checked or an estimate.', find: () => document.getElementById('main') },
]

const PAD = 8

export function Tour() {
  const { user } = useSession()
  const { settings, update, reducedMotion } = useSettings()
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [vw, setVw] = useState(() => window.innerWidth)
  const [ready, setReady] = useState(false)
  const show = !settings.tourDone && (user?.role === 'student' || user?.role === 'parent')

  const finish = useCallback(() => update({ tourDone: true }), [update])

  // wait a moment so the page has laid out before measuring
  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setReady(true), 700)
    return () => clearTimeout(t)
  }, [show])

  useLayoutEffect(() => {
    if (!show || !ready) return
    const measure = () => {
      setVw(window.innerWidth)
      const el = STEPS[i].find()
      setRect(el ? el.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [i, show, ready])

  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, finish])

  if (!show || !ready) return null

  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : finish())

  // Narrow screens: a simple welcome card instead of spotlights that would cover the content.
  if (vw < 390) {
    return (
      <div className="fixed inset-x-3 bottom-[72px] z-[65]" role="dialog" aria-label="Welcome to PRISM">
        <div className="glass rounded-2xl p-4 shadow-lift hairline">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-neon" aria-hidden />
            <div className="flex-1 text-sm">
              <div className="font-semibold">Welcome to PRISM</div>
              <p className="mt-1 text-muted">Use the bar at the bottom to move around. Every number shows where it came from.</p>
            </div>
          </div>
          <Button size="sm" className="mt-3 w-full" onClick={finish}>
            Got it
          </Button>
        </div>
      </div>
    )
  }

  const step = STEPS[i]
  const h = window.innerHeight
  const hole = rect
    ? { x: Math.max(4, rect.left - PAD), y: Math.max(4, rect.top - PAD), w: Math.min(vw - 8, rect.width + PAD * 2), h: Math.min(h - 8, rect.height + PAD * 2) }
    : null
  // a big target (main content): limit the visible hole to the viewport
  if (hole && hole.y + hole.h > h - 4) hole.h = h - 4 - hole.y
  if (hole && hole.x + hole.w > vw - 4) hole.w = vw - 4 - hole.x
  const cardW = Math.min(340, vw - 24)
  let cx = 12
  let cy = h / 2 - 90
  if (hole) {
    const below = hole.y + hole.h + 12
    const above = hole.y - 12 - 190
    const right = hole.x + hole.w + 12
    if (hole.w < vw * 0.4 && right + cardW < vw - 12 && hole.h > h * 0.5) {
      cx = right
      cy = Math.min(h - 210, Math.max(12, hole.y + 40))
    } else if (below + 190 < h) {
      cx = Math.min(vw - cardW - 12, Math.max(12, hole.x + hole.w - cardW))
      cy = below
    } else if (above > 12) {
      cx = Math.min(vw - cardW - 12, Math.max(12, hole.x))
      cy = above
    } else {
      // large target: sit at the bottom-centre of the viewport, not over the content's heading
      cx = (vw - cardW) / 2
      cy = Math.max(12, h - 200 - (vw < 768 ? 84 : 16))
    }
  }
  const t = reducedMotion ? { duration: 0 } : { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const }

  return (
    <div className="fixed inset-0 z-[65]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <svg className="absolute inset-0 h-full w-full" aria-hidden onClick={finish}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {hole && <motion.rect initial={false} animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h }} transition={t} rx={14} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgb(0 0 0 / 0.62)" mask="url(#tour-mask)" />
        {hole && (
          <motion.rect
            initial={false}
            animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h }}
            transition={t}
            rx={14}
            fill="none"
            stroke="rgb(var(--neon))"
            strokeWidth={2}
          />
        )}
      </svg>
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          className="glass absolute rounded-2xl p-5 shadow-lift hairline"
          style={{ width: cardW, left: cx, top: cy }}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <button type="button" onClick={finish} aria-label="Close the tour" className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
          <div className="num text-xs font-semibold uppercase tracking-[0.18em] text-neon">
            {i + 1} of {STEPS.length}
          </div>
          <h2 id="tour-title" className="mt-1 pr-8 text-lg font-semibold">
            {step.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{step.body}</p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex gap-1" aria-hidden>
              {STEPS.map((_, n) => (
                <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-neon' : 'w-1.5 bg-muted/40'}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={finish}>
                Skip
              </Button>
              <Button size="sm" onClick={next} autoFocus>
                {i < STEPS.length - 1 ? 'Next' : 'Done'} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
