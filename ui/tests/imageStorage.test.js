import { describe, it, expect } from 'vitest'
import { isStoredImageKey } from '../src/imageStorage'

// This predicate decides whether a gallery image is fetched as a private authed
// blob or rendered as a plain URL. Getting it wrong in either direction is
// visible breakage: a false negative puts a bare storage key into <img src>
// (broken image), a false positive tries to blob-fetch a data: URL (broken
// image).
//
// It also has to keep the LEGACY shapes renderable — real-world rows can hold
// inline base64 and rows holding expiring provider links, and a migration to
// real object storage must not blank them out.

describe('isStoredImageKey — storage key vs legacy value', () => {
  it('accepts well-formed uuid.ext keys for every supported extension', () => {
    for (const ext of ['png', 'jpg', 'webp', 'gif']) {
      expect(isStoredImageKey(`3f2504e0-4f89-11d3-9a0c-0305e82c3301.${ext}`)).toBe(true)
    }
  })

  it('is case-insensitive on both the uuid and the extension', () => {
    expect(isStoredImageKey('3F2504E0-4F89-11D3-9A0C-0305E82C3301.PNG')).toBe(true)
  })

  it('leaves legacy inline base64 rows alone', () => {
    expect(isStoredImageKey('data:image/png;base64,iVBORw0KGgo=')).toBe(false)
  })

  it('leaves legacy provider links alone — including shapes that expire', () => {
    expect(isStoredImageKey('https://imgen.x.ai/xai-imgen/xai-tmp-imgen-4a42aabe-7d01.jpg')).toBe(false)
    expect(isStoredImageKey('https://v3b.fal.media/files/b/0aa48f48/AXtVlYbdGPDgSkda.png')).toBe(false)
  })

  it('refuses anything with a path separator (the traversal guard)', () => {
    expect(isStoredImageKey('../3f2504e0-4f89-11d3-9a0c-0305e82c3301.png')).toBe(false)
    expect(isStoredImageKey('nested/3f2504e0-4f89-11d3-9a0c-0305e82c3301.png')).toBe(false)
    expect(isStoredImageKey('3f2504e0-4f89-11d3-9a0c-0305e82c3301.png/../../etc/passwd')).toBe(false)
  })

  it('refuses malformed uuids, wrong extensions, and non-strings', () => {
    expect(isStoredImageKey('not-a-uuid.png')).toBe(false)
    expect(isStoredImageKey('3f2504e0-4f89-11d3-9a0c-0305e82c3301.svg')).toBe(false)
    expect(isStoredImageKey('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(false)
    expect(isStoredImageKey('')).toBe(false)
    expect(isStoredImageKey(null)).toBe(false)
    expect(isStoredImageKey(undefined)).toBe(false)
    expect(isStoredImageKey(42)).toBe(false)
    expect(isStoredImageKey({})).toBe(false)
  })

  it('refuses a key with trailing junk (anchored at both ends)', () => {
    expect(isStoredImageKey(' 3f2504e0-4f89-11d3-9a0c-0305e82c3301.png')).toBe(false)
    expect(isStoredImageKey('3f2504e0-4f89-11d3-9a0c-0305e82c3301.png ')).toBe(false)
    expect(isStoredImageKey('x3f2504e0-4f89-11d3-9a0c-0305e82c3301.png')).toBe(false)
  })
})
