// ── xAI Grok (Grok Imagine) ──────────────────────────────────────────
// Serves BOTH the `grok` and `grok-image` provider ids — xAI has shipped
// this under both names at different times, so both route here.
//
// IMPORTANT — the URL xAI hands back is TEMPORARY. It lives at
// imgen.x.ai/.../xai-tmp-imgen-… and has been observed to 404 within
// about 48 hours of generation. If your caller needs the image to
// survive, download and persist the bytes yourself immediately — do not
// store this URL as if it were permanent. (Measured, not theorised: a
// Grok image generated one day returned HTTP 404 two days later while
// everything else about the request looked identical.)

export const id = 'grok';
export const label = 'xAI Grok';
export const envKeys = ['XAI_API_KEY'];
export const aliases = ['grok-image'];

// Reference images go to a DIFFERENT endpoint (`/images/edits`), so they
// cannot simply be added to the generations body. xAI takes them as JSON —
// `image` for a single reference, `images[]` for several — and each one is
// either a public URL or a base64 data URL, so no multipart and no
// server-side fetching is involved.
//
// Aspect ratios xAI accepts directly; anything else becomes `auto`.
const EDIT_ASPECTS = new Set(['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2']);

function editAspect(aspect) {
  return EDIT_ASPECTS.has(aspect) ? aspect : 'auto';
}

// xAI's resolution tiers are lowercase — '1k' / '2k'.
function editResolution(longEdge) {
  return Number(longEdge) >= 2048 ? '2k' : '1k';
}

// The edit path asks for `b64_json` rather than a URL on purpose: it returns
// the bytes directly, which sidesteps the 48-hour URL expiry described at the
// top of this file entirely.
async function editWithReferences({ prompt, model, key, aspect, longEdge, refs }) {
  const body = {
    model,
    prompt,
    aspect_ratio: editAspect(aspect),
    resolution: editResolution(longEdge),
    response_format: 'b64_json',
  };
  // `image` and `images` are mutually exclusive in xAI's schema. With several
  // references the prompt can address them as <IMAGE_0>, <IMAGE_1>, …
  if (refs.length === 1) {
    body.image = { url: refs[0] };
  } else {
    body.images = refs.map((url) => ({ url }));
  }

  const response = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.error || `xAI API error: ${response.status}`);
  }

  const first = data.data?.[0] || {};
  const mime = first.mime_type || 'image/png';
  const imageUrl = first.b64_json ? `data:${mime};base64,${first.b64_json}` : (first.url || null);
  if (!imageUrl) {
    throw new Error('No image returned from Grok');
  }
  return { image_url: imageUrl, seed: null, mime_type: mime };
}

export async function generate(env, { prompt, model, key, aspect, longEdge, references }) {
  const refs = (references || []).filter(Boolean);
  if (refs.length > 0) {
    return editWithReferences({ prompt, model, key, aspect, longEdge, refs });
  }

  const response = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ model, prompt, n: 1 }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `xAI API error: ${response.status}`);
  }

  const imageUrl = data.data?.[0]?.url || (data.data?.[0]?.b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : null);
  if (!imageUrl) {
    throw new Error('No image returned from Grok');
  }
  return { image_url: imageUrl, seed: null, mime_type: 'image/png' };
}
