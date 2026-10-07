// The plain-language summary (GET /analysis/runs/{id}/narrative?lang=…) with read-aloud.
import { Pause, Sparkles, Volume2 } from 'lucide-react'
import { useNarrative } from '@/api/queries'
import type { Lang } from '@/api/endpoints'
import { Badge, Button, ErrorState, Skeleton, cx } from '@/components/ui'
import { useSettings } from '@/state/settings'
import { useSpeech } from './useSpeech'

const LANG_NAME: Record<Lang, string> = { en: 'English', ta: 'Tamil', hi: 'Hindi' }

export function NarrativeCard({ runId, large = false, className }: { runId: string; large?: boolean; className?: string }) {
  const { settings } = useSettings()
  const lang = settings.language
  const q = useNarrative(runId, lang)
  const speech = useSpeech(lang)

  if (q.isLoading) {
    return (
      <div className={cx('card p-5', className)} aria-busy="true" aria-label="Loading the summary">
        <Skeleton className="h-6 w-3/4" />
        <div className="mt-4 space-y-2.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    )
  }
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="The summary could not load" />
  const n = q.data
  if (!n) return null
  const text = [n.headline, ...n.bullets].join('. ')

  return (
    <section aria-labelledby="summary-title" className={cx('card relative overflow-hidden p-5 md:p-6', className)}>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-neon">In plain words</span>
        {n.source === 'model' && (
          <Badge color="rgb(var(--primary))" title={n.model ? `Rephrased by ${n.model}; every number comes from PRISM's own results.` : undefined}>
            <Sparkles className="h-3 w-3" aria-hidden /> Rephrased by AI
          </Badge>
        )}
        {lang !== 'en' && !n.translation_reviewed && (
          <Badge className="bg-surface-2 text-muted hairline">{LANG_NAME[lang]} wording not yet checked by a native speaker</Badge>
        )}
        {speech.available && (
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            icon={speech.speaking ? <Pause className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
            onClick={() => (speech.speaking ? speech.stop() : speech.speak(text))}
            aria-pressed={speech.speaking}
          >
            {speech.speaking ? 'Stop' : 'Read aloud'}
          </Button>
        )}
      </div>
      <h2 id="summary-title" className={cx('relative mt-3 font-semibold leading-snug', large ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl')} lang={lang}>
        {n.headline}
      </h2>
      <ul className={cx('relative mt-4 space-y-2.5', large ? 'text-lg' : 'text-[15px]')} lang={lang}>
        {n.bullets.map((b, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-neon/80" />
            <span className="text-ink/90">{b}</span>
          </li>
        ))}
      </ul>
      <p className="relative mt-4 text-xs text-muted" lang={lang}>
        {n.notice}
      </p>
    </section>
  )
}
