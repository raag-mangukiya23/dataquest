// Where to go once signed in. The sign-in and register routes sit inside a guard that sends a freshly signed-in user
// to their role home. That redirect runs after our own navigate() (router updates are transitions, the session update
// is not), so a different destination (?next=, or /family for a new parent) would be lost. We navigate, then watch
// for that redirect and go to the intended page again; React keeps the form on screen meanwhile, so nothing flashes.
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Role } from '@/api/types'
import { homeFor } from '@/state/session'

export function useAfterAuth() {
  const navigate = useNavigate()
  return useCallback(
    (dest: string, role: Role) => {
      navigate(dest, { replace: true })
      const home = homeFor(role)
      if (dest.split(/[?#]/)[0] === home) return
      const until = performance.now() + 2500
      const watch = () => {
        if (window.location.pathname === home) {
          navigate(dest, { replace: true })
          return
        }
        if (performance.now() < until) requestAnimationFrame(watch)
      }
      requestAnimationFrame(watch)
    },
    [navigate],
  )
}
