// Real problems near the student's pincode that a STEAM project could help with.
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Check, Heart, MapPin, Rocket, Search } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { catalog } from '@/api/endpoints'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Skeleton, useToast } from '@/components/ui'
import { ProvenanceBadge } from '@/components/score'
import { useSettings } from '@/state/settings'
import { STEAM, useInterested } from './shared'

export function NearYou({ defaultPincode }: { defaultPincode?: string }) {
  const { reducedMotion } = useSettings()
  const toast = useToast()
  const [input, setInput] = useState(defaultPincode ?? '')
  const [pincode, setPincode] = useState<string | undefined>(defaultPincode && /^\d{6}$/.test(defaultPincode) ? defaultPincode : undefined)
  const [err, setErr] = useState<string | null>(null)
  const { ids, toggle } = useInterested()

  useEffect(() => {
    if (defaultPincode && !input) {
      setInput(defaultPincode)
      if (/^\d{6}$/.test(defaultPincode)) setPincode(defaultPincode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPincode])

  const q = useQuery({ queryKey: ['local', pincode], enabled: !!pincode, queryFn: () => catalog.localOpportunities(pincode!) })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = input.trim()
    if (!/^\d{6}$/.test(v)) {
      setErr('A pincode has exactly 6 digits, like 641001.')
      return
    }
    setErr(null)
    setPincode(v)
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
        <div className="w-full sm:max-w-xs">
          <Field label="Your pincode" htmlFor="near-pin" error={err} hint="We look for real problems in your district.">
            <Input
              id="near-pin"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="641001"
              value={input}
              aria-invalid={!!err}
              onChange={(e) => setInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </Field>
        </div>
        <Button type="submit" icon={<Search className="h-4 w-4" />} className="sm:mt-[26px]">
          Find problems near me
        </Button>
      </form>

      {!pincode && (
        <EmptyState icon={<MapPin className="h-6 w-6" />} title="Enter your pincode">
          We will show local problems where science, technology, engineering, arts and maths can make a real difference, each with a small starter project.
        </EmptyState>
      )}
      {pincode && q.isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      )}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} title="We could not search this pincode" />}
      {q.data && q.data.length === 0 && (
        <EmptyState icon={<MapPin className="h-6 w-6" />} title={`Nothing listed near ${pincode} yet`}>
          Try the pincode of your nearest district town. Your school can also suggest local problems to your counsellor.
        </EmptyState>
      )}
      {q.data && q.data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {q.data.map((o, i) => {
            const saved = ids.includes(o.id)
            return (
              <motion.div key={o.id} initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-1 text-xs text-muted">
                        <MapPin className="h-3.5 w-3.5" aria-hidden /> {o.district}
                      </div>
                      <h3 className="font-semibold leading-snug">{o.title}</h3>
                    </div>
                    <ProvenanceBadge p={o.provenance} />
                  </div>
                  <p className="mt-2 text-sm text-muted">{o.problem_statement}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {o.steam_tags.map((t) => (
                      <Badge key={t} color={STEAM[t]?.color}>
                        {STEAM[t]?.label ?? t}
                      </Badge>
                    ))}
                    {o.skills.map((s) => (
                      <Badge key={s} className="bg-surface-2 text-muted hairline">{s}</Badge>
                    ))}
                  </div>
                  <div className="mt-4 rounded-xl p-3" style={{ background: 'linear-gradient(135deg, rgb(var(--primary) / 0.16), rgb(var(--neon) / 0.08))', boxShadow: 'inset 0 0 0 1px rgb(var(--primary) / 0.35)' }}>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                      <Rocket className="h-3.5 w-3.5" aria-hidden /> Starter project (4–8 weeks)
                    </div>
                    <p className="mt-1 text-sm">{o.starter_project}</p>
                  </div>
                  {o.linked_careers.length > 0 && (
                    <div className="mt-3 text-sm">
                      <span className="text-muted">Careers it builds towards: </span>
                      {o.linked_careers.map((c, j) => (
                        <span key={c.id}>
                          {j > 0 && ', '}
                          <Link to={`/explore/${c.slug}`} className="font-medium hover:text-primary hover:underline">
                            {c.name}
                          </Link>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                    <span className="text-xs text-muted">Partner: {o.partner_type}</span>
                    <Button
                      size="sm"
                      variant={saved ? 'secondary' : 'primary'}
                      aria-pressed={saved}
                      className="min-h-[44px]"
                      icon={saved ? <Check className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
                      onClick={() => {
                        const now = toggle(o.id)
                        toast(now ? 'ok' : 'info', now ? 'Saved to your plan' : 'Removed from your plan')
                      }}
                    >
                      {saved ? 'Saved' : "I'm interested"}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
