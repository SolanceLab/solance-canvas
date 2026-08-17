// ── Venice.ai ─────────────────────────────────────────────────────────
// Venice is a privacy-first host whose written Acceptable-Use policy does
// not prohibit adult content (verified 2026-08-16) and which states it does
// not monitor inputs or outputs. Its own image models — `venice-sd35` and
// the `lustify-*` family (lustify-v7 carries Venice's `most_uncensored`
// trait) — are the reason it's in this roster; the rest of Venice's catalog
// duplicates engines already reachable through the other providers here.
//
// Venice's content filter is OFF by default here — that capability is the
// reason this provider exists. Set `VENICE_SAFE_MODE = "true"` to turn it on.
//
// Three request shapes, verified against `GET /api/v1/models` (2026-08-17).
// Sending the wrong one silently mis-sizes the render rather than erroring:
//   • pixel models (venice-sd35, lustify-*) → width/height, ÷16, ≤1280
//   • ratio models (qwen-image-3*)          → aspect_ratio + resolution tier
//   • edit models  (*-edit, qwen-edit-*)    → POST /image/edit with a source
//     image, answering with RAW BINARY instead of JSON
// The first two return base64 in `images[0]`.

export const id = 'venice';
export const label = 'Venice.ai';
export const envKeys = ['VENICE_API_KEY'];

// Venice's content filter. BOTH Venice endpoints default it ON, so this module
// always sends the flag explicitly rather than relying on their default.
// Operators who want the filter on set `VENICE_SAFE_MODE = "true"`; unset keeps
// the uncensored behaviour that is the reason this provider is in the roster.
function safeMode(env) {
  return String((env && env.VENICE_SAFE_MODE) || '').toLowerCase() === 'true';
}

// Venice's catalog has TWO request shapes, and sending the wrong one silently
// mis-sizes (or rejects) the render. Verified against GET /api/v1/models:
//   • pixel models  (venice-sd35, lustify-*)  → width/height
//   • ratio models  (qwen-image-3*, …)        → aspect_ratio + resolution tier
// Anything not listed as a ratio model falls back to width/height, which is the
// older, more widely supported shape.
const RATIO_MODELS = /^qwen-image-3/;

// Edit/inpaint models take a SOURCE IMAGE and use a different endpoint
// (POST /image/edit) which returns RAW BINARY, not JSON. They advertise only
// auto/1:1/3:2/16:9 — every other aspect maps to `auto`, which preserves the
// source's own proportions and is the right default for an edit anyway.
const EDIT_MODELS = /(-edit$)|(^qwen-edit-uncensored$)/;
const EDIT_RATIOS = new Set(['1:1', '3:2', '16:9']);

function editRatio(aspect) {
  return EDIT_RATIOS.has(aspect) ? aspect : 'auto';
}

// A reference arrives as a data URL, a bare base64 blob, or an http(s) URL —
// Venice accepts a base64 string or a URL, so only the data-URL prefix is
// stripped.
function editSource(reference) {
  const value = String(reference || '');
  if (/^https?:\/\//i.test(value)) return value;
  return value.replace(/^data:image\/\w+;base64,/, '');
}

// The edit endpoint answers with image bytes. Convert without blowing the stack
// on a multi-megabyte buffer (String.fromCharCode(...wholeArray) does).
function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Edit path: source image + prompt → edited image. Only the FIRST reference is
// sent; these models advertise `combineImages`, but the multi-image request
// shape is undocumented, so wiring more would be guesswork.
async function editImage(env, { prompt, model, key, aspect, longEdge, references }) {
  const source = (references || []).map(editSource).find(Boolean);
  if (!source) {
    throw new Error(`Model '${model}' is an edit model — attach a reference image to use it, or pick a text-to-image model.`);
  }

  const response = await fetch('https://api.venice.ai/api/v1/image/edit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      image: source,
      aspect_ratio: editRatio(aspect),
      resolution: veniceResolution(longEdge),
      output_format: 'png',
      safe_mode: safeMode(env),   // endpoint default is TRUE — always sent explicitly
    }),
  });

  if (!response.ok) {
    let msg = `Venice edit error: ${response.status}`;
    try {
      const err = await response.json();
      msg = err.error || err.message || msg;
    } catch (_) { /* non-JSON error body */ }
    throw new Error(msg);
  }

  const mime = response.headers.get('content-type') || 'image/png';
  const bytes = await response.arrayBuffer();
  if (!bytes || bytes.byteLength === 0) {
    throw new Error('No image returned from Venice edit');
  }
  return { image_url: `data:${mime};base64,${bytesToBase64(bytes)}`, seed: null, mime_type: mime };
}

// aspect → [width, height], all ÷16 and ≤1280 (Venice's pixel ceiling).
const DIMS = {
  '1:1':  [1024, 1024],
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '3:2':  [1216, 816],
  '2:3':  [816, 1216],
  '4:3':  [1152, 864],
  '3:4':  [864, 1152],
};

// Ratio models advertise: 1:1, 3:2, 16:9, 21:9, 9:16, 2:3, 3:4, 4:5 — note 4:3
// is NOT among them, so it maps to its nearest supported neighbour.
const RATIOS = new Set(['1:1', '3:2', '16:9', '21:9', '9:16', '2:3', '3:4', '4:5']);

function veniceDims(aspect) {
  return DIMS[aspect] || DIMS['1:1'];
}

function veniceRatio(aspect) {
  if (RATIOS.has(aspect)) return aspect;
  if (aspect === '4:3') return '3:2';
  return '1:1';
}

// longEdge px tier → Venice resolution tier. Ratio models cap at 2K.
function veniceResolution(longEdge) {
  return Number(longEdge) >= 2048 ? '2K' : '1K';
}

export async function generate(env, { prompt, model, key, aspect, longEdge, references }) {
  if (EDIT_MODELS.test(String(model))) {
    return editImage(env, { prompt, model, key, aspect, longEdge, references });
  }

  const sizing = RATIO_MODELS.test(String(model))
    ? { aspect_ratio: veniceRatio(aspect), resolution: veniceResolution(longEdge) }
    : (([width, height]) => ({ width, height }))(veniceDims(aspect));

  const response = await fetch('https://api.venice.ai/api/v1/image/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      ...sizing,
      safe_mode: safeMode(env),
      format: 'png',
      return_binary: false,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || `Venice API error: ${response.status}`);
  }

  const b64 = Array.isArray(data.images) ? data.images[0] : null;
  if (!b64) {
    throw new Error('No image returned from Venice');
  }
  return {
    image_url: `data:image/png;base64,${b64}`,
    seed: data.request?.seed != null ? String(data.request.seed) : null,
    mime_type: 'image/png',
  };
}
