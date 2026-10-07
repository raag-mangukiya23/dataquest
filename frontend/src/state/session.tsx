// Who is signed in. Live mode: JWT sign-in against the backend. Mock mode (developers): role from the dev panel.
// Fixtures mode (offline backup): any password works; the role is read from the email (…parent@…, …counsellor@…).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { auth } from '@/api/endpoints'
import {
  AUTH_MODE,
  DATA_MODE,
  clearTokens,
  hasTokens,
  setMockRole,
  setOnSessionExpired,
  setTokens,
} from '@/api/client'
import { setFixtureRole } from '@/api/fixtures'
import type { RegisterRequest, Role, UserOut } from '@/api/types'

type Status = 'loading' | 'signed-out' | 'signed-in'

interface Ctx {
  user: UserOut | null
  status: Status
  /** true after a refresh failed: the app shows a "sign in again" dialog */
  expired: boolean
  login: (email: string, password: string) => Promise<UserOut>
  register: (body: RegisterRequest) => Promise<UserOut>
  logout: () => void
  refreshUser: () => Promise<void>
  /** Developer tools only (mock auth): act as another role. */
  switchMockRole: (role: Role) => Promise<void>
}
const SessionContext = createContext<Ctx | null>(null)
const FIXTURE_KEY = 'prism-fixture-user'

function roleFromEmail(email: string): Role {
  const e = email.toLowerCase()
  if (e.includes('parent')) return 'parent'
  if (e.includes('counsellor') || e.includes('teacher') || e.includes('educator')) return 'educator'
  if (e.startsWith('admin')) return 'admin'
  return 'student'
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<UserOut | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [expired, setExpired] = useState(false)

  const adopt = useCallback((u: UserOut | null) => {
    setUser(u)
    setStatus(u ? 'signed-in' : 'signed-out')
    if (u) {
      setFixtureRole(u.role)
      setExpired(false)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    if (DATA_MODE === 'fixtures') {
      try {
        const raw = sessionStorage.getItem(FIXTURE_KEY)
        adopt(raw ? (JSON.parse(raw) as UserOut) : null)
      } catch {
        adopt(null)
      }
      return
    }
    if (AUTH_MODE === 'live' && !hasTokens()) return adopt(null)
    try {
      adopt(await auth.me())
    } catch {
      if (AUTH_MODE === 'live') clearTokens()
      adopt(null)
    }
  }, [adopt])

  useEffect(() => {
    if (AUTH_MODE === 'mock') {
      try {
        setMockRole((sessionStorage.getItem('prism-mock-role') as Role) || 'student')
      } catch {
        /* ignore */
      }
    }
    void refreshUser()
    setOnSessionExpired(() => setExpired(true))
    return () => setOnSessionExpired(null)
  }, [refreshUser])

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await auth.login(email.trim(), password)
      let u = res.user
      if (DATA_MODE === 'fixtures') {
        const role = roleFromEmail(email)
        u = { ...u, email: email.trim(), role, is_minor: role === 'student' && u.is_minor }
        try {
          sessionStorage.setItem(FIXTURE_KEY, JSON.stringify(u))
        } catch {
          /* ignore */
        }
      } else if (AUTH_MODE === 'live') {
        setTokens(res.tokens.access_token, res.tokens.refresh_token)
      }
      qc.clear()
      adopt(u)
      return u
    },
    [adopt, qc],
  )

  const register = useCallback(
    async (body: RegisterRequest) => {
      const res = await auth.register(body)
      let u = res.user
      if (DATA_MODE === 'fixtures') {
        u = { ...u, email: body.email, full_name: body.full_name, role: body.role ?? 'student' }
        try {
          sessionStorage.setItem(FIXTURE_KEY, JSON.stringify(u))
        } catch {
          /* ignore */
        }
      } else if (AUTH_MODE === 'live') {
        setTokens(res.tokens.access_token, res.tokens.refresh_token)
      }
      qc.clear()
      adopt(u)
      return u
    },
    [adopt, qc],
  )

  const logout = useCallback(() => {
    clearTokens()
    try {
      sessionStorage.removeItem(FIXTURE_KEY)
    } catch {
      /* ignore */
    }
    qc.clear()
    setExpired(false)
    adopt(null)
  }, [adopt, qc])

  const switchMockRole = useCallback(
    async (role: Role) => {
      setMockRole(role)
      try {
        sessionStorage.setItem('prism-mock-role', role)
      } catch {
        /* ignore */
      }
      qc.clear()
      await refreshUser()
    },
    [qc, refreshUser],
  )

  const value = useMemo<Ctx>(
    () => ({ user, status, expired, login, register, logout, refreshUser, switchMockRole }),
    [user, status, expired, login, register, logout, refreshUser, switchMockRole],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession outside SessionProvider')
  return ctx
}

/** Where each role lands after signing in. */
export function homeFor(role: Role | undefined): string {
  if (role === 'educator') return '/counsellor'
  if (role === 'admin') return '/admin'
  return '/home'
}
