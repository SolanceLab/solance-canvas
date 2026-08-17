// ── Bring-your-own provider keys ────────────────────────────────────
// Keys entered in CanvasSettings live ONLY in this browser's localStorage.
// They are sent per-request as an `X-Provider-Key` header (see
// generation.js / Canvas.jsx) and never sent anywhere except the
// configured Worker at generate time — never synced, never stored
// server-side by this client.
//
// This module is deliberately the ONLY place that can read a stored key's
// VALUE. `listProviderKeyStatus()` exposes booleans only, and it's the
// only read CanvasSettings is allowed to import — so a stored key
// physically cannot reach the DOM from that screen. Keep it that way.

export const PROVIDER_KEYS_STORAGE_KEY = 'solance_canvas_provider_keys'

function hasLocalStorage() {
  return typeof localStorage !== 'undefined'
}

// { [providerId]: key } — {} on missing/malformed JSON or when
// localStorage isn't available (e.g. import in a node test).
export function readProviderKeys() {
  if (!hasLocalStorage()) return {}
  try {
    const raw = localStorage.getItem(PROVIDER_KEYS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
  } catch {
    return {}
  }
}

function writeProviderKeys(map) {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(PROVIDER_KEYS_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* storage unavailable/full — silently no-op, nothing to persist */
  }
}

// Trimmed key for `providerId`, or '' if none stored.
export function getProviderKey(providerId) {
  const map = readProviderKeys()
  const value = map[providerId]
  return typeof value === 'string' ? value.trim() : ''
}

// Store a trimmed key for `providerId`. An empty/whitespace-only key
// removes the entry instead of storing an empty string.
export function setProviderKey(providerId, key) {
  if (!providerId) return
  const trimmed = typeof key === 'string' ? key.trim() : ''
  const map = readProviderKeys()
  if (!trimmed) {
    delete map[providerId]
  } else {
    map[providerId] = trimmed
  }
  writeProviderKeys(map)
}

export function removeProviderKey(providerId) {
  if (!providerId) return
  const map = readProviderKeys()
  delete map[providerId]
  writeProviderKeys(map)
}

// { [providerId]: true } for every provider with a stored key — booleans
// only, never the key value. This is the ONLY read CanvasSettings.jsx may
// import from this module.
export function listProviderKeyStatus() {
  const map = readProviderKeys()
  const status = {}
  for (const [providerId, value] of Object.entries(map)) {
    if (typeof value === 'string' && value.trim()) status[providerId] = true
  }
  return status
}
