// Top-bar bell: the next deadlines for the current student, with day counts.
import * as Popover from '@radix-ui/react-dropdown-menu'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDeadlines, useStudentId } from '@/api/queries'
import { useSession } from '@/state/session'
import { formatDate } from '@/lib/format'
import { DateStatusTag } from '@/components/score'

export function DeadlineBell() {
  const { user } = useSession()
  const { studentId } = useStudentId()
  const enabled = user?.role === 'student' || user?.role === 'parent'
  const q = useDeadlines(enabled ? studentId : undefined, 120)
  if (!enabled) return null
  const items = q.data?.items ?? []
  const soon = items.filter((i) => i.days_left <= 30).length
  return (
    <Popover.Root>
      <Popover.Trigger className="relative grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink" aria-label={`Deadlines${soon ? `, ${soon} in the next 30 days` : ''}`}>
        <Bell className="h-[18px] w-[18px]" />
        {soon > 0 && <span className="num absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-warn px-1 text-[10px] font-bold text-black">{soon}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[min(360px,calc(100vw-24px))] rounded-2xl bg-surface p-3 shadow-lift hairline">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-semibold">Coming up</span>
            <Popover.Item asChild>
              <Link to="/plan" className="text-xs text-primary hover:underline">See plan</Link>
            </Popover.Item>
          </div>
          {items.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted">{q.isLoading ? 'Loading…' : 'No dates in the next four months.'}</p>
          ) : (
            <ul className="space-y-1">
              {items.slice(0, 6).map((i) => (
                <li key={i.ref_id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                  <span className="num w-12 shrink-0 text-center">
                    <span className="block text-lg font-semibold leading-none">{i.days_left}</span>
                    <span className="text-[10px] uppercase text-muted">days</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{i.title}</span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {formatDate(i.due)} <DateStatusTag status={i.date_status} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
