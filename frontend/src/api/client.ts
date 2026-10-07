// The one place that talks HTTP. Every /api/v1 response is the envelope {success, data, error, meta}:
// this module unwraps `data`, turns `error` into an ApiError, refreshes the access token once on a 401, and in
// fixtures mode answers from the saved sample responses instead of the network.
import type { Role } from './types'
import { fixtureFor } from './fixtures'

export const DATA_MODE: 'api' | 'fixtures' = import.meta.env.VITE_DATA_MODE === 'fixtures' ? 'fixtures' : 'api'
export const AUTH_MODE: 'live' | 'mock' = import.meta.env.VITE_AUTH_MODE === 'mock' ? 'mock' : 'live'
export const DEV_TOOLS = import.meta.env.VITE_DEV_TOOLS === 'true'
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  code: string
  status: number
  details: Record<string, unknown>
  constructor(code: string, message: string, status = 0, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

/** True for errors worth retrying automatically (network trouble, server overload), never for 4xx answers. */
export function isRetryable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.status >= 500 || err.status === 429)
}

// ---------------------------------------------------------------- tokens (memory + sessionStorage)
interface Tokens {
  access: string
  refresh: string
}
const TOKEN_KEY = 'prism-tokens'

function readTokens(): Tokens | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as Tokens) : null
  } catch {
    return null
  }
}

let tokens: Tokens | null = readTokens()
let mockRole: Role = 'student'
let onSessionExpired: (() => void) | null = null

export function setTokens(access: string, refresh: string) {
  tokens = { access, refresh }
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
  } catch {
    /* private mode: keep tokens in memory only */
  }
}
export function clearTokens() {
  tokens = null
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}
export const hasTokens = () => tokens !== null
export function setMockRole(role: Role) {
  mockRole = role
}
export const getMockRole = () => mockRole
/** Called when the session cannot be refreshed (the app shows the sign-in dialog). */
export function setOnSessionExpired(fn: (() => void) | null) {
  onSessionExpired = fn
}

// ---------------------------------------------------------------- requests
export type Query = Record<string, string | number | boolean | null | undefined>
export interface RequestOptions {
  query?: Query
  body?: unknown
  signal?: AbortSignal
}

function qs(query?: Query): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

function headers(hasBody: boolean): HeadersInit {
  const h: Record<string, string> = { accept: 'application/json' }
  if (hasBody) h['content-type'] = 'application/json'
  if (AUTH_MODE === 'mock') h['X-Mock-Role'] = mockRole
  else if (tokens) h.authorization = `Bearer ${tokens.access}`
  return h
}

let refreshing: Promise<boolean> | null = null
async function refreshTokens(): Promise<boolean> {
  if (!tokens) return false
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ refresh_token: tokens!.refresh }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.success) {
        clearTokens()
        return false
      }
      setTokens(body.data.access_token, body.data.refresh_token)
      return true
    } catch {
      return false
    } finally {
      setTimeout(() => (refreshing = null), 0)
    }
  })()
  return refreshing
}

async function send(method: string, path: string, opts: RequestOptions, retried = false): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}${qs(opts.query)}`, {
      method,
      headers: headers(opts.body !== undefined),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new ApiError('NETWORK', 'Cannot reach PRISM right now. Check your connection and try again.', 0)
  }
  const isAuthCall = path.startsWith('/api/v1/auth/login') || path.startsWith('/api/v1/auth/refresh')
  if (res.status === 401 && !retried && !isAuthCall && AUTH_MODE === 'live' && tokens) {
    if (await refreshTokens()) return send(method, path, opts, true)
    onSessionExpired?.()
  }
  return res
}

/** Calls an /api/v1 endpoint and returns the envelope's `data`. */
export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<T> {
  if (DATA_MODE === 'fixtures') return fixtureFor<T>(method, path, opts)
  const res = await send(method, path, opts)
  const body = await res.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('success' in body)) {
    throw new ApiError('BAD_RESPONSE', `The server answered unexpectedly (HTTP ${res.status}).`, res.status)
  }
  if (!body.success) {
    const e = body.error ?? {}
    throw new ApiError(e.code ?? 'ERROR', e.message ?? 'Something went wrong.', res.status, e.details ?? {})
  }
  return body.data as T
}

/** Fetches a non-JSON endpoint (the HTML family report, the .ics calendar) with the auth header. */
export async function apiBlob(path: string, query?: Query): Promise<Blob> {
  if (DATA_MODE === 'fixtures') {
    throw new ApiError('OFFLINE', 'This file needs the live PRISM server; it is not available in offline mode.')
  }
  const res = await send('GET', path, { query })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.error?.code ?? 'ERROR', body?.error?.message ?? `Download failed (HTTP ${res.status}).`, res.status)
  }
  return res.blob()
}

/** Opens a blob in a new tab, or downloads it when a filename is given. */
export function openBlob(blob: Blob, filename?: string) {
  const url = URL.createObjectURL(blob)
  if (filename) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } else {
    window.open(url, '_blank', 'noopener')
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
