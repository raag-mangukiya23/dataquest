// Small helpers shared by the public pages (landing, sign in, register, how it works, 404).
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { catalog, system } from '@/api/endpoints'
import type { CareerSummary } from '@/api/types'

/** Live media query (e.g. '(min-width: 768px)'). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

/**
 * Only same-site paths are allowed as a post-sign-in destination (`?next=/results`), never `//evil.com` or a URL.
 * Public auth pages are skipped so we never bounce back to the form.
 */
export function safeNext(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  const path = raw.split(/[?#]/)[0]
  if (path === '/signin' || path === '/register') return null
  return raw
}

// ---------------------------------------------------------------- API validation errors → form fields
export type FieldErrors<K extends string> = Partial<Record<K, string>>

interface PydanticError {
  loc?: (string | number)[]
  msg?: string
  type?: string
  ctx?: Record<string, unknown>
}

function friendly(e: PydanticError): string {
  const min = e.ctx?.min_length
  switch (e.type) {
    case 'missing':
      return 'Please fill this in.'
    case 'string_too_short':
      return typeof min === 'number' && min > 1 ? `Use at least ${min} characters.` : 'Please fill this in.'
    case 'string_too_long':
      return 'That is too long.'
    case 'value_error':
      if (e.loc?.includes('email')) return 'Please enter a valid email address, like name@example.com.'
      return (e.msg ?? 'Please check this.').replace(/^Value error,\s*/i, '')
    case 'date_from_datetime_parsing':
    case 'date_parsing':
      return 'Please enter a valid date.'
    default:
      return e.msg ?? 'Please check this.'
  }
}

/**
 * Splits an ApiError into per-field messages (VALIDATION_ERROR details.errors[].loc = ['body', field]) and a general
 * message for everything else. Known whole-request errors (duplicate email, missing date of birth) go to their field.
 */
export function fieldErrorsFrom<K extends string>(err: unknown, fields: readonly K[]): { fields: FieldErrors<K>; general: string | null } {
  const out: FieldErrors<K> = {}
  if (!(err instanceof ApiError)) {
    return { fields: out, general: err instanceof Error ? err.message : 'Something went wrong. Please try again.' }
  }
  const list = (err.details?.errors as PydanticError[] | undefined) ?? []
  let unmatched = false
  for (const e of list) {
    const key = e.loc?.[e.loc.length - 1]
    if (typeof key === 'string' && (fields as readonly string[]).includes(key)) {
      if (!out[key as K]) out[key as K] = friendly(e)
    } else unmatched = true
  }
  if (list.length > 0) return { fields: out, general: unmatched || Object.keys(out).length === 0 ? err.message : null }
  // Whole-request errors with an obvious home.
  const msg = err.message
  if (err.code === 'CONFLICT' && /email/i.test(msg) && (fields as readonly string[]).includes('email')) {
    return { fields: { ['email' as K]: msg } as FieldErrors<K>, general: null }
  }
  if (/date of birth/i.test(msg) && (fields as readonly string[]).includes('date_of_birth')) {
    return { fields: { ['date_of_birth' as K]: msg } as FieldErrors<K>, general: null }
  }
  return { fields: out, general: msg }
}

// ---------------------------------------------------------------- public data the landing pages may show
const LONG = 10 * 60_000

export function useMethodology() {
  return useQuery({ queryKey: ['system', 'methodology'], queryFn: system.methodology, staleTime: LONG })
}
export function useFairness() {
  return useQuery({ queryKey: ['system', 'fairness'], queryFn: system.fairness, staleTime: LONG })
}
export function useHealth() {
  return useQuery({ queryKey: ['system', 'health'], queryFn: system.health, staleTime: 60_000 })
}
export function useCatalogCareers() {
  return useQuery({ queryKey: ['careers', 'all'], queryFn: () => catalog.careers({ page_size: 100 }), staleTime: LONG })
}

/** One career per field, the most in-demand first: real catalogue rows used to label the landing's career nodes. */
export function pickShowcase(items: CareerSummary[] | undefined, n = 5): CareerSummary[] {
  if (!items?.length) return []
  const best = new Map<string, CareerSummary>()
  for (const c of items) {
    const cur = best.get(c.sector)
    if (!cur || (c.national_demand_index ?? 0) > (cur.national_demand_index ?? 0)) best.set(c.sector, c)
  }
  return [...best.values()].sort((a, b) => (b.national_demand_index ?? 0) - (a.national_demand_index ?? 0)).slice(0, n)
}

/** Age in whole years on `today` for an ISO date (yyyy-mm-dd). */
export function ageOn(iso: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let age = today.getFullYear() - y
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age -= 1
  return age
}

export const isoToday = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
