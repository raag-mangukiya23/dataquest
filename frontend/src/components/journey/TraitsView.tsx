// The trait profile: Holland code hero, RIASEC radar and grouped bars with reliability dots.
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import { motion } from 'motion/react'
import type { TraitProfile, TraitScore } from '@/api/types'
import { Badge, Card, InfoTip, Tip, Term, cx } from '@/components/ui'
import { useSettings } from '@/state/settings'
import { DIMS, RIASEC_LETTERS, dimLabel } from './lib'

const GROUPS: { title: string; sub: string; dims: string[]; color: string }[] = [
  { title: 'Abilities', sub: 'From the timed puzzles', dims: ['apt_numerical', 'apt_verbal', 'apt_logical', 'apt_spatial'], color: 'rgb(var(--market))' },
  { title: 'Thinking style', sub: 'How you like to solve problems', dims: ['cog_analytical', 'cog_creative', 'cog_practical'], color: 'rgb(var(--fit))' },
  { title: 'What matters to you', sub: 'Your values at work', dims: ['val_security', 'val_autonomy', 'val_impact', 'val_financial'], color: 'rgb(var(--afford))' },
  { title: 'Disposition', sub: 'Staying power and comfort with risk', dims: ['grit', 'risk_tolerance'], color: 'rgb(var(--family))' },
]

export function TraitsView({ t, who = 'you' }: { t: TraitProfile; who?: 'you' | 'child' }) {
  const { reducedMotion } = useSettings()
  const byDim = new Map(t.traits.map((x) => [x.dimension, x]))
  const letters = (t.top_riasec_code || '').toUpperCase().split('').filter((l) => RIASEC_LETTERS[l])
  const radar = ['R', 'I', 'A', 'S', 'E', 'C'].map((l) => ({
    letter: `${l} ${RIASEC_LETTERS[l].name}`,
    value: Math.round(((byDim.get(RIASEC_LETTERS[l].dim)?.normalized ?? t.vector[RIASEC_LETTERS[l].dim]) || 0) * 100),
  }))
  const anyPercentile = t.traits.some((x) => x.percentile !== null && x.percentile !== undefined)
  const reading = letters.length
    ? `${who === 'you' ? 'You' : 'Your child'} most enjoy${who === 'you' ? '' : 's'} ${letters
        .map((l) => RIASEC_LETTERS[l].name.toLowerCase())
        .join(', ')
        .replace(/, ([^,]*)$/, ' and $1')} work. Strongest pull: ${DIMS[RIASEC_LETTERS[letters[0]].dim].hint.charAt(0).toLowerCase()}${DIMS[RIASEC_LETTERS[letters[0]].dim].hint.slice(1)}`
    : 'Finish the Interest Explorer to see the Holland code.'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="relative overflow-hidden p-6 lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neon">
            <Term id="riasec">Holland code</Term>
          </div>
          <div className="mt-4 flex gap-3">
            {letters.length ? (
              letters.map((l, i) => (
                <motion.div
                  key={l}
                  initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: reducedMotion ? 0 : 0.12 * i, ease: [0.2, 0.8, 0.2, 1] }}
                  className="text-center"
                >
                  <div className="text-6xl font-black leading-none md:text-7xl" style={{ color: RIASEC_LETTERS[l].color, textShadow: `0 0 28px ${RIASEC_LETTERS[l].color}` }}>
                    {l}
                  </div>
                  <div className="mt-2 text-xs text-muted">{RIASEC_LETTERS[l].name}</div>
                </motion.div>
              ))
            ) : (
              <div className="text-5xl font-black text-muted">···</div>
            )}
          </div>
          <p className="mt-5 text-[15px]">{reading}</p>
          <div className="mt-4 text-xs text-muted">
            Profile <span className="num">{Math.round(t.completeness * 100)}%</span> complete · {t.instruments_completed.length} sets answered
          </div>
        </Card>
        <Card className="p-4 lg:col-span-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-semibold">Interests</h3>
            <span className="text-xs text-muted">0 to 100</span>
          </div>
          <div className="h-[280px] w-full" role="img" aria-label={`Interest scores: ${radar.map((r) => `${r.letter} ${r.value}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="70%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                <PolarGrid stroke="rgb(var(--line) / 0.12)" />
                <PolarAngleAxis dataKey="letter" tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="rgb(var(--neon))" fill="rgb(var(--fit))" fillOpacity={0.35} strokeWidth={2} isAnimationActive={!reducedMotion} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {GROUPS.map((g) => {
          const rows = g.dims.map((d) => byDim.get(d)).filter(Boolean) as TraitScore[]
          return (
            <Card key={g.title} className="p-5">
              <h3 className="font-semibold">{g.title}</h3>
              <p className="text-xs text-muted">{g.sub}</p>
              {rows.length === 0 ? (
                <p className="mt-4 text-sm text-muted">Not answered yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {rows.map((r) => (
                    <TraitRow key={r.dimension} r={r} color={g.color} />
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><Dot solid /> Steady answers</span>
        <span className="inline-flex items-center gap-1.5"><Dot /> Less certain (few or mixed answers)</span>
        {!anyPercentile && <span>Percentiles appear once 200 students in your grade have taken it.</span>}
      </div>
    </div>
  )
}

function Dot({ solid }: { solid?: boolean }) {
  return <span aria-hidden className={cx('inline-block h-2.5 w-2.5 rounded-full border-2 border-ink/70', solid && 'bg-ink/70')} />
}

function TraitRow({ r, color }: { r: TraitScore; color: string }) {
  const { reducedMotion } = useSettings()
  const v = Math.round(r.normalized * 100)
  const high = r.reliability >= 0.7
  return (
    <li>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{dimLabel(r.dimension)}</span>
          <InfoTip text={DIMS[r.dimension]?.hint} />
          {r.imputed && <Badge color="rgb(var(--warn))" title="Not enough answers yet, so this is estimated from the rest of the profile.">estimated</Badge>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {r.percentile !== null && r.percentile !== undefined && <span className="text-xs text-muted num">{Math.round(r.percentile)}th pct</span>}
          <span className="num w-8 text-right font-semibold">{v}</span>
          <Tip content={high ? `Steady answers (${Math.round(r.reliability * 100)}% reliable, ${r.answered} answers).` : `Less certain: ${r.answered} answers, ${Math.round(r.reliability * 100)}% reliable.`}>
            <button type="button" className="grid h-6 w-6 place-items-center" aria-label={high ? 'Steady answers' : 'Less certain'}>
              <Dot solid={high} />
            </button>
          </Tip>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, opacity: r.imputed ? 0.5 : 1 }}
          initial={reducedMotion ? false : { width: 0 }}
          animate={{ width: `${v}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </li>
  )
}
