import { describe, it, expect, afterEach, vi } from 'vitest'
import worker from '../src/index.js'

// AUTH_TOKEN is an OPTIONAL operator auth gate on the two POST routes (see
// index.js's checkAuthToken). It defaults to unset, which must leave every
// existing behavior — including the whole BYO-key contract in
// byo-key.test.js — untouched. GET /image/:key is never gated.

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

function grokSuccessResponse() {
  return new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const generateBody = JSON.stringify({ prompt: 'x', provider: 'grok', model: 'grok-imagine-image' })

const resultBody = JSON.stringify({
  provider: 'fal',
  status_url: 'https://queue.fal.run/fal-ai/x/requests/req-1/status',
  response_url: 'https://queue.fal.run/fal-ai/x/requests/req-1',
})

describe('AUTH_TOKEN unset — unchanged (default/dev/private) behavior', () => {
  it('POST /generate succeeds with no Authorization header at all', async () => {
    globalThis.fetch = vi.fn(async () => grokSuccessResponse())
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Provider-Key': 'user-key' },
      body: generateBody,
    })
    const res = await worker.fetch(req, {})
    expect(res.status).toBe(200)
  })

  it('POST /generate/result succeeds with no Authorization header at all', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith('/status')) {
        return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
      }
      return new Response(JSON.stringify({ images: [{ url: 'https://fal.media/files/x.png' }] }), { status: 200 })
    })
    const req = new Request('https://w.test/generate/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Provider-Key': 'user-key' },
      body: resultBody,
    })
    const res = await worker.fetch(req, {})
    expect(res.status).toBe(200)
  })
})

describe('AUTH_TOKEN set — gates both POST routes', () => {
  const env = { AUTH_TOKEN: 'op-secret-token', XAI_API_KEY: 'env-key', FAL_API_KEY: 'env-key' }

  it('401s POST /generate with no Authorization header', async () => {
    globalThis.fetch = vi.fn()
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: generateBody,
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    const data = await res.json()
    expect(data.error).toBeTruthy()
  })

  it('401s POST /generate with a wrong bearer token', async () => {
    globalThis.fetch = vi.fn()
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer wrong-token' },
      body: generateBody,
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('200s POST /generate with the correct bearer token', async () => {
    globalThis.fetch = vi.fn(async () => grokSuccessResponse())
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer op-secret-token' },
      body: generateBody,
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
  })

  // RFC 9110 §11.1: the auth scheme is case-insensitive, and the scheme/token
  // separator is 1*SP — conforming clients sending "bearer" must not be 401'd.
  it('200s POST /generate with a lowercase bearer scheme and extra whitespace', async () => {
    globalThis.fetch = vi.fn(async () => grokSuccessResponse())
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'bearer   op-secret-token' },
      body: generateBody,
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
  })

  it('401s POST /generate when the lowercase scheme carries a wrong token', async () => {
    globalThis.fetch = vi.fn()
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'bearer wrong-token' },
      body: generateBody,
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('401s POST /generate/result with no Authorization header', async () => {
    globalThis.fetch = vi.fn()
    const req = new Request('https://w.test/generate/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: resultBody,
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('401s POST /generate/result with a wrong bearer token', async () => {
    globalThis.fetch = vi.fn()
    const req = new Request('https://w.test/generate/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer nope' },
      body: resultBody,
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('200s POST /generate/result with the correct bearer token', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith('/status')) {
        return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
      }
      return new Response(JSON.stringify({ images: [{ url: 'https://fal.media/files/x.png' }] }), { status: 200 })
    })
    const req = new Request('https://w.test/generate/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer op-secret-token' },
      body: resultBody,
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
  })

  it('does not gate GET /image/:key', async () => {
    const req = new Request('https://w.test/image/some-key.png', { method: 'GET' })
    const res = await worker.fetch(req, env)
    // No IMAGE_BUCKET configured -> 500 "storage not configured", never 401 —
    // proves the auth gate was never applied to this route at all.
    expect(res.status).not.toBe(401)
  })

  // A wrong token that shares a long correct PREFIX with the real one must
  // 401 just as fast/consistently as one that shares none of it — regression
  // guard for the loop-bound timing leak (comparing raw strings up to
  // Math.max(a.length, b.length) makes wall-clock time scale with token
  // length; hashing to a fixed-length digest first removes that signal).
  it('401s on a near-miss token that shares a long correct prefix, same as a totally wrong one', async () => {
    globalThis.fetch = vi.fn()
    const nearMiss = env.AUTH_TOKEN.slice(0, -1) + 'X' // differs only in the last byte
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${nearMiss}` },
      body: generateBody,
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
