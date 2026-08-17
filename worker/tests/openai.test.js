import { describe, it, expect, afterEach, vi } from 'vitest'
import { generate } from '../src/providers/openai.js'

// gpt-image models take up to 16 reference images, but only on a DIFFERENT
// endpoint (/images/edits) with a DIFFERENT encoding (multipart, one repeated
// `image[]` part per reference). Sending references on the generations body
// does nothing — which is exactly how this layer used to silently drop them.

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

const okEdit = () => new Response(JSON.stringify({ data: [{ b64_json: 'QUJD' }] }), { status: 200 })

describe('openai.generate — no references', () => {
  it('posts JSON to /images/generations', async () => {
    let seen
    globalThis.fetch = vi.fn(async (url, opts) => {
      seen = { url: String(url), opts }
      return okEdit()
    })
    const out = await generate({}, { prompt: 'a lighthouse', model: 'gpt-image-2', key: 'k', aspect: '16:9' })
    expect(seen.url).toBe('https://api.openai.com/v1/images/generations')
    expect(seen.opts.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(seen.opts.body).size).toBe('1536x1024')
    expect(out.image_url).toBe('data:image/png;base64,QUJD')
  })
})

describe('openai.generate — with references', () => {
  it('switches to /images/edits and sends one image[] part per reference', async () => {
    let seen
    globalThis.fetch = vi.fn(async (url, opts) => {
      seen = { url: String(url), opts }
      return okEdit()
    })
    const out = await generate({}, {
      prompt: 'put them in a basket',
      model: 'gpt-image-2',
      key: 'k',
      aspect: '1:1',
      references: ['data:image/png;base64,QUJD', 'data:image/jpeg;base64,QUJD'],
    })

    expect(seen.url).toBe('https://api.openai.com/v1/images/edits')
    // Content-Type must be left unset so fetch can set the multipart boundary.
    expect(seen.opts.headers['Content-Type']).toBeUndefined()
    expect(seen.opts.headers.Authorization).toBe('Bearer k')

    const parts = seen.opts.body.getAll('image[]')
    expect(parts).toHaveLength(2)
    expect(parts[0].type).toBe('image/png')
    expect(parts[1].type).toBe('image/jpeg')
    expect(seen.opts.body.get('model')).toBe('gpt-image-2')
    expect(seen.opts.body.get('prompt')).toBe('put them in a basket')
    expect(seen.opts.body.get('size')).toBe('1024x1024')
    expect(out.image_url).toBe('data:image/png;base64,QUJD')
  })

  it('caps at the API maximum of 16 references', async () => {
    let body
    globalThis.fetch = vi.fn(async (_url, opts) => { body = opts.body; return okEdit() })
    await generate({}, {
      prompt: 'x', model: 'gpt-image-2', key: 'k', aspect: '1:1',
      references: Array.from({ length: 20 }, () => 'data:image/png;base64,QUJD'),
    })
    expect(body.getAll('image[]')).toHaveLength(16)
  })

  it('refuses a remote URL reference rather than fetching it server-side (SSRF guard)', async () => {
    globalThis.fetch = vi.fn()
    await expect(
      generate({}, { prompt: 'x', model: 'gpt-image-2', key: 'k', aspect: '1:1', references: ['https://example.test/a.png'] })
    ).rejects.toThrow(/base64 or data-URL/i)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('an empty or all-falsy reference list stays on the generations path', async () => {
    let url
    globalThis.fetch = vi.fn(async (u) => { url = String(u); return okEdit() })
    await generate({}, { prompt: 'x', model: 'gpt-image-2', key: 'k', aspect: '1:1', references: [null, ''] })
    expect(url).toBe('https://api.openai.com/v1/images/generations')
  })

  it('surfaces the API error message from an edits failure', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'image too large' } }), { status: 400 }))
    await expect(
      generate({}, { prompt: 'x', model: 'gpt-image-2', key: 'k', aspect: '1:1', references: ['data:image/png;base64,QUJD'] })
    ).rejects.toThrow(/image too large/)
  })
})
