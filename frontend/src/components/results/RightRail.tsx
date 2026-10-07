// Right rail of the results screen: next steps, the family conversation, robustness and data-quality notes.
import { AlertCircle, ArrowRight, Download, GitCompareArrows, MessagesSquare, Route, Share2, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { analysis, type Lang } from '@/api/endpoints'
import { openBlob } from '@/api/client'
import type { AnalysisRun, Role } from '@/api/types'
import { BandPill, Meter } from '@/components/score'
import { Roll } from './Roll'
import { Button, InfoTip, useToast } from '@/components/ui'
import { componentMeta, pct } from '@/lib/format'
import type { ScoreComponent } from '@/api/types'


export function ReportDownload({ runId, compact = false }: { runId: string; compact?: boolean }) {
  const lang: Lang = 'en'
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  async function go() {
    setBusy(true)
    try {
      const blob = await analysis.report(runId, lang)
      openBlob(blob)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'The report could not be downloaded.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={compact ? 'flex flex-wrap items-center gap-2' : 'flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row'}>
      <Button variant="secondary" icon={<Download className="h-4 w-4" aria-hidden />} loading={busy} onClick={() => void go()} className="flex-1 whitespace-nowrap">
        Family report
      </Button>
    </div>
  )
}

export function NextSteps({ run, link, onShare }: { run: AnalysisRun; link: (p: string) => string; onShare?: () => void }) {
  const items = [
    { to: '/what-if', label: 'Try a what-if', hint: 'Change savings or priorities and see the list move', icon: SlidersHorizontal },
    { to: '/compare', label: 'Compare careers', hint: 'Two or three side by side', icon: GitCompareArrows },
    { to: '/plan', label: 'Make a plan', hint: 'Exams, deadlines and a 5-year roadmap', icon: Route },
  ]
  return (
    <section aria-labelledby="next-steps" className="card p-5">
      <h2 id="next-steps" className="text-lg font-semibold">
        Next steps
      </h2>
      <ul className="mt-3 space-y-1.5">
        {items.map((i) => (
          <li key={i.to}>
            <Link to={link(i.to)} className="group flex min-h-[52px] items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <i.icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{i.label}</span>
                <span className="block text-xs text-muted">{i.hint}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-2 border-t border-[rgb(var(--line)/var(--line-alpha))] pt-4">
        <ReportDownload runId={run.run_id} />
        {onShare && (
          <Button variant="ghost" icon={<Share2 className="h-4 w-4" aria-hidden />} onClick={onShare} className="w-full">
            Share my spectrum card
          </Button>
        )}
      </div>
    </section>
  )
}

export function ConflictMini({ run, role, link }: { run: AnalysisRun; role: Role | undefined; link: (p: string) => string }) {
  const c = run.conflict
  const n = c.top_drivers.length
  const showNumber = c.visibility === 'full'
  return (
    <section aria-labelledby="conflict-mini" className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="conflict-mini" className="flex items-center gap-1 text-lg font-semibold">
          Family conversation <InfoTip term="conflict" />
        </h2>
        <BandPill value={c.band} />
      </div>
      {showNumber ? (
        <div className="mt-3 flex items-end gap-3">
          <Roll value={c.index} className="text-4xl font-semibold leading-none" />
          <span className="pb-1 text-xs text-muted">out of 100 · lower means you agree more</span>
        </div>
      ) : null}
      <p className="mt-3 text-sm text-ink/90">{c.summary}</p>
      {n > 0 && (
        <Link to={link('/family')} className="mt-4 inline-flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl bg-surface-2 px-4 text-sm font-semibold hairline hover:bg-primary/15">
          <span className="inline-flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-family" aria-hidden />
            {n} {n === 1 ? 'thing' : 'things'} to talk about
          </span>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
      {role === 'student' && c.bridge_careers.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Careers you both like: {c.bridge_careers.map((b) => b.career.name).join(', ')}
        </p>
      )}
    </section>
  )
}

export function RobustnessCard({ run }: { run: AnalysisRun }) {
  const s = run.sensitivity
  const top = run.recommendations[0]
  return (
    <section aria-labelledby="robust-title" className="card p-5">
      <h2 id="robust-title" className="flex items-center gap-1 text-lg font-semibold">
        <ShieldCheck className="mr-1 h-5 w-5 text-neon" aria-hidden /> How steady is #1? <InfoTip term="robustness" />
      </h2>
      {!s ? (
        <p className="mt-2 text-sm text-muted">The steadiness check was not run for this result. Re-running the results adds it.</p>
      ) : (
        <>
          <div className="mt-3 flex items-end gap-2">
            <Roll value={s.top1_stability * 100} suffix="%" className="text-4xl font-semibold leading-none" />
          </div>
          <Meter value={s.top1_stability} className="mt-3" label="Share of tests where the first place stayed the same" />
          <p className="mt-3 text-sm text-ink/90">
            {top ? <b className="font-semibold">{top.career.name}</b> : 'The first career'} stayed first in {pct(s.top1_stability)} of{' '}
            <span className="num">{s.scenarios}</span> tests where each factor's importance moved by ±{Math.round(s.perturbation * 100)}%.
          </p>
          {isComponent(s.most_sensitive_weight) && (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: componentMeta(s.most_sensitive_weight).color }} />
              Most sensitive to: <span className="font-medium text-ink">{componentMeta(s.most_sensitive_weight).label}</span>
            </p>
          )}
        </>
      )}
    </section>
  )
}

const isComponent = (k: string): k is ScoreComponent => ['fit', 'market', 'affordability', 'roi', 'family_alignment', 'disruption'].includes(k)

export function DataQualityCard({ run, showRetake }: { run: AnalysisRun; showRetake?: boolean }) {
  const w = run.data_quality.warnings
  if (!w.length) return null
  return (
    <section aria-labelledby="dq-title" className="card border-warn/30 p-5">
      <h2 id="dq-title" className="flex items-center gap-2 text-lg font-semibold">
        <AlertCircle className="h-5 w-5 text-warn" aria-hidden /> Worth knowing
      </h2>
      <ul className="mt-2 space-y-2 text-sm text-ink/90">
        {w.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
      {showRetake && (
        <Link to="/questionnaire" className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          Review the questionnaire <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </section>
  )
}
