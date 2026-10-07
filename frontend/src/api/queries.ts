// Shared data hooks. Screens add their own useQuery calls for screen-specific data; anything two screens
// need lives here so the cache keys stay consistent.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { analysis, deadlines, family, type Lang } from './endpoints'
import { ApiError } from './client'
import { useSession } from '@/state/session'
import type { AnalysisRun, AnalysisRunSummary } from './types'

export const keys = {
  family: ['family'] as const,
  runs: (studentId?: string) => ['runs', studentId] as const,
  run: (runId?: string) => ['run', runId] as const,
  narrative: (runId?: string, lang?: Lang) => ['narrative', runId, lang] as const,
  deadlines: (studentId?: string) => ['deadlines', studentId] as const,
}

/** The signed-in user's family (students and parents). null = not in a family yet. */
export function useFamily() {
  const { user } = useSession()
  return useQuery({
    queryKey: keys.family,
    enabled: !!user && (user.role === 'student' || user.role === 'parent'),
    queryFn: async () => {
      try {
        return await family.me()
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null
        throw e
      }
    },
  })
}

/**
 * The student whose results we are looking at:
 * - a student sees themself; a parent sees the student in their family;
 * - a counsellor opens a student from the dashboard (`?student=<id>` in the URL).
 */
export function useStudentId(): { studentId: string | undefined; isLoading: boolean } {
  const { user } = useSession()
  const [params] = useSearchParams()
  const fam = useFamily()
  if (!user) return { studentId: undefined, isLoading: false }
  if (user.role === 'student') return { studentId: user.id, isLoading: false }
  if (user.role === 'parent') {
    const s = fam.data?.members.find((m) => m.role === 'student')
    return { studentId: s?.user_id, isLoading: fam.isLoading }
  }
  return { studentId: params.get('student') ?? undefined, isLoading: false }
}

export function useRuns(studentId: string | undefined) {
  return useQuery({
    queryKey: keys.runs(studentId),
    enabled: !!studentId,
    queryFn: () => analysis.list(studentId, 1, 50),
  })
}

export function useRun(runId: string | undefined) {
  return useQuery({ queryKey: keys.run(runId), enabled: !!runId, queryFn: () => analysis.get(runId!) })
}

/** The newest baseline run for the current student, plus a way to create one. */
export function useLatestRun() {
  const { studentId, isLoading: sidLoading } = useStudentId()
  const runs = useRuns(studentId)
  const latest: AnalysisRunSummary | undefined =
    runs.data?.items.find((r) => r.kind === 'baseline') ?? runs.data?.items[0]
  const run = useRun(latest?.run_id)
  const create = useCreateRun(studentId)
  return {
    studentId,
    summary: latest,
    run: run.data as AnalysisRun | undefined,
    isLoading: sidLoading || runs.isLoading || (!!latest && run.isLoading),
    /** true when the student has no results yet */
    isEmpty: !!studentId && runs.isSuccess && !latest,
    error: runs.error ?? run.error,
    refetch: () => {
      void runs.refetch()
      void run.refetch()
    },
    create,
  }
}

export function useCreateRun(studentId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => analysis.create(studentId!),
    onSuccess: (run) => {
      qc.setQueryData(keys.run(run.run_id), run)
      void qc.invalidateQueries({ queryKey: keys.runs(studentId) })
      void qc.invalidateQueries({ queryKey: ['deadlines'] })
    },
  })
}

export function useNarrative(runId: string | undefined, lang: Lang) {
  return useQuery({
    queryKey: keys.narrative(runId, lang),
    enabled: !!runId,
    queryFn: () => analysis.narrative(runId!, lang),
    staleTime: 5 * 60_000,
  })
}

export function useDeadlines(studentId: string | undefined, horizonDays = 365) {
  return useQuery({
    queryKey: [...keys.deadlines(studentId), horizonDays],
    enabled: !!studentId,
    queryFn: () => deadlines.list(studentId!, horizonDays),
    retry: false,
  })
}
