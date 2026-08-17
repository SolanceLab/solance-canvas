import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import worker from '../src/index.js'

// Proves the BYO-key contract on BOTH /generate and /generate/result:
//   1. a visitor's X-Provider-Key header wins over the env-configured key
//   2. env is the fallback when no header is sent
//   3. neither present -> a 400 naming both mechanisms
//   4. the key is never echoed in a response body or logged, in any form
//      (safeMessage() redacts it by value from provider error strings)

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

function grokSuccessResponse() {
  // base64 shape — the Worker's null storage adapter never re-fetches this,
  // so a single stubbed call covers the whole /generate path.
  return new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('/generate — BYO key (grok)', () => {
  const body = JSON.stringify({ prompt: 'x', provider: 'grok', model: 'grok-imagine-image' })

  it('a user key in the header wins over an env key', async () => {
    const fetchMock = vi.fn(async () => grokSuccessResponse())
    globalThis.fetch = fetchMock

    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Provider-Key': 'user-key-123' },
      body,
    })
    const res = await worker.fetch(req, { XAI_API_KEY: 'env-key' })
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer user-key-123')
  })

  it('falls back to the env key when no header is sent', async () => {
    const fetchMock = vi.fn(async () => grokSuccessResponse())
    globalThis.fetch = fetchMock

    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const res = await worker.fetch(req, { XAI_API_KEY: 'env-key' })
    expect(res.status).toBe(200)
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer env-key')
  })

  it('400s naming both mechanisms when neither is present', async () => {
    globalThis.fetch = vi.fn()
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const res = await worker.fetch(req, {})
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('XAI_API_KEY')
    expect(data.error).toContain('X-Provider-Key')
  })

  it('never echoes or logs the user key, even when the provider error carries it', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'upstream rejected key user-key-123' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Provider-Key': 'user-key-123' },
      body,
    })
    const res = await worker.fetch(req, {})
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('[redacted]')
    expect(text).not.toContain('user-key-123')

    for (const call of consoleSpy.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain('user-key-123')
      }
    }
  })

  it('the success response body never contains the user key', async () => {
    globalThis.fetch = vi.fn(async () => grokSuccessResponse())
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Provider-Key': 'user-key-123' },
      body,
    })
    const res = await worker.fetch(req, {})
    const text = await res.text()
    expect(text).not.toContain('user-key-123')
  })
})

describe('/generate/result — BYO key (fal)', () => {
  // fal.js's SSRF allowlist requires the hostname to be exactly
  // queue.fal.run / fal.run / fal.media — build a ticket that passes it.
  const ticketBody = () => JSON.stringify({
    provider: 'fal',
    status_url: 'https://queue.fal.run/fal-ai/x/requests/req-1/status',
    response_url: 'https://queue.fal.run/fal-ai/x/requests/req-1',
  })

  it('a user key in the header is used for the fal poll requests', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith('/status')) {
        return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
      }
      return new Response(JSON.stringify({ images: [{ url: 'https://fal.media/files/x.png' }], seed: 7 }), { status: 200 })
    })
    globalThis.fetch = fetchMock

    const req = new Request('https://w.test/generate/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Provider-Key': 'user-key-123' },
      body: ticketBody(),
    })
    const res = await worker.fetch(req, { FAL_API_KEY: 'env-key' })
    expect(res.status).toBe(200)
    for (const call of fetchMock.mock.calls) {
      const opts = call[1]
      expect(opts.headers.Authorization).toBe('Key user-key-123')
      expect(opts.redirect).toBe('error')
    }
    const text = await res.text()
    expect(text).not.toContain('user-key-123')
  })

  it('400s naming X-Provider-Key when neither header nor env is present', async () => {
    globalThis.fetch = vi.fn()
    const req = new Request('https://w.test/generate/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: ticketBody(),
    })
    const res = await worker.fetch(req, {})
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('X-Provider-Key')
  })
})
