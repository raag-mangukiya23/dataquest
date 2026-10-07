// "How PRISM works in 60 seconds": an animated pipeline (answers → profile → six-part score → financial solver →
// conflict index → roadmap). Each stage opens its formulas, weights and settings from GET /system/methodology.
import { AlertTriangle, ArrowRight, Lock, Pause, Play, Scale } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, ErrorState, Skeleton, cx } from '@/components/ui'
import { Pipeline, StagePanel } from '@/components/landing/Pipeline'
import { STAGES } from '@/components/landing/stages'
import { useMediaQuery, useMethodology } from '@/components/landing/util'

const STEP_SECONDS = 10 // six steps × 10 s = the promised 60 seconds

export default function HowItWorks() {
  const m = useMethodology()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    document.title = 'How PRISM works · PRISM'
  }, [])

  // The guided tour advances one step every ten seconds and stops on the last step.
  useEffect(() => {
    if (!playing) return
    const t = window.setTimeout(() => {
      if (index >= STAGES.length - 1) setPlaying(false)
      else setIndex((i) => i + 1)
    }, STEP_SECONDS * 1000)
    return () => window.clearTimeout(t)
  }, [playing, index])

  const select = (i: number) => {
    setPlaying(false)
    setIndex(i)
  }
  const stage = STAGES[index]
  const dims = m.data?.dimensions.length
  const panel = (compact: boolean) => (
    <StagePanel stage={stage} index={index} methodology={m.data} loading={m.isLoading} error={m.error} onRetry={() => void m.refetch()} compact={compact} />
  )

  return (
    <div className="mx-auto max-w-page px-4 pb-20 pt-8 md:px-8 md:pt-12">
      <header className="mb-8 flex flex-col gap-5 md:mb-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neon">How it works</div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-extrabold leading-[1.05]">
            How PRISM works in <span className="spectrum-text">60 seconds</span>
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted md:text-[17px]">
            Six steps turn a student’s answers into a plan the whole family can check. Tap any step to see what it does and the exact formula behind it.
          </p>
          <div className="mt-4 flex min-h-[28px] flex-wrap gap-2 text-xs">
            {m.isLoading ? (
              <Skeleton className="h-7 w-64 rounded-full" />
            ) : m.data ? (
              <>
                <span className="num rounded-full bg-surface-2 px-2.5 py-1 text-muted hairline">engine {m.data.engine_version}</span>
                <span className="num rounded-full bg-surface-2 px-2.5 py-1 text-muted hairline">scoring {m.data.scoring_config_version}</span>
                <span className="num rounded-full bg-surface-2 px-2.5 py-1 text-muted hairline">profile {m.data.vector_spec_version}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={playing ? 'secondary' : 'primary'}
            onClick={() => {
              if (playing) return setPlaying(false)
              if (index >= STAGES.length - 1) setIndex(0)
              setPlaying(true)
            }}
            icon={playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            aria-pressed={playing}
          >
            {playing ? 'Pause the tour' : 'Play the 60-second tour'}
          </Button>
          <span className="num text-sm text-muted" aria-live="polite">
            Step {index + 1} of {STAGES.length}
          </span>
        </div>
      </header>

      {desktop ? (
        <>
          <Pipeline index={index} onSelect={select} dims={dims} playing={playing} vertical={false} renderPanel={() => null} stepSeconds={STEP_SECONDS} />
          <section aria-label={stage.title} className="card mt-4 p-6 md:p-8">
            {panel(false)}
          </section>
        </>
      ) : (
        <Pipeline index={index} onSelect={select} dims={dims} playing={playing} vertical renderPanel={() => panel(true)} stepSeconds={STEP_SECONDS} />
      )}

      {/* honesty: what the method cannot do, and the safeguards around it */}
      <section aria-label="Limits and safeguards" className="mt-14">
        <h2 className="text-2xl font-bold md:text-3xl">What it can’t do, and how it stays fair</h2>
        <p className="mt-2 max-w-2xl text-[15px] text-muted">Straight from the published methodology, word for word.</p>
        {m.isError ? (
          <div className="mt-5">
            <ErrorState error={m.error} onRetry={() => void m.refetch()} title="Could not load the methodology" />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <ListCard icon={<AlertTriangle className="h-5 w-5" aria-hidden />} tone="warn" title="Limitations" items={m.data?.limitations} loading={m.isLoading} empty="No limitations are listed right now." />
            <ListCard icon={<Scale className="h-5 w-5" aria-hidden />} tone="ok" title="Fairness safeguards" items={m.data?.fairness_safeguards} loading={m.isLoading} empty="No safeguards are listed right now." />
            <ListCard icon={<Lock className="h-5 w-5" aria-hidden />} tone="neon" title="Privacy rules" items={m.data?.privacy_rules} loading={m.isLoading} empty="No privacy rules are listed right now." />
          </div>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link to="/trust" className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-surface-2 px-4 text-sm font-semibold hairline hover:bg-surface">
            See the data sources and fairness checks <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link to="/register" className="inline-flex min-h-[48px] items-center gap-2 rounded-xl px-4 text-sm font-semibold text-primary hover:underline">
            Try it yourself <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  )
}

function ListCard({ icon, title, items, loading, empty, tone }: { icon: ReactNode; title: string; items?: string[]; loading: boolean; empty: string; tone: 'warn' | 'ok' | 'neon' }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <span className={cx('grid h-10 w-10 place-items-center rounded-xl', tone === 'warn' ? 'bg-warn/15 text-warn' : tone === 'ok' ? 'bg-ok/15 text-ok' : 'bg-neon/15 text-neon')}>{icon}</span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      {loading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      ) : items && items.length > 0 ? (
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted">
          {items.map((x) => (
            <li key={x} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--muted))]" />
              {x}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">{empty}</p>
      )}
    </div>
  )
}
