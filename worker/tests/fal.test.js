import { describe, it, expect, afterEach, vi } from 'vitest'
import { poll } from '../src/providers/fal.js'

// poll() attaches the operator's fal key (`Authorization: Key <key>`) to both
// the status_url and response_url fetches. Those URLs are attacker-controlled
// (they arrive in the /generate/result request body) and are validated against
// fal's own hostnames before either fetch — but hostname validation only
// covers the URL we asked for, not one fal's own servers might redirect us
// to. `redirect: 'error'` is the second half of that guard: it makes fetch()
// refuse to follow a 3xx instead of silently reattaching the Authorization
// header to whatever Location a redirect names. See the comment above the
// fetch calls in fal.js before removing either check.

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('fal.poll — redirect handling', () => {
  it('requests status_url and response_url with redirect: "error"', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith('/status')) {
        return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
      }
      return new Response(JSON.stringify({ images: [{ url: 'https://fal.media/files/x.png' }], seed: 3 }), { status: 200 })
    })
    globalThis.fetch = fetchMock

    const result = await poll({}, {
      status_url: 'https://queue.fal.run/fal-ai/x/requests/req-1/status',
      response_url: 'https://queue.fal.run/fal-ai/x/requests/req-1',
      key: 'fal-key-123',
      budgetMs: 5000,
    })

    expect(result.done).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const call of fetchMock.mock.calls) {
      const opts = call[1]
      expect(opts.redirect).toBe('error')
      expect(opts.headers.Authorization).toBe('Key fal-key-123')
    }
  })

  it('propagates a fetch redirect rejection instead of following it', async () => {
    globalThis.fetch = vi.fn(async (_url, opts) => {
      if (opts && opts.redirect === 'error') {
        throw new TypeError('Failed to fetch — redirect mode is set to error')
      }
      return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
    })

    await expect(
      poll({}, {
        status_url: 'https://queue.fal.run/fal-ai/x/requests/req-1/status',
        response_url: 'https://queue.fal.run/fal-ai/x/requests/req-1',
        key: 'fal-key-123',
        budgetMs: 5000,
      })
    ).rejects.toThrow(/redirect/i)
  })
})

// poll() must fail fast on an upstream HTTP error, not treat it as "still
// pending". A 401/429/5xx body has no `status` field — reading `.status` off
// it yields `undefined`, which used to fall through every branch and spin
// until the poll budget was exhausted, silently masking an auth/rate-limit/
// server failure as pending generation. Regression coverage for that bug.
describe('fal.poll — upstream HTTP errors', () => {
  it('throws immediately on a non-ok status_url response instead of spinning to done:false', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: 'invalid key' }), { status: 401 }))
    globalThis.fetch = fetchMock

    const start = Date.now()
    await expect(
      poll({}, {
        status_url: 'https://queue.fal.run/fal-ai/x/requests/req-1/status',
        response_url: 'https://queue.fal.run/fal-ai/x/requests/req-1',
        key: 'fal-key-123',
        budgetMs: 25000,
      })
    ).rejects.toThrow(/401/)
    // Must not have burned the poll budget waiting/retrying.
    expect(Date.now() - start).toBeLessThan(1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws immediately on a non-ok response_url response after status reports COMPLETED', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith('/status')) {
        return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
      }
      return new Response(JSON.stringify({ error: 'server error' }), { status: 500 })
    })
    globalThis.fetch = fetchMock

    await expect(
      poll({}, {
        status_url: 'https://queue.fal.run/fal-ai/x/requests/req-1/status',
        response_url: 'https://queue.fal.run/fal-ai/x/requests/req-1',
        key: 'fal-key-123',
        budgetMs: 25000,
      })
    ).rejects.toThrow(/500/)
  })
})
