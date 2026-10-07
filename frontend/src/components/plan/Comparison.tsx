// The what-if comparison: re-ranked list with FLIP layout animation, rank arrows, score deltas, funding pills.
import { ArrowDown, ArrowRight, ArrowUp, LogIn, LogOut, Minus } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import type { CareerDelta, RunComparison } from '@/api/types'
import { FundingPill, Meter } from '@/components/score'
import { Badge, Card, InfoTip, cx } from '@/components/ui'
import { useSettings } from '@/state/settings'

const LIMIT = 10

export function ComparisonView({ c, updating }: { c: RunComparison; updating?: boolean }) {
  const { reducedMotion } = useSettings()
  const name = (id: string) => c.deltas.find((d) => d.career_id === id)?.career_name ?? 'A career'
  const rows = [...c.deltas]
    .filter((d) => (d.new_rank ?? 99) <= LIMIT || (d.base_rank ?? 99) <= LIMIT)
    .sort((a, b) => (a.new_rank ?? 999) - (b.new_rank ?? 999) || (a.base_rank ?? 999) - (b.base_rank ?? 999))
  const similarity = Math.max(0, Math.min(1, c.rank_correlation))
  const conflict = c.conflict_index_delta
  return (
    <div className={cx('space-y-5 transition-opacity duration-200', updating && 'opacity-70')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            How similar to before{' '}
            <InfoTip text="How much the order of careers stayed the same (Kendall's tau). 1 means the same order; 0 or less means a big reshuffle." />
          </div>
          <div className="num mt-2 text-2xl font-semibold">{c.rank_correlation.toFixed(2)}</div>
          <Meter className="mt-3" value={similarity} label="Ranking similarity" />
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Family differences <InfoTip term="conflict_index" text="Change in the family conflict index (0–100). Lower means the student and parents agree more." />
          </div>
          <div className={cx('num mt-2 text-2xl font-semibold', conflict < 0 ? 'text-ok' : conflict > 0 ? 'text-warn' : '')}>
            {conflict > 0 ? '+' : ''}
            {conflict.toFixed(1)}
          </div>
          <div className="mt-1 text-xs text-muted">{conflict < 0 ? 'Closer together than before' : conflict > 0 ? 'A little further apart' : 'No change'}</div>
        </Card>
      </div>

      {(c.entered_top_k.length > 0 || c.left_top_k.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {c.entered_top_k.map((id) => (
            <Badge key={`in-${id}`} color="rgb(var(--ok))">
              <LogIn className="h-3.5 w-3.5" aria-hidden /> New in top picks: {name(id)}
            </Badge>
          ))}
          {c.left_top_k.map((id) => (
            <Badge key={`out-${id}`} color="rgb(var(--muted))">
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Left top picks: {name(id)}
            </Badge>
          ))}
        </div>
      )}

      <Card className="p-0">
        <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--line)/var(--line-alpha))] px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted">
          <span>New order</span>
          <span>Score change</span>
        </div>
        <LayoutGroup>
          <ol className="divide-y divide-[rgb(var(--line)/var(--line-alpha))]">
            <AnimatePresence initial={false}>
              {rows.map((d) => (
                <motion.li
                  key={d.career_id}
                  layout={reducedMotion ? false : 'position'}
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                  className="px-4 py-3 sm:px-5"
                >
                  <DeltaRow d={d} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </LayoutGroup>
      </Card>

      {c.summary.length > 0 && (
        <Card>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">What changed</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {c.summary.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>{prettySummary(s)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

const CLASS_WORDS: Record<string, string> = { comfortable: 'comfortable', stretch: 'a stretch', loan_dependent: 'needs a loan', infeasible: 'out of reach' }
/** Backend summary lines use raw class keys ("infeasible -> loan_dependent"); make them readable. */
function prettySummary(s: string) {
  return s.replace(/\b(comfortable|stretch|loan_dependent|infeasible)\b/g, (m) => CLASS_WORDS[m] ?? m).replace(/->/g, '→')
}

function DeltaRow({ d }: { d: CareerDelta }) {
  const moved = d.base_rank !== null && d.new_rank !== null ? d.base_rank - d.new_rank : 0
  const delta = Math.round(d.score_delta * 1000) / 10
  return (
    <div className="flex items-center gap-3">
      <div className="num w-8 shrink-0 text-center text-lg font-semibold">{d.new_rank ?? '—'}</div>
      <RankArrow moved={moved} base={d.base_rank} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{d.career_name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {d.base_class && d.new_class && d.base_class !== d.new_class ? (
            <>
              <FundingPill value={d.base_class} />
              <ArrowRight className="h-3 w-3 text-muted" aria-label="becomes" />
              <motion.span key={d.new_class} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                <FundingPill value={d.new_class} />
              </motion.span>
            </>
          ) : d.new_class ? (
            <FundingPill value={d.new_class} />
          ) : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-sm">{d.new_score !== null ? Math.round(d.new_score * 100) : '—'}</div>
        <div className={cx('num text-xs', delta > 0 ? 'text-ok' : delta < 0 ? 'text-bad' : 'text-muted')}>
          {delta > 0 ? '+' : ''}
          {delta.toFixed(1)}
        </div>
      </div>
    </div>
  )
}

function RankArrow({ moved, base }: { moved: number; base: number | null }) {
  const label = base === null ? 'new' : moved > 0 ? `up ${moved} from ${base}` : moved < 0 ? `down ${-moved} from ${base}` : 'no change'
  return (
    <motion.span
      key={`${moved}`}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className={cx('inline-flex w-12 shrink-0 items-center gap-0.5 text-xs font-semibold', moved > 0 ? 'text-ok' : moved < 0 ? 'text-bad' : 'text-muted')}
      aria-label={label}
      title={label}
    >
      {moved > 0 ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : moved < 0 ? <ArrowDown className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}
      <span className="num">{moved !== 0 ? Math.abs(moved) : ''}</span>
    </motion.span>
  )
}
