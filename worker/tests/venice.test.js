import { describe, it, expect, afterEach, vi } from 'vitest'
import { generate } from '../src/providers/venice.js'

// Venice's own image models (venice-sd35, lustify-*) are text-to-image and
// take width/height, not aspect_ratio. The module maps our aspect strings to
// dimensions that are divisible by 16 and capped at Venice's 1280 ceiling,
// sends safe_mode:false (the reason this provider exists in the roster), and
// unwraps the base64 image from `images[0]`.

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('venice.generate', () => {
  it('posts to the Venice endpoint with a valid width/height, safe_mode:false, and Bearer key', async () => {
    let seen
    globalThis.fetch = vi.fn(async (url, opts) => {
      seen = { url: String(url), opts, body: JSON.parse(opts.body) }
      return new Response(JSON.stringify({ images: ['QUJD'], request: { seed: 7 } }), { status: 200 })
    })

    const out = await generate({}, {
      prompt: 'a lighthouse at dusk',
      model: 'lustify-v7',
      key: 'venice-key-123',
      aspect: '16:9',
    })

    expect(seen.url).toBe('https://api.venice.ai/api/v1/image/generate')
    expect(seen.opts.headers.Authorization).toBe('Bearer venice-key-123')
    expect(seen.body.model).toBe('lustify-v7')
    expect(seen.body.safe_mode).toBe(false)
    // 16:9 → 1280×720; both ÷16 and ≤1280.
    expect(seen.body.width % 16).toBe(0)
    expect(seen.body.height % 16).toBe(0)
    expect(seen.body.width).toBeLessThanOrEqual(1280)
    expect(seen.body.height).toBeLessThanOrEqual(1280)
    // base64 unwrapped into a data URL, seed surfaced as a string.
    expect(out.image_url).toBe('data:image/png;base64,QUJD')
    expect(out.seed).toBe('7')
  })

  it('every mapped aspect stays ÷16 and within the 1280 ceiling', async () => {
    for (const aspect of ['1:1', '16:9', '9:16', '3:2', '2:3', '4:3', '3:4', 'unknown-falls-back']) {
      globalThis.fetch = vi.fn(async (_url, opts) => {
        const b = JSON.parse(opts.body)
        expect(b.width % 16, `${aspect} width`).toBe(0)
        expect(b.height % 16, `${aspect} height`).toBe(0)
        expect(b.width).toBeLessThanOrEqual(1280)
        expect(b.height).toBeLessThanOrEqual(1280)
        return new Response(JSON.stringify({ images: ['QUJD'] }), { status: 200 })
      })
      await generate({}, { prompt: 'x', model: 'venice-sd35', key: 'k', aspect })
    }
  })

  it('throws the Venice error message on a non-ok response', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'insufficient balance' }), { status: 402 }))
    await expect(
      generate({}, { prompt: 'x', model: 'venice-sd35', key: 'k', aspect: '1:1' })
    ).rejects.toThrow(/insufficient balance/)
  })

  it('throws when the response carries no image', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ images: [] }), { status: 200 }))
    await expect(
      generate({}, { prompt: 'x', model: 'venice-sd35', key: 'k', aspect: '1:1' })
    ).rejects.toThrow(/No image returned/)
  })
})

// Venice has TWO request shapes and sending the wrong one silently mis-sizes or
// rejects the render: pixel models (venice-sd35, lustify-*) take width/height,
// ratio models (qwen-image-3*) take aspect_ratio + a resolution tier. Verified
// against GET /api/v1/models 2026-08-17.
describe('venice.generate — ratio-model request shape (qwen-image-3)', () => {
  it('sends aspect_ratio + resolution and NO width/height for qwen-image-3', async () => {
    let body
    globalThis.fetch = vi.fn(async (_url, opts) => {
      body = JSON.parse(opts.body)
      return new Response(JSON.stringify({ images: ['QUJD'] }), { status: 200 })
    })
    await generate({}, { prompt: 'x', model: 'qwen-image-3', key: 'k', aspect: '16:9', longEdge: 2048 })
    expect(body.aspect_ratio).toBe('16:9')
    expect(body.resolution).toBe('2K')
    expect(body.width).toBeUndefined()
    expect(body.height).toBeUndefined()
    expect(body.safe_mode).toBe(false)
  })

  it('maps 4:3 (not in Venice ratio list) to its nearest supported neighbour', async () => {
    let body
    globalThis.fetch = vi.fn(async (_url, opts) => {
      body = JSON.parse(opts.body)
      return new Response(JSON.stringify({ images: ['QUJD'] }), { status: 200 })
    })
    await generate({}, { prompt: 'x', model: 'qwen-image-3-pro', key: 'k', aspect: '4:3', longEdge: 1024 })
    expect(['3:2', '1:1']).toContain(body.aspect_ratio)
    expect(body.resolution).toBe('1K')
  })

  it('still sends width/height for the pixel models (no cross-contamination)', async () => {
    let body
    globalThis.fetch = vi.fn(async (_url, opts) => {
      body = JSON.parse(opts.body)
      return new Response(JSON.stringify({ images: ['QUJD'] }), { status: 200 })
    })
    await generate({}, { prompt: 'x', model: 'lustify-v7', key: 'k', aspect: '16:9', longEdge: 2048 })
    expect(body.width).toBe(1280)
    expect(body.height).toBe(720)
    expect(body.aspect_ratio).toBeUndefined()
    expect(body.resolution).toBeUndefined()
  })
})

// Edit models take a source image, POST to /image/edit, and get RAW BINARY back
// (not JSON). safe_mode defaults to TRUE on that endpoint, so it must be sent.
describe('venice.generate — edit models (reference images)', () => {
  it('routes an edit model to /image/edit with the reference, auto ratio, and safe_mode:false', async () => {
    let seen
    globalThis.fetch = vi.fn(async (url, opts) => {
      seen = { url: String(url), body: JSON.parse(opts.body) }
      return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200, headers: { 'content-type': 'image/png' } })
    })
    const out = await generate({}, {
      prompt: 'make her hair blue',
      model: 'qwen-image-3-edit',
      key: 'k',
      aspect: '9:16',            // not supported by edit models → auto
      longEdge: 2048,
      references: ['data:image/png;base64,QUJD'],
    })
    expect(seen.url).toBe('https://api.venice.ai/api/v1/image/edit')
    expect(seen.body.image).toBe('QUJD')      // data-URL prefix stripped
    expect(seen.body.aspect_ratio).toBe('auto')
    expect(seen.body.resolution).toBe('2K')
    expect(seen.body.safe_mode).toBe(false)
    expect(out.image_url.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('passes an http(s) reference through untouched', async () => {
    let body
    globalThis.fetch = vi.fn(async (_url, opts) => {
      body = JSON.parse(opts.body)
      return new Response(new Uint8Array([1]).buffer, { status: 200, headers: { 'content-type': 'image/png' } })
    })
    await generate({}, { prompt: 'x', model: 'qwen-edit-uncensored', key: 'k', aspect: '1:1', references: ['https://example.test/a.png'] })
    expect(body.image).toBe('https://example.test/a.png')
    expect(body.aspect_ratio).toBe('1:1')
  })

  it('fails with a useful message when an edit model gets no reference', async () => {
    globalThis.fetch = vi.fn()
    await expect(
      generate({}, { prompt: 'x', model: 'qwen-image-3-edit', key: 'k', aspect: '1:1', references: [] })
    ).rejects.toThrow(/attach a reference image/i)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('does NOT route text-to-image models to the edit endpoint even with references present', async () => {
    let url
    globalThis.fetch = vi.fn(async (u, _opts) => {
      url = String(u)
      return new Response(JSON.stringify({ images: ['QUJD'] }), { status: 200 })
    })
    await generate({}, { prompt: 'x', model: 'qwen-image-3', key: 'k', aspect: '1:1', references: ['data:image/png;base64,QUJD'] })
    expect(url).toBe('https://api.venice.ai/api/v1/image/generate')
  })
})

// The content filter is OFF unless an operator opts in. Both Venice endpoints
// default it ON, so the flag is always sent explicitly rather than omitted.
describe('venice — VENICE_SAFE_MODE opt-in', () => {
  const capture = () => {
    let body
    globalThis.fetch = vi.fn(async (_url, opts) => {
      body = JSON.parse(opts.body)
      return new Response(JSON.stringify({ images: ['QUJD'] }), { status: 200 })
    })
    return () => body
  }

  it('sends safe_mode:false when the env var is unset', async () => {
    const body = capture()
    await generate({}, { prompt: 'x', model: 'qwen-image-3', key: 'k', aspect: '1:1' })
    expect(body().safe_mode).toBe(false)
  })

  it('sends safe_mode:true when VENICE_SAFE_MODE="true" (case-insensitive)', async () => {
    const body = capture()
    await generate({ VENICE_SAFE_MODE: 'TRUE' }, { prompt: 'x', model: 'qwen-image-3', key: 'k', aspect: '1:1' })
    expect(body().safe_mode).toBe(true)
  })

  it('treats any other value as off, and honours the opt-in on the edit endpoint too', async () => {
    const body = capture()
    await generate({ VENICE_SAFE_MODE: '1' }, { prompt: 'x', model: 'venice-sd35', key: 'k', aspect: '1:1' })
    expect(body().safe_mode).toBe(false)

    let editBody
    globalThis.fetch = vi.fn(async (_url, opts) => {
      editBody = JSON.parse(opts.body)
      return new Response(new Uint8Array([1]).buffer, { status: 200, headers: { 'content-type': 'image/png' } })
    })
    await generate({ VENICE_SAFE_MODE: 'true' }, { prompt: 'x', model: 'qwen-image-3-edit', key: 'k', aspect: '1:1', references: ['data:image/png;base64,QUJD'] })
    expect(editBody.safe_mode).toBe(true)
  })
})
