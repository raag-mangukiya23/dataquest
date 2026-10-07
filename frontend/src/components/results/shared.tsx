// Helpers shared by the results screens (Results, CareerDetail, Compare). Local to this folder on purpose.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { educator } from '@/api/endpoints'
import { useFamily } from '@/api/queries'
import type { AffordabilityClass, AnalysisRun, Bucket, Recommendation, Role } from '@/api/types'
import { useSession } from '@/state/session'

/** Keeps `?student=<id>` (counsellor view) on every internal link. */
export function useStudentLink() {
  const [params] = useSearchParams()
  const student = params.get('student')
  return (path: string) => {
    if (!student) return path
    const [base, hash] = path.split('#')
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}student=${encodeURIComponent(student)}${hash ? `#${hash}` : ''}`
  }
}

/** Find a recommendation by career slug or id. */
export function findRec(run: AnalysisRun | undefined, idOrSlug: string | undefined): Recommendation | undefined {
  if (!run || !idOrSlug) return undefined
  const key = decodeURIComponent(idOrSlug)
  return run.recommendations.find((r) => r.career.slug === key || r.career.id === key)
}

/** The run's career by id, if it is in the ranked list (bucket items carry ids only). */
export function recById(run: AnalysisRun | undefined, id: string) {
  return run?.recommendations.find((r) => r.career.id === id)
}

export const s100 = (x: number) => Math.round(x * 100)

// ---------------------------------------------------------------- buckets
export const BUCKET_ORDER: Bucket[] = ['best_overall', 'best_for_student', 'best_for_family', 'bridge', 'hidden_gems', 'stretch_goals']

/** Friendly bucket names; "you" changes with who is looking. */
export function bucketMeta(b: Bucket, role: Role | undefined): { label: string; tag: string; scoreLabel: string; term?: string } {
  const you = role === 'student' ? 'you' : role === 'parent' ? 'your child' : 'the student'
  switch (b) {
    case 'best_overall':
      return { label: 'Best overall', tag: 'Top 3', scoreLabel: 'overall score' }
    case 'best_for_student':
      return { label: `Best for ${you}`, tag: 'Best fit', scoreLabel: 'fit' }
    case 'best_for_family':
      return { label: 'Best for the family', tag: 'Family pick', scoreLabel: 'family score' }
    case 'bridge':
      return { label: 'Both sides agree', tag: 'Bridge', scoreLabel: 'agreement score', term: 'bridge' }
    case 'hidden_gems':
      return { label: 'Hidden gems', tag: 'Hidden gem', scoreLabel: 'overall score' }
    case 'stretch_goals':
      return { label: 'Stretch goals', tag: 'Stretch', scoreLabel: 'fit', term: 'stretch' }
  }
}

// ---------------------------------------------------------------- funding order (best first)
export const AFFORD_ORDER: AffordabilityClass[] = ['comfortable', 'stretch', 'loan_dependent', 'infeasible']

// ---------------------------------------------------------------- viewport
export function useIsNarrow(query = '(max-width: 767px)') {
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return narrow
}

/** The name of the student whose results these are (for parents and counsellors); undefined for the student. */
export function useStudentName(studentId: string | undefined): string | undefined {
  const { user } = useSession()
  const fam = useFamily()
  const dash = useQuery({
    queryKey: ['educator-dashboard'],
    enabled: user?.role === 'educator',
    queryFn: () => educator.dashboard(),
    staleTime: 60_000,
  })
  if (!user || user.role === 'student') return undefined
  if (user.role === 'parent') return fam.data?.members.find((m) => m.role === 'student')?.full_name
  return dash.data?.students.find((s) => s.student_id === studentId)?.display_name
}

export const firstName = (full: string | undefined) => (full ? full.trim().split(/\s+/)[0] : undefined)

/** Remember which runs already played their reveal, so returning to a screen does not replay it. */
const played = new Set<string>()
export function useFirstReveal(key: string | undefined, reducedMotion: boolean) {
  const [reveal] = useState(() => !!key && !reducedMotion && !played.has(key))
  useEffect(() => {
    if (key) played.add(key)
  }, [key])
  return reveal && !reducedMotion
}
