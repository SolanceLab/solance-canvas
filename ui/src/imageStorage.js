// ── Where a generated image actually lives ────────────────────────
//
// Three shapes exist in a generation row's `image_url`, and all three must
// render:
//
//   1. `<uuid>.<ext>`  — an object-storage key (R2, S3, or whatever your
//      backend uses). PRIVATE: served only to an authed request, so it
//      needs a blob fetch through an image-serving endpoint, not a plain
//      <img src>.
//   2. `data:image/…`  — legacy inline base64 (some providers return
//      images inline rather than as a hosted URL).
//   3. `https://…`     — a link to a provider's own hosting. Some providers'
//      links are explicitly temporary and expire within hours to days —
//      that expiry is usually the whole reason generated images get copied
//      into your own storage in the first place. Kept renderable so
//      anything still resolving keeps showing, but nothing new should be
//      written in this shape once you have real storage wired up.
//
// This predicate decides whether a gallery image is fetched as a private
// authed blob or rendered as a plain URL. Getting it wrong in either
// direction is visible breakage: a false negative puts a bare storage key
// into <img src> (broken image), a false positive tries to blob-fetch a
// data: URL (broken image). It also has to keep the LEGACY shapes above
// renderable — a migration to real storage must not blank out older rows.
//
// This regex MUST mirror whatever guard your backend's image-serve route
// uses to accept a key (and refuse path traversal) — keep the two in sync.
const STORED_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/i

export function isStoredImageKey(value) {
  return typeof value === 'string' && STORED_KEY_RE.test(value)
}

export default isStoredImageKey
