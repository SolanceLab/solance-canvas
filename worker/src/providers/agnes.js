// ── Agnes AI (Sapiens AI) ────────────────────────────────────────────
// OpenAI-compatible gateway: POST https://apihub.agnes-ai.com/v1/images/generations.
// Three contract quirks, all from their docs plus a live probe, none of
// them guessable, so none of them silent:
//
//  1. `response_format` MUST sit inside `extra_body`, never at the top
//     level. Their docs call this out explicitly as an error people hit.
//  2. Reference images go in `extra_body.image[]`. Their parameter TABLE
//     lists `image` as a top-level field while every one of their own
//     curl EXAMPLES puts it in extra_body. We send it in both places
//     rather than guess — the ignored copy costs nothing, a wrong guess
//     costs a silent txt2img.
//  3. Client-side validation errors come back as HTTP 500, not 4xx
//     (probed: a missing `prompt` returns 500 "missing 1 required
//     positional argument"). So an Agnes 500 usually means the outgoing
//     request was malformed, not that Agnes is down — worth remembering
//     when this inevitably gets debugged.
//
// THE B64 GUARANTEE — this is the part that matters most in this file.
// We force b64_json AND enforce it in code, not just in the request. Their
// default response mode (`url`) hands back a PUBLIC storage.googleapis.com
// link — anyone holding that URL can view the image, whatever it contains.
// Asking for b64_json is only a REQUEST a third party can silently ignore;
// the guarantee has to be enforced at the boundary. If Agnes responds with
// a url instead of b64_json anyway, this module downloads that image and
// re-encodes it as a data URL rather than returning the provider's public
// link. NEVER return a bare provider URL from this file's generate().
//
// This exact bug shipped once: forcing b64_json in the request was treated
// as sufficient, with a plain `b64 ? ... : (url || null)` fallback that
// passed the provider's raw URL straight through whenever they ignored the
// request. A cross-model security review caught it before it reached
// production — a test had been written that blessed the fallback instead
// of catching it. If you're touching this function, run it past a second
// model or a human before merging; the naive fallback is easy to
// reintroduce.

import { normalizeLongEdge } from './shared.js';

export const id = 'agnes';
export const label = 'Agnes AI (Sapiens AI)';
export const envKeys = ['AGNES_API_KEY'];

const AGNES_RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'];

// Map our aspect (+ resolution, for a "custom" W×H option) to an
// Agnes-supported ratio. Every non-custom preset maps 1:1; custom snaps to
// the nearest supported ratio by value, never silently to square.
export function agnesRatio(aspect, resolution) {
  if (aspect && AGNES_RATIOS.includes(aspect)) return aspect;

  // 'custom' arrives as aspect==='custom' with resolution='<W>x<H>'.
  const m = /^(\d+)x(\d+)$/.exec(String(resolution || ''));
  if (m) {
    const target = Number(m[1]) / Number(m[2]);
    if (Number.isFinite(target) && target > 0) {
      let best = '1:1';
      let bestDelta = Infinity;
      for (const r of AGNES_RATIOS) {
        const [w, h] = r.split(':').map(Number);
        const delta = Math.abs((w / h) - target);
        if (delta < bestDelta) { bestDelta = delta; best = r; }
      }
      return best;
    }
  }
  return '1:1';
}

// Map our longEdge px tier to an Agnes size tier. Agnes also accepts 3K,
// which is exposed here even though a caller may not offer it in their own
// UI — supporting the tier is then a caller-only addition, not a change
// here.
//
// NOTE: `generate` below runs longEdge through normalizeLongEdge first
// (only 1024/2048/4096 survive that), which means the 3072→'3K' branch can
// never actually fire through this module's own generate(). That mirrors
// the source faithfully — its caller normalized the same way before this
// function ever saw the value — but it's worth knowing 3K is reachable
// only by calling agnesSize(3072) directly, bypassing normalizeLongEdge.
export function agnesSize(longEdge) {
  const n = Number(longEdge);
  if (n === 1024) return '1K';
  if (n === 3072) return '3K';
  if (n === 4096) return '4K';
  return '2K';
}

// Exported for tests: the three quirks above are the entire risk surface
// of this provider, and a comment cannot stop a refactor from hoisting
// response_format to the top level. A test can.
export async function generate(env, { prompt, model, key, references, aspect, resolution, longEdge }) {
  const refs = (references || []).filter(Boolean);
  const extra = { response_format: 'b64_json' };
  if (refs.length > 0) extra.image = refs;   // data URIs accepted per their docs

  const body = {
    model,
    prompt,
    size: agnesSize(normalizeLongEdge(longEdge)),
    ratio: agnesRatio(aspect, resolution),
    extra_body: extra,
  };
  if (refs.length > 0) body.image = refs;    // see quirk 2 above

  const response = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) { /* non-json body — handled below */ }

  if (!response.ok) {
    // Agnes returns some errors in Chinese (auth failure is 无效的令牌).
    // If this error message is surfaced directly to an end user, translate
    // the one we can identify rather than showing an untranslated string.
    const raw = data?.error?.message || `Agnes API error: ${response.status}`;
    if (response.status === 401 || /无效的令牌/.test(raw)) {
      throw new Error('Agnes rejected the API key (invalid or revoked token).');
    }
    throw new Error(`Agnes: ${raw}`);
  }

  const first = data?.data?.[0];
  const b64 = first?.b64_json;
  if (b64) return { image_url: `data:image/png;base64,${b64}`, seed: null, mime_type: 'image/png' };

  // Agnes ignored the b64_json request and handed back a URL on its public
  // GCS bucket. Do NOT return that link — see the b64 guarantee note at the
  // top of this file. Pull the bytes down and re-encode so the returned
  // artifact is self-contained, exactly like every other path through this
  // function.
  if (first?.url) return { image_url: await agnesFetchAsDataUrl(first.url), seed: null, mime_type: 'image/png' };

  throw new Error('No image returned from Agnes');
}

// Download a remote image and return it as a data URL. Only used for the
// Agnes url-fallback path above.
const AGNES_MAX_IMAGE_BYTES = 25 * 1024 * 1024;   // 4K PNGs run large; keep well under a typical Worker memory ceiling

async function agnesFetchAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Agnes returned an image URL that could not be fetched (${res.status}).`);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > AGNES_MAX_IMAGE_BYTES) {
    throw new Error(`Agnes image too large to return inline (${buf.byteLength} bytes).`);
  }

  const bytes = new Uint8Array(buf);
  // btoa on a huge spread would blow the argument limit — chunk it.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }

  const mime = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
  return `data:${mime};base64,${btoa(binary)}`;
}
