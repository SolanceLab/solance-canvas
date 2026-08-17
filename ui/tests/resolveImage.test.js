import { describe, it, expect, vi } from 'vitest'
import { resolveImage } from '../src/resolveImage'
import { createApiClient } from '../src/api'

// Integration test (arbitration amendment 1): the Worker's /generate
// response can hand back a bare opaque storage key as `image_url`
// (worker/src/storage.js's `<uuid>.<ext>`) OR a value that's already a
// usable URL (`data:` inline base64, or a provider's `https:` link, kept
// renderable for legacy rows). This proves the real api client's
// imageUrl() is what a stored key routes through, and that the other two
// shapes pass through completely untouched — exercising resolveImage()
// and createApiClient() together rather than either in isolation.

describe('resolveImage — integration with a real api client', () => {
  const apiClient = createApiClient({ baseUrl: 'https://w.test', fetchImpl: vi.fn() })

  it('a bare Worker storage key resolves through apiClient.imageUrl() to GET /image/:key', () => {
    const key = '3f2504e0-4f89-11d3-9a0c-0305e82c3301.png'
    expect(resolveImage(apiClient, key)).toBe('https://w.test/image/3f2504e0-4f89-11d3-9a0c-0305e82c3301.png')
  })

  it('a data: URL passes through untouched', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    expect(resolveImage(apiClient, dataUrl)).toBe(dataUrl)
  })

  it('an https: provider URL passes through untouched', () => {
    const url = 'https://v3b.fal.media/files/b/0aa48f48/AXtVlYbdGPDgSkda.png'
    expect(resolveImage(apiClient, url)).toBe(url)
  })

  it('a falsy value resolves to null', () => {
    expect(resolveImage(apiClient, null)).toBeNull()
    expect(resolveImage(apiClient, '')).toBeNull()
    expect(resolveImage(apiClient, undefined)).toBeNull()
  })
})
