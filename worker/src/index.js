// solance-canvas — multi-provider image-generation Worker.
//
// Four routes:
//   POST    /generate         generate an image (may return a `pending`
//                              ticket for slow/async providers)
//   POST    /generate/result  poll a `pending` ticket to completion
//   GET     /image/:key       serve back an image this Worker stored
//   OPTIONS *                 CORS preflight
//
// This file is deliberately thin: it validates the request, resolves a
// provider + key, dispatches to the provider module, and hands the result
// through the storage adapter. All provider-specific HTTP is in
// ./providers/**; all storage-specific logic is in ./storage.js.
import { jsonResponse, handleOptions, withCors, isOriginAllowed } from './http.js';
import { createR2Storage, createNullStorage, isStoredImageKey } from './storage.js';
import { providers, resolveKey } from './providers/index.js';

// Accept only the three resolution tiers the reference UI offers (1K/2K/4K);
// any other value (missing, malformed, out of range) falls back to the 2K
// default so callers that never send longEdge get a sane result.
function normalizeLongEdge(longEdge) {
  const n = Number(longEdge);
  return (n === 1024 || n === 2048 || n === 4096) ? n : 2048;
}

function selectStorage(env) {
  return env.IMAGE_BUCKET ? createR2Storage(env.IMAGE_BUCKET) : createNullStorage();
}

// ── Optional operator auth gate ─────────────────────────────────────
// This Worker has no auth by default (see README/http.js) — CORS alone only
// stops *browsers*, not curl or a script, from spending the operator's
// provider credits. When AUTH_TOKEN is set, POST /generate and
// POST /generate/result require it as a bearer token; when it is unset,
// behavior is unchanged (the documented dev/private default). GET /image/:key
// stays public either way — it only serves back images this Worker already
// generated, keyed by an unguessable UUID.
// Plain `===` short-circuits on the first differing byte, which leaks the
// length of a correct prefix through response timing. Looping to
// `Math.max(a.length, b.length)` fixes the short-circuit but NOT the leak:
// wall-clock time still scales with the length of the longer string — i.e.
// the caller-supplied token — so token length stays observable via timing,
// and plain JS/JIT execution gives no hard constant-time guarantee either
// way. Hash both inputs to fixed-length digests first (SHA-256 via
// crypto.subtle, available on Workers) and compare those: digest length is
// constant regardless of input length, so no length signal survives into
// the comparison loop, and the comparison itself is bytewise over a fixed
// 32-byte buffer.
async function sha256(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

async function timingSafeEqual(a, b) {
  const [da, db] = await Promise.all([sha256(a), sha256(b)]);
  // da/db are both 32 bytes (SHA-256) regardless of a/b's length — the loop
  // bound below is now a constant, not a function of caller input.
  let diff = 0;
  for (let i = 0; i < da.length; i++) {
    diff |= da[i] ^ db[i];
  }
  return diff === 0;
}

async function checkAuthToken(request, env) {
  const expected = (env && env.AUTH_TOKEN) || '';
  if (!expected) return true; // gate disabled — unset AUTH_TOKEN is the documented open default
  const header = request.headers.get('Authorization') || '';
  // RFC 9110: auth schemes are case-insensitive, and whitespace between
  // scheme and credentials may be more than a single space.
  const match = header.match(/^\s*bearer\s+(\S+)\s*$/i);
  if (!match) return false;
  return timingSafeEqual(match[1], expected);
}

// Provider errors are surfaced to the caller because they are genuinely the
// most useful thing we have ("model not found", "quota exceeded"). But some of
// those messages are built from a request URL, and at least one provider
// (Gemini) takes its API key as a QUERY PARAMETER — so an error string can
// carry the operator's credential straight into an HTTP response body or a log
// aggregator. We know the exact key value here, so redact it by value rather
// than trying to pattern-match what a secret looks like.
function safeMessage(err, key) {
  const msg = (err && err.message) ? String(err.message) : 'Unknown error';
  if (!key) return msg;
  return msg.split(key).join('[redacted]');
}

// A storage failure never drops the image (see storage.js) — it just means
// the response carries the provider's own value instead of our key. These
// fields tell the caller which happened without forcing them to care.
function describeStorageResult(storedKey, storage) {
  const persisted = !!storedKey;
  const persistError = persisted
    ? null
    : (storage.configured
        ? 'image storage failed; returning the provider value directly'
        : 'no storage bucket configured; returning the provider value directly');
  return { persisted, persistError };
}

async function handleGenerate(request, env, storage) {
  const started = Date.now();
  const body = await request.json();
  const { prompt, model, provider, aspect, resolution, style_prompt, reference, references, longEdge } = body;

  if (!prompt) {
    return jsonResponse({ error: 'Prompt is required' }, 400);
  }
  if (!provider) {
    const known = Object.keys(providers).map((p) => `"${p}"`).join(', ');
    return jsonResponse({ error: `provider is required (e.g. ${known})` }, 400);
  }
  if (!model) {
    return jsonResponse({ error: 'model is required (a real model id, e.g. "gemini-3.1-flash-image-preview")' }, 400);
  }

  const mod = providers[provider];
  if (!mod) {
    return jsonResponse({ error: `Provider '${provider}' not supported` }, 400);
  }

  // Normalize references: accept `references` array OR legacy single
  // `reference`. Cap at 3 (conservative — fits every provider comfortably).
  const refs = Array.isArray(references)
    ? references.filter(Boolean).slice(0, 3)
    : (reference ? [reference] : []);

  const normalizedLongEdge = normalizeLongEdge(longEdge);
  const fullPrompt = style_prompt ? `${prompt}\n\nStyle: ${style_prompt}` : prompt;

  // A visitor's own key is request-scoped: read from the header, used for
  // this one dispatch, never written to storage, never echoed, never
  // logged (safeMessage() below redacts the in-flight key by value from
  // provider error strings regardless of whether it came from the header
  // or from env).
  const userKey = (request.headers.get('X-Provider-Key') || '').trim();
  let key;
  if (userKey) {
    key = userKey;
  } else {
    try {
      key = await resolveKey(env, provider);
    } catch (err) {
      return jsonResponse({ error: `${err.message} Or send your own key in the X-Provider-Key request header — it is used for this request only and never stored.` }, 400);
    }
  }

  const genOpts = { prompt: fullPrompt, model, key, references: refs, aspect, resolution, longEdge: normalizedLongEdge };

  let result;
  try {
    if (typeof mod.submit === 'function' && typeof mod.poll === 'function') {
      // Async-queue provider (fal): submit, then poll briefly inline. Fast
      // models finish here and return in one shot; slow ones (e.g. an
      // image-edit model with references) return a `pending` ticket the
      // client polls via POST /generate/result rather than holding the
      // connection open past the platform's edge timeout.
      const ticket = await mod.submit(env, genOpts);
      const polled = await mod.poll(env, { ...ticket, key, budgetMs: 25000 });
      if (!polled.done) {
        return jsonResponse({
          pending: true,
          request_id: ticket.request_id,
          status_url: ticket.status_url,
          response_url: ticket.response_url,
          provider,
          model,
          prompt,
          style_prompt: style_prompt || null,
          resolution: resolution || null,
        }, 200);
      }
      result = { image_url: polled.image_url, seed: polled.seed };
    } else {
      result = await mod.generate(env, genOpts);
    }
  } catch (err) {
    // Log without the key too — Worker logs are a disclosure surface.
    console.error('Generation error:', safeMessage(err, key));
    return jsonResponse({ error: safeMessage(err, key) }, 500);
  }

  const durationMs = Date.now() - started;

  // Take ownership of the bytes (see storage.js for why this exists).
  const storedKey = await storage.store(result.image_url);
  const storedImageUrl = storedKey || result.image_url;
  const { persisted, persistError } = describeStorageResult(storedKey, storage);

  return jsonResponse({
    prompt,
    model,
    provider,
    style_prompt: style_prompt || null,
    image_url: storedImageUrl,
    seed: result.seed || null,
    resolution: resolution || null,
    duration_ms: durationMs,
    persisted,
    persist_error: persistError,
    image_stored: !!storedKey,
  }, 200);
}

async function handleGenerateResult(request, env, storage) {
  const body = await request.json();
  const { provider, status_url, response_url, model, prompt, style_prompt, resolution } = body;

  if (provider !== 'fal') {
    return jsonResponse({ error: 'generate/result currently supports provider "fal" only' }, 400);
  }
  if (!status_url || !response_url) {
    return jsonResponse({ error: 'status_url and response_url are required (from the pending ticket)' }, 400);
  }

  const mod = providers.fal;
  if (!mod || typeof mod.poll !== 'function') {
    return jsonResponse({ error: 'fal provider is not available' }, 500);
  }

  // Same request-scoped key handling as handleGenerate — the client re-sends
  // this header on every poll tick because the pending ticket (status_url/
  // response_url) deliberately never carries the key.
  const userKey = (request.headers.get('X-Provider-Key') || '').trim();
  let key;
  if (userKey) {
    key = userKey;
  } else {
    try {
      key = await resolveKey(env, provider);
    } catch (err) {
      return jsonResponse({ error: `${err.message} Or send your own key in the X-Provider-Key request header — it is used for this request only and never stored.` }, 400);
    }
  }

  let polled;
  try {
    // Short budget — this is one tick of a client-driven poll loop.
    polled = await mod.poll(env, { status_url, response_url, key, budgetMs: 15000 });
  } catch (err) {
    console.error('Generation result error:', safeMessage(err, key));
    return jsonResponse({ error: safeMessage(err, key) }, 500);
  }

  if (!polled.done) {
    return jsonResponse({ pending: true, provider, status_url, response_url, model, prompt, style_prompt, resolution }, 200);
  }

  // Take ownership of the bytes here too. This is the slow/async path —
  // exactly where a provider's temporary URL is most likely to be handed to
  // a caller that stores it for later and finds it 404ing days after. Do
  // not skip this just because the immediate /generate path already has it.
  const storedKey = await storage.store(polled.image_url);
  const storedImageUrl = storedKey || polled.image_url;
  const { persisted, persistError } = describeStorageResult(storedKey, storage);

  return jsonResponse({
    prompt,
    model,
    provider,
    style_prompt: style_prompt || null,
    image_url: storedImageUrl,
    seed: polled.seed || null,
    resolution: resolution || null,
    persisted,
    persist_error: persistError,
    image_stored: !!storedKey,
  }, 200);
}

// Serve an image this Worker stored. `key` MUST be validated with
// isStoredImageKey before it is ever used as a bucket lookup — that check is
// the entire path-traversal guard (the key format is a full match on a
// single `<uuid>.<ext>` segment, so nothing containing `/` or `..` can ever
// pass it), so do not bypass or loosen it.
async function handleImageGet(key, storage) {
  if (!storage.configured) {
    return new Response('image storage is not configured', { status: 500 });
  }
  if (!isStoredImageKey(key)) {
    return new Response('not found', { status: 404 });
  }
  const obj = await storage.get(key);
  if (!obj) {
    return new Response('not found', { status: 404 });
  }

  const headers = new Headers();
  headers.set('content-type', obj.httpMetadata?.contentType || 'application/octet-stream');
  // Upload content-type is provider-supplied and not magic-byte checked, so
  // tell the browser never to MIME-sniff these bytes into an executable type.
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cache-control', 'private, max-age=3600');
  if (obj.httpEtag) headers.set('etag', obj.httpEtag);
  return new Response(obj.body, { headers });
}

// Route to a plain Response; CORS is added once, on the way out, by withCors().
// Keeping it in exactly one place means a new route cannot forget the headers.
async function route(request, env) {
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  // Reject a disallowed cross-origin browser request BEFORE it reaches a
  // handler. CORS response headers alone only stop a browser from reading
  // the response — a "simple request" (no preflight) still executes, still
  // spends the operator's provider credits. This check closes that gap for
  // every route when ALLOWED_ORIGIN is configured to a specific list; see
  // http.js for the full reasoning. A no-Origin request (curl, server-to-
  // server) is unaffected — AUTH_TOKEN is the tool for that door.
  if (!isOriginAllowed(request, env)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403);
  }

  const url = new URL(request.url);
  const storage = selectStorage(env);

  try {
    if (request.method === 'POST' && url.pathname === '/generate') {
      if (!(await checkAuthToken(request, env))) {
        return jsonResponse({ error: 'Unauthorized — send Authorization: Bearer <AUTH_TOKEN>' }, 401);
      }
      return await handleGenerate(request, env, storage);
    }
    if (request.method === 'POST' && url.pathname === '/generate/result') {
      if (!(await checkAuthToken(request, env))) {
        return jsonResponse({ error: 'Unauthorized — send Authorization: Bearer <AUTH_TOKEN>' }, 401);
      }
      return await handleGenerateResult(request, env, storage);
    }
    const imageMatch = request.method === 'GET' && url.pathname.match(/^\/image\/([^/]+)$/);
    if (imageMatch) {
      return await handleImageGet(decodeURIComponent(imageMatch[1]), storage);
    }
  } catch (err) {
    console.error('Unhandled error:', err);
    // Deliberately does NOT echo err.message — a provider error can carry a
    // request URL, and one provider takes its API key as a query parameter.
    return jsonResponse({ error: 'Internal error' }, 500);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    return withCors(await route(request, env), request, env);
  },
};
