// Route guards: signed-in only, and optionally only for some roles.
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Role } from '@/api/types'
import { homeFor, useSession } from '@/state/session'
import { PageSkeleton } from '@/components/ui'

export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, status } = useSession()
  const location = useLocation()
  if (status === 'loading') return <div className="mx-auto max-w-page px-4 py-10"><PageSkeleton /></div>
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

/** Signed-in users who open /signin or /register go to their home instead. */
export function RedirectIfSignedIn() {
  const { user, status } = useSession()
  if (status === 'signed-in' && user) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}
