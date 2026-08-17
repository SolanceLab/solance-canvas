import { describe, it, expect, vi } from 'vitest'
import { createApiClient, ApiError } from '../src/api'

function okResponse(body = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('createApiClient', () => {
  it('generate() posts to /generate with Content-Type and a forwarded X-Provider-Key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ ok: true }))
    const client = createApiClient({ baseUrl: 'https://w.test', fetchImpl })

    await client.generate({ prompt: 'x' }, { headers: { 'X-Provider-Key': 'k' } })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://w.test/generate')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(opts.headers['X-Provider-Key']).toBe('k')
  })

  it('getGenerationResult() posts to /generate/result with the same header forwarding', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ pending: false }))
    const client = createApiClient({ baseUrl: 'https://w.test', fetchImpl })

    await client.getGenerationResult({ request_id: 'r1' }, { headers: { 'X-Provider-Key': 'k' } })

    const [url, opts] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://w.test/generate/result')
    expect(opts.method).toBe('POST')
    expect(opts.headers['X-Provider-Key']).toBe('k')
  })

  it('imageUrl() builds a GET /image/:key URL and encodes unsafe characters', () => {
    const client = createApiClient({ baseUrl: 'https://w.test', fetchImpl: vi.fn() })
    expect(client.imageUrl('ab.png')).toBe('https://w.test/image/ab.png')
    expect(client.imageUrl('a b/c.png')).toBe('https://w.test/image/a%20b%2Fc.png')
  })

  it('generate() without opts sends no X-Provider-Key header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ ok: true }))
    const client = createApiClient({ baseUrl: 'https://w.test', fetchImpl })

    await client.generate({ prompt: 'x' })

    const [, opts] = fetchImpl.mock.calls[0]
    expect(opts.headers['X-Provider-Key']).toBeUndefined()
  })

  it('a non-ok response throws ApiError carrying the server message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'model is required' }), { status: 400 })
    )
    const client = createApiClient({ baseUrl: 'https://w.test', fetchImpl })

    await expect(client.generate({})).rejects.toMatchObject(
      new ApiError('model is required', 400)
    )
  })
})
