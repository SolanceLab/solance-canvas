import { describe, it, expect, afterEach, vi } from 'vitest'
import { generate } from '../src/providers/grok.js'

// Grok Imagine takes reference images, but on `/images/edits` — as JSON, with
// `image` for one reference and `images[]` for several (mutually exclusive in
// xAI's schema). The edit path asks for b64_json deliberately: it returns the
// bytes, which sidesteps the ~48h expiry on xAI's generated-image URLs.

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

const okEdit = (extra = {}) =>
  new Response(JSON.stringify({ data: [{ b64_json: 'QUJD', mime_type: 'image/png', ...extra }] }), { status: 200 })

describe('grok.generate — no references', () => {
  it('stays on /images/generations', async () => {
    let url
    globalThis.fetch = vi.fn(async (u) => {
      url = String(u)
      return new Response(JSON.stringify({ data: [{ url: 'https://imgen.x.ai/tmp.png' }] }), { status: 200 })
    })
    const out = await generate({}, { prompt: 'a lighthouse', model: 'grok-imagine-image', key: 'k' })
    expect(url).toBe('https://api.x.ai/v1/images/generations')
    expect(out.image_url).toBe('https://imgen.x.ai/tmp.png')
  })

  it('treats an all-falsy reference list as no references', async () => {
    let url
    globalThis.fetch = vi.fn(async (u) => {
      url = String(u)
      return new Response(JSON.stringify({ data: [{ url: 'https://imgen.x.ai/tmp.png' }] }), { status: 200 })
    })
    await generate({}, { prompt: 'x', model: 'grok-imagine-image', key: 'k', references: [null, ''] })
    expect(url).toBe('https://api.x.ai/v1/images/generations')
  })
})

describe('grok.generate — with references', () => {
  it('sends a single reference as `image`, never alongside `images`', async () => {
    let seen
    globalThis.fetch = vi.fn(async (url, opts) => {
      seen = { url: String(url), body: JSON.parse(opts.body) }
      return okEdit()
    })
    const out = await generate({}, {
      prompt: 'render as a pencil sketch',
      model: 'grok-imagine-image',
      key: 'k',
      aspect: '16:9',
      longEdge: 2048,
      references: ['data:image/png;base64,QUJD'],
    })

    expect(seen.url).toBe('https://api.x.ai/v1/images/edits')
    expect(seen.body.image).toEqual({ url: 'data:image/png;base64,QUJD' })
    expect(seen.body.images).toBeUndefined()
    expect(seen.body.aspect_ratio).toBe('16:9')
    expect(seen.body.resolution).toBe('2k')
    expect(seen.body.response_format).toBe('b64_json')
    // Bytes come back inline, so nothing depends on xAI's expiring URL.
    expect(out.image_url).toBe('data:image/png;base64,QUJD')
  })

  it('sends several references as `images[]`, never alongside `image`', async () => {
    let body
    globalThis.fetch = vi.fn(async (_url, opts) => {
      body = JSON.parse(opts.body)
      return okEdit()
    })
    await generate({}, {
      prompt: 'combine <IMAGE_0> and <IMAGE_1>',
      model: 'grok-imagine-image',
      key: 'k',
      aspect: '1:1',
      references: ['data:image/png;base64,QUJD', 'https://example.test/b.png'],
    })
    expect(body.images).toEqual([
      { url: 'data:image/png;base64,QUJD' },
      { url: 'https://example.test/b.png' },
    ])
    expect(body.image).toBeUndefined()
  })

  it('falls back to aspect_ratio "auto" for a ratio xAI does not list, and 1k below 2048', async () => {
    let body
    globalThis.fetch = vi.fn(async (_url, opts) => {
      body = JSON.parse(opts.body)
      return okEdit()
    })
    await generate({}, {
      prompt: 'x', model: 'grok-imagine-image', key: 'k',
      aspect: '21:9', longEdge: 1024, references: ['data:image/png;base64,QUJD'],
    })
    expect(body.aspect_ratio).toBe('auto')
    expect(body.resolution).toBe('1k')
  })

  it('honours the mime type xAI reports rather than assuming png', async () => {
    globalThis.fetch = vi.fn(async () => okEdit({ mime_type: 'image/webp' }))
    const out = await generate({}, {
      prompt: 'x', model: 'grok-imagine-image', key: 'k', aspect: '1:1',
      references: ['data:image/png;base64,QUJD'],
    })
    expect(out.image_url.startsWith('data:image/webp;base64,')).toBe(true)
    expect(out.mime_type).toBe('image/webp')
  })

  it('surfaces the API error message from an edits failure', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'unsupported image format' } }), { status: 400 }))
    await expect(
      generate({}, { prompt: 'x', model: 'grok-imagine-image', key: 'k', aspect: '1:1', references: ['data:image/png;base64,QUJD'] })
    ).rejects.toThrow(/unsupported image format/)
  })
})
