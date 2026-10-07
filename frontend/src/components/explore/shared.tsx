// Shared helpers for the Explore, Scholarships and Exams screens.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { catalog, profile } from '@/api/endpoints'
import { useDeadlines, useLatestRun, useStudentId } from '@/api/queries'
import { useSession } from '@/state/session'
import type { Recommendation } from '@/api/types'

export const exploreKeys = {
  careers: ['catalog', 'careers', 'all'] as const,
  career: (slug?: string) => ['catalog', 'career', slug] as const,
  regions: ['catalog', 'regions'] as const,
  profile: ['profile', 'me'] as const,
  pathwaysAll: ['catalog', 'pathways', 'all'] as const,
}

/** All careers in the catalogue (cached for every explore screen). */
export function useAllCareers() {
  return useQuery({
    queryKey: exploreKeys.careers,
    queryFn: () => catalog.careers({ page_size: 100 }),
    staleTime: 10 * 60_000,
  })
}

/** The signed-in student's profile (students only; parents and counsellors get undefined). */
export function useMyProfile() {
  const { user } = useSession()
  return useQuery({
    queryKey: exploreKeys.profile,
    enabled: user?.role === 'student',
    queryFn: profile.get,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

/** Top recommendations of the latest run, keyed by career id. Empty when there is no run. */
export function useRecommendations() {
  const latest = useLatestRun()
  const recs: Recommendation[] = useMemo(() => latest.run?.recommendations ?? [], [latest.run])
  const byId = useMemo(() => new Map(recs.map((r) => [r.career.id, r])), [recs])
  return { ...latest, recs, byId }
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : true))
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}

export const STEAM: Record<string, { label: string; color: string }> = {
  S: { label: 'Science', color: 'rgb(var(--fit))' },
  T: { label: 'Technology', color: 'rgb(var(--market))' },
  E: { label: 'Engineering', color: 'rgb(var(--afford))' },
  A: { label: 'Arts', color: 'rgb(var(--family))' },
  M: { label: 'Maths', color: 'rgb(var(--roi))' },
}

const SECTOR_TOKENS = ['fit', 'market', 'afford', 'roi', 'family', 'neon', 'primary', 'disrupt', 'ok', 'loan', 'warn']
/** A stable spectrum colour per sector, from its position in the sorted sector list. */
export function sectorColor(sector: string, sectors: string[]) {
  const i = Math.max(0, sectors.indexOf(sector))
  return `rgb(var(--${SECTOR_TOKENS[i % SECTOR_TOKENS.length]}))`
}

// ---------------------------------------------------------------- "I'm interested" (per device)
const INTEREST_KEY = 'prism-interested'
function readInterested(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(INTEREST_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
export function useInterested() {
  const [ids, setIds] = useState<string[]>(readInterested)
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    setIds(next)
    try {
      localStorage.setItem(INTEREST_KEY, JSON.stringify(next))
    } catch {
      /* storage blocked: keep in memory */
    }
    return next.includes(id)
  }
  return { ids, toggle }
}

/** "board_percentile >= 99" -> "Board percentile ≥ 99" */
export function humanRule(rule: string) {
  const s = rule
    .replace(/>=/g, '≥')
    .replace(/<=/g, '≤')
    .replace(/==\s*True/g, ': yes')
    .replace(/==\s*False/g, ': no')
    .replace(/==/g, '=')
    .replace(/\bin \[/g, 'is one of [')
    .replace(/[[\]']/g, '')
    .replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const ISO_TODAY = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * "Today" as the backend sees it (it may be frozen by DEMO_TODAY), so countdowns agree with the
 * backend's deadline_status / registration_status tags. The deadlines endpoint reports it as `as_of`;
 * without a student (counsellors, no results yet) we fall back to the device clock.
 */
export function useServerToday(): { iso: string; date: Date; fromServer: boolean } {
  const { studentId } = useStudentId()
  const d = useDeadlines(studentId)
  const asOf = d.data?.as_of
  return useMemo(() => {
    const iso = asOf && /^\d{4}-\d{2}-\d{2}/.test(asOf) ? asOf.slice(0, 10) : ISO_TODAY()
    return { iso, date: new Date(`${iso}T00:00:00`), fromServer: !!asOf }
  }, [asOf])
}
