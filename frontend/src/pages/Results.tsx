// Results dashboard: the hero screen. Data: the latest baseline run (+ narrative, deadlines in parent mode).
import { ClipboardList, RefreshCw, Share2, ShieldAlert, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useFamily, useLatestRun } from '@/api/queries'
import type { AnalysisRun } from '@/api/types'
import { Button, EmptyState, ErrorState, InfoTip, PageHeader, Section, Segmented, Skeleton } from '@/components/ui'
import { CompositeTiles, ReadinessDial } from '@/components/results/CompositeTiles'
import { NarrativeCard } from '@/components/results/NarrativeCard'
import { ParentView } from '@/components/results/ParentView'
import { BucketTabs, RecommendationList } from '@/components/results/RecommendationList'
import { ConflictMini, DataQualityCard, NextSteps, RobustnessCard } from '@/components/results/RightRail'
import { ShareCardDialog } from '@/components/results/ShareCard'
import { SPLIT_AT, TopMatchCard } from '@/components/results/SpectrumHero'
import { firstName, useFirstReveal, useIsNarrow, useStudentLink, useStudentName } from '@/components/results/shared'
import { formatDate } from '@/lib/format'
import { useSession } from '@/state/session'
import { useSettings } from '@/state/settings'

function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your results">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-10 w-2/3 max-w-lg" />
      <Skeleton className="mt-3 h-4 w-1/2 max-w-sm" />
      <div className="mt-8 grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-72 lg:col-span-8" />
        <Skeleton className="h-72 lg:col-span-4" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <Skeleton className="h-44" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
        <div className="space-y-3 lg:col-span-4">
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  )
}

export default function Results() {
  const { user } = useSession()
  const { settings, update } = useSettings()
  const narrow = useIsNarrow()
  const latest = useLatestRun()
  const fam = useFamily()
  const link = useStudentLink()
  const studentName = useStudentName(latest.studentId)
  const role = user?.role
  const parentMode = settings.parentMode ?? (role === 'parent' && narrow)
  const showToggle = role === 'parent' || settings.parentMode === true

  const who = role === 'student' ? 'Your' : studentName ? `${firstName(studentName)}'s` : role === 'parent' ? "Your child's" : "The student's"
  const header = (subtitle?: string, actions?: React.ReactNode) => (
    <PageHeader eyebrow="Results" title={`${who} spectrum of paths`} subtitle={subtitle} actions={actions} />
  )

  // ---- who are we looking at?
  if (!latest.studentId && !latest.isLoading) {
    if (role === 'parent' && !fam.isLoading) {
      return (
        <div>
          {header()}
          <EmptyState
            icon={<Users className="h-6 w-6" aria-hidden />}
            title="Link your child's account first"
            action={
              <Link to="/family" className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-5 font-semibold text-primary-ink">
                Go to Family
              </Link>
            }
          >
            Results appear here once your child joins your family on PRISM and finishes the questionnaire.
          </EmptyState>
        </div>
      )
    }
    if (role === 'educator' || role === 'admin') {
      return (
        <div>
          <PageHeader eyebrow="Results" title="Student results" />
          <EmptyState
            icon={<Users className="h-6 w-6" aria-hidden />}
            title="Choose a student"
            action={
              <Link to="/counsellor" className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-5 font-semibold text-primary-ink">
                Open my students
              </Link>
            }
          >
            Open a student from your dashboard to see their results.
          </EmptyState>
        </div>
      )
    }
  }

  if (latest.isLoading) return <ResultsSkeleton />

  if (latest.error) {
    if (latest.error instanceof ApiError && latest.error.code === 'CONSENT_REQUIRED') {
      return (
        <div>
          {header()}
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" aria-hidden />}
            title="Waiting for a parent's approval"
            action={
              <Link to="/consent" className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-5 font-semibold text-primary-ink">
                See what is needed
              </Link>
            }
          >
            {latest.error.message}
          </EmptyState>
        </div>
      )
    }
    return (
      <div>
        {header()}
        <ErrorState error={latest.error} onRetry={latest.refetch} title="Your results could not load" />
      </div>
    )
  }

  if (latest.isEmpty) {
    const canCreate = role === 'student' || role === 'parent'
    return (
      <div>
        {header('Results come from two things: the questionnaire and the family budget.')}
        <EmptyState
          icon={<Sparkles className="h-6 w-6" aria-hidden />}
          title={canCreate ? 'No results yet' : 'This student has no results yet'}
          action={
            canCreate ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex flex-wrap justify-center gap-2">
                  <Button magnetic size="lg" loading={latest.create.isPending} icon={<Sparkles className="h-4 w-4" aria-hidden />} onClick={() => latest.create.mutate()}>
                    Generate my results
                  </Button>
                  {role === 'student' && (
                    <Link to="/questionnaire" className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-surface-2 px-5 font-semibold hairline">
                      <ClipboardList className="h-4 w-4" aria-hidden /> Open the questionnaire
                    </Link>
                  )}
                </div>
                {latest.create.error && <p role="alert" className="max-w-sm text-sm text-bad">{latest.create.error.message}</p>}
              </div>
            ) : undefined
          }
        >
          PRISM ranks careers from the student's answers to the questionnaire and the budget the parents enter. When both are
          in, results take a few seconds.
        </EmptyState>
      </div>
    )
  }

  if (!latest.run || !latest.studentId) return <ResultsSkeleton />
  return (
    <ResultsBody
      run={latest.run}
      studentId={latest.studentId}
      who={who}
      parentMode={parentMode}
      showToggle={showToggle}
      onToggle={(v) => update({ parentMode: v })}
      link={link}
      rerun={{ pending: latest.create.isPending, error: latest.create.error, go: () => latest.create.mutate() }}
      studentFirstName={role === 'student' ? firstName(user?.full_name) : firstName(studentName)}
    />
  )
}

function ResultsBody({
  run,
  studentId,
  who,
  parentMode,
  showToggle,
  onToggle,
  link,
  rerun,
  studentFirstName,
}: {
  run: AnalysisRun
  studentId: string
  who: string
  parentMode: boolean
  showToggle: boolean
  onToggle: (v: boolean) => void
  link: (p: string) => string
  rerun: { pending: boolean; error: Error | null; go: () => void }
  studentFirstName?: string
}) {
  const { user } = useSession()
  const { reducedMotion } = useSettings()
  const reveal = useFirstReveal(run.run_id, reducedMotion)
  const [t0] = useState(() => performance.now())
  const [shareOpen, setShareOpen] = useState(false)
  const role = user?.role
  const top = run.recommendations[0]
  const [showAll, setShowAll] = useState(false)
  const listStart = reveal ? t0 + (SPLIT_AT + 0.4) * 1000 : 0
  const canShare = run.recommendations.length > 0 && (role === 'student' || role === 'parent')

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {showToggle && (
        <Segmented
          label="View"
          value={parentMode ? 'simple' : 'full'}
          onChange={(v) => onToggle(v === 'simple')}
          options={[
            { value: 'simple', label: 'Simple view' },
            { value: 'full', label: 'Full view' },
          ]}
        />
      )}
      {canShare && (
        <Button variant="secondary" icon={<Share2 className="h-4 w-4" aria-hidden />} onClick={() => setShareOpen(true)}>
          Share
        </Button>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader
        eyebrow="Results"
        title={
          <>
            {who} <span className="spectrum-text">spectrum</span> of paths
          </>
        }
        subtitle={`From the questionnaire and the family budget · made ${formatDate(run.created_at)}`}
        actions={actions}
      />

      {run.reproducibility.is_outdated && (
        <div role="status" className="card mb-5 flex flex-col gap-3 border-warn/40 p-4 sm:flex-row sm:items-center">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warn/15 text-warn">
            <RefreshCw className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Newer data is available</p>
            <p className="text-sm text-muted">
              Fees, salaries or dates were updated after these results were made ({run.reproducibility.dataset_version} → {run.reproducibility.latest_dataset_version}).
            </p>
            {rerun.error && <p role="alert" className="mt-1 text-sm text-bad">{rerun.error.message}</p>}
          </div>
          {(role === 'student' || role === 'parent') && (
            <Button loading={rerun.pending} icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={rerun.go}>
              Re-run
            </Button>
          )}
        </div>
      )}

      {parentMode ? (
        <ParentView run={run} studentId={studentId} link={link} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-8">
              {top ? (
                <TopMatchCard rec={top} to={link(`/results/${top.career.slug}`)} reveal={reveal} label={role === 'student' ? 'Your strongest path' : 'Strongest path'} />
              ) : (
                <EmptyState title="No careers ranked">This result has no careers to show.</EmptyState>
              )}
            </div>
            <section aria-labelledby="readiness-title" className="card flex items-center gap-5 p-5 lg:col-span-4 lg:flex-col lg:justify-center lg:text-center">
              <ReadinessDial value={run.composite_scores.overall_readiness} className="order-first shrink-0 lg:order-none lg:mt-4" />
              <div className="min-w-0 lg:order-first">
                <h2 id="readiness-title" className="flex items-center gap-1 text-sm font-semibold uppercase tracking-[0.14em] text-muted lg:justify-center">
                  Overall readiness
                  <InfoTip text="One number for how ready the student is to choose: it blends aptitude, clear interests, money, family agreement and job outlook." />
                </h2>
                <p className="mt-2 text-sm text-muted lg:hidden">A guide to how ready {role === 'student' ? 'you are' : 'the student is'} to choose, not a grade.</p>
              </div>
              <p className="hidden max-w-[16rem] text-sm text-muted lg:block">A guide to how ready {role === 'student' ? 'you are' : 'the student is'} to choose, not a grade.</p>
            </section>
          </div>

          <div className="mt-4">
            <CompositeTiles scores={run.composite_scores} />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-12">
            <div className="min-w-0 space-y-8 lg:col-span-8">
              <NarrativeCard runId={run.run_id} />
              <Section title="Career groups" subtitle="The same careers, sorted for different questions.">
                <BucketTabs run={run} link={link} role={role} />
              </Section>
              <Section title="All your matches" subtitle={`Ranked by the six-part score. Open a career to see why.`}>
                <RecommendationList run={showAll ? run : { ...run, recommendations: run.recommendations.slice(0, 5) }} link={link} role={role} startAt={listStart} />
                {!showAll && run.recommendations.length > 5 && (
                  <div className="mt-4 flex justify-center">
                    <Button variant="secondary" onClick={() => setShowAll(true)}>Show all {run.recommendations.length} careers</Button>
                  </div>
                )}
              </Section>
            </div>
            <aside className="min-w-0 space-y-4 lg:col-span-4" aria-label="More about these results">
              <NextSteps run={run} link={link} onShare={canShare ? () => setShareOpen(true) : undefined} />
              <ConflictMini run={run} role={role} link={link} />
              <RobustnessCard run={run} />
              <DataQualityCard run={run} showRetake={role === 'student'} />
            </aside>
          </div>
        </>
      )}

      {canShare && (
        <ShareCardDialog open={shareOpen} onOpenChange={setShareOpen} studentId={studentId} top={run.recommendations} firstName={studentFirstName} />
      )}
    </div>
  )
}
