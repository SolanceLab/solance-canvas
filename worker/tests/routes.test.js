import { describe, it, expect } from 'vitest'
import worker from '../src/index.js'

// The Worker is deliberately a four-route surface (POST /generate,
// POST /generate/result, GET /image/:key, OPTIONS). Everything from the
// stripped private app (gallery, server-side key CRUD, style extraction,
// a saved-reference library) was never implemented here — this proves
// those paths 404 rather than silently existing, and that CORS behaves
// as documented in http.js.

describe('routes — stripped surface', () => {
  it('404s routes that were never implemented on this Worker', async () => {
    const cases = [
      ['GET', 'https://w.test/generations'],
      ['POST', 'https://w.test/generate/extract-style'],
      ['GET', 'https://w.test/generator/keys'],
      ['POST', 'https://w.test/generator/references'],
    ]
    for (const [method, url] of cases) {
      const res = await worker.fetch(new Request(url, { method }), {})
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body).toEqual({ error: 'Not found' })
    }
  })
})

describe('CORS — configurable ALLOWED_ORIGIN', () => {
  it('defaults to wildcard when ALLOWED_ORIGIN is unset', async () => {
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await worker.fetch(req, {})
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('echoes an allowed origin and sets Vary: Origin', async () => {
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://a.example' },
      body: JSON.stringify({}),
    })
    const res = await worker.fetch(req, { ALLOWED_ORIGIN: 'https://a.example' })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://a.example')
    expect(res.headers.get('Vary')).toBe('Origin')
  })

  it('rejects a mismatched Origin server-side before routing, on a POST route', async () => {
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      // A "simple request" Content-Type (no preflight triggered) — this is
      // exactly the shape that used to slip past CORS headers and still
      // spend provider credits.
      headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.example' },
      body: JSON.stringify({ prompt: 'x', provider: 'fal', model: 'y' }),
    })
    const res = await worker.fetch(req, { ALLOWED_ORIGIN: 'https://a.example' })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toEqual({ error: 'Origin not allowed' })
    // The mismatched origin never gets echoed back either.
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('https://evil.example')
  })

  it('rejects a mismatched Origin on GET /image/:key too', async () => {
    const req = new Request('https://w.test/image/some-key.png', {
      method: 'GET',
      headers: { Origin: 'https://evil.example' },
    })
    const res = await worker.fetch(req, { ALLOWED_ORIGIN: 'https://a.example' })
    expect(res.status).toBe(403)
  })

  it('does not reject a request with no Origin header (curl, server-to-server) even when ALLOWED_ORIGIN is configured', async () => {
    const req = new Request('https://w.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await worker.fetch(req, { ALLOWED_ORIGIN: 'https://a.example' })
    // No Origin header means it's not a browser CORS request — it reaches
    // the handler and fails on validation (missing prompt), not on origin.
    expect(res.status).toBe(400)
  })

  it('OPTIONS preflight lists X-Provider-Key in Allow-Headers', async () => {
    const req = new Request('https://w.test/generate', { method: 'OPTIONS' })
    const res = await worker.fetch(req, {})
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Provider-Key')
  })
})
