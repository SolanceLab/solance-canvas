// ── Shared helpers ───────────────────────────────────────────────────
// Utilities used by more than one provider module. Provider-specific
// mapping tables (aspect ratios, size tiers, etc.) live in their own
// provider file instead — this file is only for things two or more
// providers actually share.

// Parse a reference image into { mimeType, data }. Accepts a full data
// URL ("data:image/png;base64,...") or a raw base64 string with no
// prefix, in which case png is assumed.
export function parseReference(reference) {
  if (!reference) return null;
  const mimeMatch = reference.match(/^data:(image\/\w+);base64,/);
  if (mimeMatch) {
    return { mimeType: mimeMatch[1], data: reference.replace(/^data:image\/\w+;base64,/, '') };
  }
  // Raw base64 with no data-url prefix — assume png.
  return { mimeType: 'image/png', data: reference };
}

// Accept only three resolution tiers (1K/2K/4K, expressed as the pixel
// length of the image's long edge); any other value (missing, malformed,
// out of range) falls back to the 2K default so callers that never send
// longEdge get a stable, byte-identical result.
export function normalizeLongEdge(longEdge) {
  const n = Number(longEdge);
  return (n === 1024 || n === 2048 || n === 4096) ? n : 2048;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
