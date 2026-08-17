import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  PROVIDER_KEYS_STORAGE_KEY,
  readProviderKeys,
  getProviderKey,
  setProviderKey,
  removeProviderKey,
  listProviderKeyStatus,
} from '../src/providerKeys'

// providerKeys.js is the ONLY module allowed to read a stored key's VALUE.
// listProviderKeyStatus() is the only read CanvasSettings.jsx may import —
// these tests prove it never leaks a value, and that the module is
// import-safe (never throws) with no localStorage present at all.

function installLocalStorageShim() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
  }
  return store
}

describe('providerKeys — with a localStorage shim', () => {
  beforeEach(() => { installLocalStorageShim() })
  afterEach(() => { delete globalThis.localStorage })

  it('readProviderKeys() is {} when nothing is stored', () => {
    expect(readProviderKeys()).toEqual({})
  })

  it('setProviderKey trims and getProviderKey reads it back trimmed', () => {
    setProviderKey('grok', ' k1 ')
    expect(getProviderKey('grok')).toBe('k1')
    const raw = JSON.parse(globalThis.localStorage.getItem(PROVIDER_KEYS_STORAGE_KEY))
    expect(raw).toEqual({ grok: 'k1' })
  })

  it('listProviderKeyStatus exposes booleans only, never the key string', () => {
    setProviderKey('grok', 'super-secret-value')
    const status = listProviderKeyStatus()
    expect(status).toEqual({ grok: true })
    expect(JSON.stringify(status)).not.toContain('super-secret-value')
  })

  it('setProviderKey with an empty/whitespace value removes the entry', () => {
    setProviderKey('grok', 'k1')
    setProviderKey('grok', '   ')
    expect(getProviderKey('grok')).toBe('')
    expect(readProviderKeys()).toEqual({})
  })

  it('removeProviderKey deletes a stored entry', () => {
    setProviderKey('fal', 'k2')
    removeProviderKey('fal')
    expect(getProviderKey('fal')).toBe('')
    expect(listProviderKeyStatus()).toEqual({})
  })

  it('malformed JSON in storage is treated as empty', () => {
    globalThis.localStorage.setItem(PROVIDER_KEYS_STORAGE_KEY, '{not json')
    expect(readProviderKeys()).toEqual({})
    expect(listProviderKeyStatus()).toEqual({})
  })
})

describe('providerKeys — with NO localStorage present', () => {
  it('every function returns safely instead of throwing', () => {
    expect(typeof globalThis.localStorage).toBe('undefined')
    expect(() => readProviderKeys()).not.toThrow()
    expect(readProviderKeys()).toEqual({})
    expect(() => getProviderKey('grok')).not.toThrow()
    expect(getProviderKey('grok')).toBe('')
    expect(() => setProviderKey('grok', 'x')).not.toThrow()
    expect(() => removeProviderKey('grok')).not.toThrow()
    expect(() => listProviderKeyStatus()).not.toThrow()
    expect(listProviderKeyStatus()).toEqual({})
  })
})
