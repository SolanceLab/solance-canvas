// Pluggable storage adapter for generated images.
//
// WHY THIS EXISTS
//
// Image-generation providers hand a finished render back in one of two
// shapes: base64 embedded directly in the response, or a URL pointing at
// storage THEY control. Passing either straight through to the caller (or
// asking a caller to persist it as-is) breaks in two distinct ways, both
// observed in production rather than theorised:
//
//   1. A provider URL is a link to someone else's disk, on someone else's
//      retention policy. One provider's image URLs are explicitly marked
//      temporary in the URL itself (a `-tmp-` path segment) — a render that
//      worked fine at generation time came back HTTP 404 within 48 hours.
//      The caller has no way to know the link is about to rot until it
//      already has.
//
//   2. A base64 data URL is self-contained, but it is enormous — a 4K
//      render's data URL runs to roughly 30MB of text. Any caller that
//      tries to put that straight into a database column (or anything else
//      with a practical row/field size ceiling) will have the write
//      silently rejected, and the image is gone the moment the response
//      leaves memory — unless the caller explicitly checks for that
//      failure, which is easy to forget because the HTTP response itself
//      still looks like a success.
//
// The fix for both is the same: take ownership of the BYTES once, up front,
// by downloading/decoding them into a bucket this Worker controls, and hand
// back a small opaque key instead of a fragile URL or an oversized blob.
//
// `createR2Storage` is the reference implementation of that idea against
// Cloudflare R2. `createNullStorage` is the default when no bucket is
// bound — every /generate response still works, it just carries the
// provider's own (possibly temporary, possibly huge) value through
// unchanged, and callers are told exactly that via the `image_stored` flag
// in the response.
//
// DEGRADE, NEVER DROP: any storage failure — a decode error, a failed
// fetch, a bucket write failure, an oversize image — falls back to
// returning the provider's original value rather than losing the image.
// The image was already generated (that's the expensive, irreversible
// part); a storage hiccup on top of it should never turn into a lost
// render. Callers that ignore the storage fields entirely still get their
// image back.

// Extensions we know how to store, keyed by content-type.
const STORED_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// A stored key is a flat `<uuid>.<ext>` — a single path segment, unguessable,
// and (crucially) not open to path traversal: the regex is a full match
// against one segment, so a key can never contain `/` or `..`. Both the
// storage adapter and the image-serving route depend on this exact rule —
// keep it a single source of truth.
const STORED_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/i;

// Ceiling for what this Worker will pull into memory and write to R2.
// Generous on purpose — this is our own already-generated output, and a 4K
// render is the whole reason this adapter exists, not something to be
// stingy about.
const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB

// True when `value` is one of OUR stored object keys, as opposed to a
// legacy/passthrough `data:` URL or a provider's `https:` URL. Use this to
// decide how to render an `image_url` you got back from /generate: a stored
// key must be fetched via GET /image/:key; anything else can be used
// directly.
export function isStoredImageKey(value) {
  return typeof value === 'string' && STORED_KEY_RE.test(value);
}

function extFromContentType(contentType) {
  return STORED_EXT[contentType] || null;
}

// R2-backed storage adapter — the reference implementation.
//
// `bucket` is an R2Bucket binding (see wrangler.toml.example for how to
// wire one up).
export function createR2Storage(bucket) {
  return {
    configured: true,

    // Take a provider's `image_url` (a `data:` URL or an `https:` URL) and
    // persist the bytes under a flat `<uuid>.<ext>` key. Returns the key, or
    // null if the value could not be stored. Callers MUST fall back to the
    // original value on null rather than dropping the image.
    async store(imageUrl) {
      if (typeof imageUrl !== 'string' || !imageUrl) return null;

      let bytes = null;
      let contentType = 'image/png';

      try {
        const dataMatch = /^data:([\w/+.-]+);base64,(.*)$/s.exec(imageUrl);
        if (dataMatch) {
          contentType = dataMatch[1];
          const bin = atob(dataMatch[2]);
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } else if (/^https?:\/\//i.test(imageUrl)) {
          const res = await fetch(imageUrl);
          if (!res.ok) return null;
          contentType = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
          bytes = new Uint8Array(await res.arrayBuffer());
        } else {
          return null; // already a stored key, or something we don't recognise
        }
      } catch (e) {
        console.error('storage: could not read image bytes:', e.message);
        return null;
      }

      if (!bytes || bytes.byteLength === 0) return null;
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        console.error(`storage: ${bytes.byteLength} bytes exceeds the ${MAX_IMAGE_BYTES}-byte ceiling`);
        return null;
      }

      const ext = extFromContentType(contentType) || 'png';
      const key = `${crypto.randomUUID()}.${ext}`;
      try {
        await bucket.put(key, bytes, { httpMetadata: { contentType } });
      } catch (e) {
        console.error('storage: R2 put failed:', e.message);
        return null;
      }
      return key;
    },

    // Stream a stored object back out (an R2Object, or null if missing/
    // malformed). Callers should still run `key` through isStoredImageKey()
    // themselves before trusting it as a path segment — this is belt and
    // braces, not a substitute for that guard.
    async get(key) {
      if (!isStoredImageKey(key)) return null;
      return bucket.get(key);
    },
  };
}

// No-op adapter — the default when no bucket is bound. `store` always
// returns null, so callers fall back to the provider's own value (a data:
// URL or the provider's URL) and the /generate response reports
// `image_stored: false` so nothing silently pretends otherwise.
export function createNullStorage() {
  return {
    configured: false,
    async store() { return null; },
    async get() { return null; },
  };
}

// Pick a storage adapter based on what's bound in `env`. `bucketName`
// defaults to the binding name used in wrangler.toml.example — pass a
// different name if you bind the bucket under something else.
export function selectStorage(env, bucketName = 'IMAGE_BUCKET') {
  const bucket = env[bucketName];
  return bucket ? createR2Storage(bucket) : createNullStorage();
}
