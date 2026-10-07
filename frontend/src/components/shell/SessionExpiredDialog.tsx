// Shown when the access token could not be refreshed: sign in again without losing the page.
import { useNavigate, useLocation } from 'react-router-dom'
import { useSession } from '@/state/session'
import { Button, Dialog } from '@/components/ui'

export function SessionExpiredDialog() {
  const { expired, logout } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <Dialog open={expired} onOpenChange={() => {}} title="Please sign in again" description="Your session ended for your security. Your saved answers and results are safe.">
      <Button
        className="w-full"
        onClick={() => {
          const next = location.pathname + location.search
          logout()
          navigate(`/signin?next=${encodeURIComponent(next)}`)
        }}
      >
        Sign in
      </Button>
    </Dialog>
  )
}
