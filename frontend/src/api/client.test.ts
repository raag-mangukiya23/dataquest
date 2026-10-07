import { afterEach, describe, expect, it, vi } from 'vitest'

// sessionStorage is not available in the node test environment; the client must cope.
vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })

const { api, ApiError, isRetryable } = await import('./client')

function respond(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })))
}

afterEach(() => vi.unstubAllGlobals())

describe('api envelope', () => {
  it('returns data on success', async () => {
    respond(200, { success: true, data: { ok: 1 }, error: null, meta: {} })
    await expect(api('GET', '/api/v1/x')).resolves.toEqual({ ok: 1 })
  })
  it('turns an error envelope into ApiError with the friendly message', async () => {
    respond(404, { success: false, data: null, error: { code: 'NOT_FOUND', message: 'Analysis run not found', details: {} }, meta: {} })
    const err = await api('GET', '/api/v1/x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toBe('Analysis run not found')
    expect(err.status).toBe(404)
    expect(isRetryable(err)).toBe(false)
  })
  it('reports network failures as retryable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const err = await api('GET', '/api/v1/x').catch((e) => e)
    expect(err.code).toBe('NETWORK')
    expect(isRetryable(err)).toBe(true)
  })
})
