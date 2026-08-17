// ── Resolve a result's image_url to a usable <img src> ──────────────
// Pulled out of Canvas.jsx as its own pure, node-testable function — the
// same reasoning as generation.js: the Worker can hand back either its own
// opaque storage key (worker/src/storage.js's `<uuid>.<ext>`, which needs
// GET /image/:key) or a value that's already a usable URL (`data:` inline
// base64, or a provider's own `https:` link, kept renderable for legacy
// rows). Getting this mapping wrong in either direction is a broken
// image — this is small enough to prove directly rather than trust.

import { isStoredImageKey } from './imageStorage'

export function resolveImage(apiClient, value) {
  if (!value) return null
  if (isStoredImageKey(value)) return apiClient.imageUrl(value)
  return value
}
