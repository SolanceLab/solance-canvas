// ── fal.ai ────────────────────────────────────────────────────────────
// fal fronts several model families (ByteDance Seedream, OpenAI gpt-image-2,
// xAI Grok Imagine, ...) behind one queue API. Because some of those models
// run well past typical edge/proxy timeouts, this module exposes the
// queue's submit/poll steps separately (`submit`, `poll`) in addition to a
// convenience `generate` that does one bounded poll and throws if the job
// is still running — callers who front this with an HTTP edge (Cloudflare
// Workers, Vercel edge functions, etc.) should call `submit`/`poll`
// directly and hand the caller a pending ticket to poll again, rather than
// blocking the whole request on `generate`. THIS IS LOAD-BEARING: do not
// collapse submit+poll back into one function.
//
// Concretely, on Cloudflare Workers the synchronous `fal.run/<slug>`
// endpoint caps around 60s and Cloudflare itself cuts the origin
// connection at roughly 100s. Heavy models (gpt-image-2, especially with
// reference images, observed running >114s) returned a plain-text
// "error code: 524" that broke JSON parsing on the client. Submitting to
// the async queue (queue.fal.run) returns instantly with a ticket; the
// caller polls status_url/response_url until the job completes. Root-caused
// against this exact failure mode — keep the two-step shape.
//
// The URL fal hands back for a finished image lives on fal's own storage
// and, like other providers' hosted URLs, should not be assumed permanent.
// Download and persist the bytes yourself if you need the image to outlive
// the response.

import { normalizeLongEdge } from './shared.js';

export const id = 'fal';
export const label = 'fal.ai';
export const envKeys = ['FAL_KEY', 'FAL_API_KEY'];

// Map an aspect ratio ("16:9", "1:1", "4:3"...) to a fal image_size preset.
function falImageSize(aspect) {
  const map = {
    '1:1': 'square_hd',
    '4:3': 'landscape_4_3',
    '3:4': 'portrait_4_3',
    '16:9': 'landscape_16_9',
    '9:16': 'portrait_16_9',
  };
  return map[aspect] || 'square_hd';
}

// Explicit {width,height} for Seedream at a target long-edge. Seedream's
// quality IS its resolution (no separate quality flag); fal's `_hd` string
// presets cap at ~1024px, which under-serves it. Seedream's own default is
// 2048 and it accepts up to 4096 (total pixels must stay between 960×960
// and 4096×4096). longEdge default 2048 (2K) is a 4× pixel jump over the
// string presets.
//
// fal enforces a 960×960 pixel floor. At longEdge=1024 (1K), non-square
// ratios compute a short edge under 960 — rather than clamp that edge and
// distort the ratio, scale BOTH edges up (ratio-preserving) so the short
// edge lands at exactly 960 and the long edge grows past the nominal
// longEdge.
const FAL_MIN_SHORT_EDGE = 960;
export function falDims(aspect, longEdge = 2048) {
  const ratios = {
    '1:1': [1, 1],
    '16:9': [16, 9], '9:16': [9, 16],
    '4:3': [4, 3], '3:4': [3, 4],
    '3:2': [3, 2], '2:3': [2, 3],
  };
  const [rw, rh] = ratios[aspect] || [1, 1];
  let width, height;
  if (rw >= rh) {
    width = longEdge;
    height = Math.round((longEdge * rh) / rw);
    if (height < FAL_MIN_SHORT_EDGE) {
      height = FAL_MIN_SHORT_EDGE;
      width = Math.round((FAL_MIN_SHORT_EDGE * rw) / rh);
    }
  } else {
    height = longEdge;
    width = Math.round((longEdge * rw) / rh);
    if (width < FAL_MIN_SHORT_EDGE) {
      width = FAL_MIN_SHORT_EDGE;
      height = Math.round((FAL_MIN_SHORT_EDGE * rh) / rw);
    }
  }
  return { width, height };
}

// fal slug + request body for a generation. Slug shape differs by model
// family: most models use `<model>` for txt2img and `<model>/edit` when
// references are present (openai/gpt-image-2, xai/grok-imagine); ByteDance
// Seedream uses `<model>/text-to-image` for txt2img and `<model>/edit` for
// refs. Verified against fal.ai 2026-06-19 — re-verify if fal changes their
// routing convention.
function falBuildRequest({ prompt, model, aspect, references, longEdge = 2048 }) {
  const hasRefs = Array.isArray(references) && references.length > 0;
  const isSeedream = model.includes('bytedance/seedream');
  const slug = hasRefs
    ? `${model}/edit`
    : (isSeedream ? `${model}/text-to-image` : model);

  const body = hasRefs
    ? {
        prompt,
        image_urls: references,        // base64 data URLs OK per fal docs
        // Seedream: 'auto_2K' keeps the refs' aspect but renders at 2K (its
        // presets/auto otherwise cap low). Other models: 'auto' matches refs.
        image_size: isSeedream ? 'auto_2K' : 'auto',
        num_images: 1,
        output_format: 'png',
        quality: 'high',
        enable_safety_checker: false,   // this module makes no content-policy assumptions on your behalf — set per your own deployment
      }
    : {
        prompt,
        // Seedream: explicit dims at the requested long-edge (1K/2K/4K), floor-
        // adjusted for aspect. Others keep presets.
        image_size: isSeedream ? falDims(aspect, longEdge) : falImageSize(aspect),
        num_images: 1,
        output_format: 'png',
        enable_safety_checker: false,
      };
  return { slug, body };
}

// Submit a job to fal's ASYNC QUEUE (queue.fal.run) and return its ticket.
// Returns instantly; the caller polls for the result with `poll`.
export async function submit(env, { prompt, model, key, aspect, references, longEdge }) {
  const { slug, body } = falBuildRequest({ prompt, model, aspect, references, longEdge: normalizeLongEdge(longEdge) });
  const response = await fetch(`https://queue.fal.run/${slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${key}` },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.request_id) {
    throw new Error(data.detail || data.error?.message || `fal.ai queue submit failed: ${response.status}`);
  }
  // fal returns absolute status_url / response_url — use them verbatim
  // (robust against slug-path quirks) rather than reconstructing.
  return {
    request_id: data.request_id,
    status_url: data.status_url || `https://queue.fal.run/${slug}/requests/${data.request_id}/status`,
    response_url: data.response_url || `https://queue.fal.run/${slug}/requests/${data.request_id}`,
  };
}

// Poll a fal queue ticket until COMPLETED, FAILED, or the time budget runs
// out. Keep budgetMs well under your own edge's timeout so the caller
// always gets an answer in time. Returns { done:true, image_url, seed } or
// { done:false } — on { done:false }, save the ticket fields and call
// `poll` again later (that is the pending-ticket path).
// Hosts a ticket URL is allowed to point at.
//
// ⚠️ SECURITY — DO NOT REMOVE OR WIDEN THIS.
// `poll()` is reached from POST /generate/result, and `status_url` /
// `response_url` arrive in the REQUEST BODY — i.e. they are attacker-
// controlled. Both are fetched with `Authorization: Key <your fal API key>`.
// Without this check, anyone who can reach the endpoint can post
// `status_url: "https://their-server.example/"` and be handed the operator's
// fal credential directly. That is credential exfiltration via SSRF, and it is
// worse than ordinary SSRF precisely because we attach auth to the request.
//
// Validating the parsed hostname (never a `startsWith` on the raw string —
// `https://queue.fal.run.evil.tld/` and `https://evil.tld/?x=queue.fal.run`
// both defeat that) keeps the ticket usable only against fal itself.
const FAL_HOSTS = new Set(['queue.fal.run', 'fal.run', 'fal.media']);

function assertFalUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must be https`);
  }
  if (!FAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`${label} must point at fal.ai, not ${parsed.hostname}`);
  }
  return parsed.toString();
}

export async function poll(env, { status_url, response_url, key, budgetMs = 25000 }) {
  // Validate BEFORE the key is ever attached to a request.
  status_url = assertFalUrl(status_url, 'status_url');
  response_url = assertFalUrl(response_url, 'response_url');

  const auth = { 'Authorization': `Key ${key}` };
  const deadline = Date.now() + budgetMs;
  // Probe immediately, then every 3s until the budget is spent.
  for (;;) {
    // redirect: 'error' — a redirect response from an allowed fal host could
    // still point anywhere. Without this, a 3xx from queue.fal.run would be
    // followed automatically and fetch() would reattach the `Authorization:
    // Key <fal key>` header to whatever Location it names, handing the
    // operator's credential to a host that was never allowlist-checked. Fail
    // the fetch instead of following it — the SSRF host check above only
    // protects the URL we asked for, not one fal might redirect us to.
    const sres = await fetch(status_url, { headers: auth, redirect: 'error' });
    // An HTTP failure (401 bad key, 429 rate-limited, 5xx upstream) has no
    // `status` field in its body — reading `.status` off it silently yields
    // `undefined`, which falls through every branch below as if the job were
    // still queued, and the caller burns the entire poll budget retrying a
    // request that will never succeed. Fail fast instead: surface the real
    // HTTP status rather than masking it as "pending".
    if (!sres.ok) {
      throw new Error(`fal.ai status check failed: ${sres.status}`);
    }
    const status = (await sres.json().catch(() => ({}))).status;
    if (status === 'COMPLETED') {
      const rres = await fetch(response_url, { headers: auth, redirect: 'error' });
      if (!rres.ok) {
        throw new Error(`fal.ai response fetch failed: ${rres.status}`);
      }
      const data = await rres.json();
      const imageUrl = data.images?.[0]?.url
        || (data.images?.[0]?.b64_json ? `data:image/png;base64,${data.images[0].b64_json}` : null);
      if (!imageUrl) throw new Error('No image returned from fal.ai');
      return { done: true, image_url: imageUrl, seed: data.seed != null ? String(data.seed) : null };
    }
    if (status === 'FAILED' || status === 'ERROR') {
      throw new Error('fal.ai job failed during generation');
    }
    if (Date.now() >= deadline) return { done: false };
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// Convenience wrapper: submit + one bounded poll. Fast models (Seedream)
// typically finish inside the default budget and this returns a normal
// result. Slow models (gpt-image-2 + references, observed >100s) will not
// — this throws a `PendingError` carrying the ticket rather than blocking
// indefinitely, because HTTP edges (Cloudflare included) will kill a
// request that hangs that long anyway. Callers on a request/response edge
// should use `submit`/`poll` directly instead of this wrapper, so they can
// return the ticket to their own client and let it drive the poll loop.
export class PendingError extends Error {
  constructor(ticket) {
    super('fal.ai job still running after the poll budget — use submit()/poll() to implement a pending-ticket flow');
    this.name = 'PendingError';
    this.ticket = ticket;
  }
}

export async function generate(env, opts) {
  const ticket = await submit(env, opts);
  const polled = await poll(env, { ...ticket, key: opts.key, budgetMs: 25000 });
  if (!polled.done) {
    throw new PendingError(ticket);
  }
  return { image_url: polled.image_url, seed: polled.seed, mime_type: null };
}
