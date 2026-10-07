// Landing hero. Desktop with motion: a pinned scroll story (beam → prism → six rays → branching career paths).
// Phones and reduced motion: the same composition, still, in normal page flow (no scroll-jacking).
import { motion, useMotionValueEvent, useScroll, useTransform, AnimatePresence } from 'motion/react'
import { ArrowRight, BadgeCheck, ChevronDown, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { CareerSummary, FairnessReport } from '@/api/types'
import { Button, Skeleton, Tip, cx } from '@/components/ui'
import { COMPONENTS, formatDate } from '@/lib/format'
import { homeFor, useSession } from '@/state/session'
import { useSettings } from '@/state/settings'
import { PrismScene, RAY_ORDER, SCENE_EMPTY_TOP, SCENE_H, SCENE_W } from './PrismScene'
import { SplitText } from './SplitText'

export interface HeroData {
  careers: CareerSummary[]
  careerTotal?: number
  sectorCount?: number
  weights?: Record<string, number>
  fairness?: FairnessReport
  fairnessLoading: boolean
  catalogLoading: boolean
}

const HEADLINE = [{ text: 'See every path.' }, { text: 'Choose yours together.', spectrum: true }]
const SUB = "Career guidance that weighs your interests, your family's budget and real job demand — and shows its working."

const STEPS = [
  {
    title: 'You are the light.',
    body: "PRISM starts with what you enjoy, what you are good at and what matters to you, plus your family's budget and hopes.",
  },
  {
    title: 'Six parts, each one shown.',
    body: 'Fit, job market, affordability, return, family hopes and automation risk. Nothing is hidden, so you can question any part.',
  },
  {
    title: 'Every path, side by side.',
    body: 'The six parts combine into one score for each career, with costs, scholarships and loans worked out. Then you choose, together.',
  },
]

// ---------------------------------------------------------------- shared bits
function Ctas({ size = 'lg', align = 'start', magnetic = true }: { size?: 'md' | 'lg'; align?: 'start' | 'center'; magnetic?: boolean }) {
  const navigate = useNavigate()
  const { user } = useSession()
  return (
    <div className={cx('flex flex-wrap items-center gap-3', align === 'center' && 'justify-center')}>
      <Button
        size={size}
        magnetic={magnetic}
        icon={<Sparkles className="h-[18px] w-[18px]" aria-hidden />}
        onClick={() => navigate(user ? homeFor(user.role) : '/register')}
      >
        {user ? 'Open PRISM' : 'Get started'}
        <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
      </Button>
      {!user && (
        <Link
          to="/signin"
          className={cx(
            'inline-flex items-center justify-center rounded-xl bg-surface-2/70 px-5 font-semibold text-ink backdrop-blur hairline transition-colors hover:bg-surface-2',
            size === 'lg' ? 'min-h-[52px] text-base' : 'h-11 text-[15px]',
          )}
        >
          Sign in
        </Link>
      )}
    </div>
  )
}

export function HeroChips({ data, align = 'start' }: { data: HeroData; align?: 'start' | 'center' }) {
  const f = data.fairness
  const passedCount = f?.probes.filter((p) => p.passed).length ?? 0
  return (
    <ul className={cx('flex min-h-[32px] flex-wrap items-center gap-2 text-xs', align === 'center' && 'justify-center')} aria-label="About PRISM">
      {data.fairnessLoading ? (
        <li>
          <Skeleton className="h-8 w-44 rounded-full" />
        </li>
      ) : f ? (
        <li>
          <Tip content={`${passedCount} of ${f.probes.length} fairness checks passed on ${formatDate(f.generated_at)}. Protected attributes used: ${f.protected_attributes_used.length === 0 ? 'none' : f.protected_attributes_used.join(', ')}.`}>
            <Link
              to="/trust"
              className={cx('inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-medium hairline', f.passed ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn')}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {f.passed ? 'Fairness checks passing' : `${f.probes.length - passedCount} fairness checks need attention`}
            </Link>
          </Tip>
        </li>
      ) : null}
      {data.catalogLoading ? (
        <li>
          <Skeleton className="h-8 w-48 rounded-full" />
        </li>
      ) : data.careerTotal ? (
        <li className="num inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2/70 px-3 text-muted hairline">
          <span className="font-semibold text-ink">{data.careerTotal}</span> careers
          {data.sectorCount ? (
            <>
              {' '}
              across <span className="font-semibold text-ink">{data.sectorCount}</span> fields
            </>
          ) : null}
        </li>
      ) : null}
      <li className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2/70 px-3 text-muted hairline">
        <BadgeCheck className="h-3.5 w-3.5 text-neon" aria-hidden />
        Every number shows its source
      </li>
    </ul>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-surface-2/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neon hairline backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-neon shadow-[0_0_10px_rgb(var(--neon))]" aria-hidden />
      {children}
    </div>
  )
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(900px 520px at 42% 70%, rgb(var(--primary) / 0.16), transparent 65%), radial-gradient(700px 420px at 80% 30%, rgb(var(--neon) / 0.07), transparent 60%)' }} />
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 12% 22%, rgb(255 255 255 / .5), transparent 60%), radial-gradient(1px 1px at 28% 78%, rgb(255 255 255 / .35), transparent 60%), radial-gradient(1px 1px at 47% 12%, rgb(255 255 255 / .4), transparent 60%), radial-gradient(1px 1px at 66% 64%, rgb(255 255 255 / .3), transparent 60%), radial-gradient(1px 1px at 83% 18%, rgb(255 255 255 / .45), transparent 60%), radial-gradient(1px 1px at 91% 84%, rgb(255 255 255 / .3), transparent 60%), radial-gradient(1.5px 1.5px at 7% 58%, rgb(255 255 255 / .35), transparent 60%), radial-gradient(1px 1px at 58% 38%, rgb(255 255 255 / .25), transparent 60%)',
        }}
      />
    </div>
  )
}

/** The six score parts with their published weights, as readable HTML (phones show this under the still scene). */
export function PartsLegend({ weights, className }: { weights?: Record<string, number>; className?: string }) {
  return (
    <ul className={cx('grid grid-cols-1 gap-x-6 gap-y-2 text-sm min-[440px]:grid-cols-2', className)}>
      {[...RAY_ORDER].reverse().map((k) => {
        const c = COMPONENTS.find((x) => x.key === k)!
        const w = weights?.[k]
        return (
          <li key={k} className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className={cx('h-2.5 w-2.5 shrink-0 rounded-full', k === 'disruption' && 'hatch')}
              style={k === 'disruption' ? undefined : { background: c.color, boxShadow: `0 0 10px ${c.color}` }}
            />
            <span className="truncate font-medium">{c.label}</span>
            {w !== undefined && (
              <span className="num ml-auto text-xs" style={{ color: c.color }}>
                {k === 'disruption' ? '−' : ''}
                {Math.round(w * 100)}%
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------- desktop scroll story
export function ScrollHero({ data }: { data: HeroData }) {
  const track = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLDivElement>(null)
  // Progress 0→1 while the pinned stage is on screen. Measured from page scroll (the stage pins straight away).
  const { scrollY } = useScroll()
  const range = useRef({ start: 0, length: 1 })
  const p = useTransform(scrollY, (v) => Math.min(1, Math.max(0, (v - range.current.start) / range.current.length)))
  const [box, setBox] = useState({ h: 460, max: 1.2 })
  const [step, setStep] = useState(-1)

  // Size the scene so it starts just below the headline, and how far it can grow without being cut off.
  useEffect(() => {
    const el = stage.current
    const hd = head.current
    if (!el || !hd) return
    const measure = () => {
      const W = el.clientWidth
      const H = el.clientHeight
      const t = track.current
      if (t) {
        const top = t.getBoundingClientRect().top + window.scrollY
        range.current = { start: Math.max(0, top - 64), length: Math.max(1, t.offsetHeight - H) }
      }
      const headBottom = hd.offsetTop + hd.offsetHeight
      const ratio = SCENE_W / SCENE_H
      // the top ~9 % of the scene is empty sky, so it may tuck under the headline's padding
      let h = Math.min(H * 0.7, (H - headBottom - 70) / (1 - SCENE_EMPTY_TOP))
      h = Math.max(220, h)
      const renderedW = Math.min(W, h * ratio)
      const max = Math.min((W * 0.97) / renderedW, (H - 24) / h, 1.9)
      setBox({ h, max: Math.max(1, max) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    ro.observe(hd)
    return () => ro.disconnect()
  }, [])

  useMotionValueEvent(p, 'change', (v) => setStep(v < 0.16 ? -1 : v < 0.36 ? 0 : v < 0.58 ? 1 : 2))

  const headOpacity = useTransform(p, [0, 0.13], [1, 0])
  const headY = useTransform(p, [0, 0.16], [0, -64])
  const headVisibility = useTransform(p, (v) => (v > 0.14 ? 'hidden' : 'visible'))
  const sceneScale = useTransform(p, [0.02, 0.3], [1, box.max])
  const cueOpacity = useTransform(p, [0, 0.05], [1, 0])
  const captionOpacity = useTransform(p, [0.14, 0.2], [0, 1])
  const captionVisibility = useTransform(p, (v) => (v < 0.14 ? 'hidden' : 'visible'))
  const bar = useTransform(p, [0.16, 0.8], [0, 1])

  return (
    <section ref={track} data-theme="dark" aria-label="Introduction" className="relative bg-bg text-ink" style={{ height: '300vh' }}>
      <div ref={stage} className="sticky top-16 h-[calc(100dvh-4rem)] min-h-[560px] overflow-hidden">
        <Backdrop />

        {/* headline: readable at once, recedes as the story begins */}
        <motion.div ref={head} style={{ opacity: headOpacity, y: headY, visibility: headVisibility }} className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-4xl flex-col items-center px-8 pt-[4.5vh] text-center">
          <Eyebrow>Career guidance for Classes 9–12</Eyebrow>
          <SplitText lines={HEADLINE} className="text-[clamp(2.5rem,min(5.2vw,8.6vh),4.6rem)] font-extrabold leading-[1.02] tracking-tight" delay={0.15} />
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.45 }}
            className="mt-4 max-w-2xl text-[clamp(1rem,1.25vw,1.15rem)] leading-relaxed text-muted"
          >
            {SUB}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.45 }} className="mt-6">
            <Ctas align="center" />
          </motion.div>
        </motion.div>

        {/* the scene grows to fill the stage as you scroll */}
        <motion.div className="absolute inset-x-0 bottom-0" style={{ height: box.h, scale: sceneScale, originY: 1, originX: 0.5 }}>
          <PrismScene mode="scroll" variant="wide" progress={p} careers={data.careers} weights={data.weights} className="h-full w-full" />
        </motion.div>

        {/* story captions */}
        <motion.div
          style={{ opacity: captionOpacity, visibility: captionVisibility }}
          className="absolute left-[max(24px,4vw)] top-8 z-10 w-[min(380px,32vw)]"
          aria-live="polite"
        >
          <div className="mb-4 flex items-center gap-3">
            <span className="num text-xs font-semibold tracking-[0.2em] text-neon">0{Math.max(0, step) + 1} / 03</span>
            <span className="relative h-px flex-1 overflow-hidden bg-[rgb(var(--line)/0.15)]">
              <motion.span className="absolute inset-0 origin-left" style={{ scaleX: bar, background: 'linear-gradient(90deg, rgb(var(--fit)), rgb(var(--market)), rgb(var(--afford)), rgb(var(--roi)), rgb(var(--family)), rgb(var(--disrupt)))' }} />
            </span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28 }}>
              <h2 className="text-[clamp(1.6rem,2.4vw,2.2rem)] font-bold leading-tight">{STEPS[Math.max(0, step)].title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{STEPS[Math.max(0, step)].body}</p>
              {step === 2 && (
                <>
                  {data.careers.length > 0 && data.careerTotal ? (
                    <p className="mt-3 text-xs text-muted">
                      Shown: {data.careers.length} of <span className="num">{data.careerTotal}</span> careers in the catalogue, the most in demand in each field.
                    </p>
                  ) : null}
                  <div className="mt-6">
                    <Ctas size="md" magnetic={false} />
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* facts and the scroll cue sit low, clear of the headline */}
        <motion.div style={{ opacity: headOpacity, visibility: headVisibility }} className="absolute bottom-5 left-[max(24px,4vw)] z-10 max-w-[60%]">
          <HeroChips data={data} />
        </motion.div>
        <motion.div style={{ opacity: cueOpacity }} className="pointer-events-none absolute bottom-5 right-[max(24px,4vw)] z-10">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface/60 px-3 text-xs text-muted backdrop-blur hairline">
            Scroll to follow the light <ChevronDown className="h-3.5 w-3.5 animate-bounce" aria-hidden />
          </span>
        </motion.div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- phones and reduced motion
export function StaticHero({ data, wide }: { data: HeroData; wide: boolean }) {
  const { reducedMotion } = useSettings()
  const mode = reducedMotion ? 'static' : 'intro'
  const fade = (delay: number) => (reducedMotion ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.45 } })
  return (
    <section data-theme="dark" aria-label="Introduction" className="relative overflow-hidden bg-bg text-ink">
      <Backdrop />
      <div className={cx('relative mx-auto max-w-page px-4 pb-14 pt-10 md:px-8 md:pt-16', wide && 'text-center')}>
        <Eyebrow>Career guidance for Classes 9–12</Eyebrow>
        <SplitText lines={HEADLINE} className={cx('font-extrabold leading-[1.04] tracking-tight', wide ? 'text-6xl' : 'text-[clamp(2.3rem,10.5vw,3.2rem)]')} delay={0.1} />
        <motion.p {...fade(0.45)} className={cx('mt-4 text-base leading-relaxed text-muted md:text-lg', wide && 'mx-auto max-w-2xl')}>
          {SUB}
        </motion.p>
        <motion.div {...fade(0.6)} className="mt-6">
          <Ctas align={wide ? 'center' : 'start'} magnetic={wide} />
        </motion.div>
        <motion.div {...fade(0.75)} className="mt-5">
          <HeroChips data={data} align={wide ? 'center' : 'start'} />
        </motion.div>

        <div className={cx('relative mt-8 overflow-hidden', wide ? 'mx-auto max-w-6xl' : '-mx-4')}>
          <PrismScene mode={mode} variant={wide ? 'wide' : 'compact'} careers={data.careers} weights={data.weights} className="h-auto w-full" />
        </div>
        {!wide && <PartsLegend weights={data.weights} className="mt-2 rounded-card bg-surface/70 p-4 hairline" />}

        <ol className={cx('mt-10 grid gap-4 text-left', wide ? 'md:grid-cols-3' : '')}>
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-card bg-surface/70 p-5 hairline">
              <span className="num mt-0.5 text-xs font-semibold tracking-[0.2em] text-neon">0{i + 1}</span>
              <div>
                <h2 className="text-lg font-bold leading-snug">{s.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
