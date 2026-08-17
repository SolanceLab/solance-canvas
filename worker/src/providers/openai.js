// ── OpenAI (gpt-image-*) ─────────────────────────────────────────────

export const id = 'openai';
export const label = 'OpenAI';
// NOTE: the source this was carved from never resolved an OpenAI key from
// env — only from a stored-key table this repo deliberately does not carry
// over (see the top-level extraction notes). OPENAI_API_KEY is the
// conventional name for this API and matches the pattern the other
// providers use here, but it's an addition, not a carried-over fact.
export const envKeys = ['OPENAI_API_KEY'];

// Map resolution/aspect to an OpenAI gpt-image size string.
function openaiSize(resolution, aspect) {
  // Accept an explicit WxH resolution if it looks valid.
  if (resolution && /^\d+x\d+$/.test(resolution)) return resolution;
  const map = {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '4:3': '1536x1024',
    '9:16': '1024x1536',
    '3:4': '1024x1536',
  };
  return map[aspect] || '1024x1024';
}

// gpt-image models accept up to 16 reference images, but on a DIFFERENT
// endpoint (`/images/edits`) with a different encoding (multipart, one
// repeated `image[]` part per reference) — so references can't simply be
// added to the generations body.
const MAX_REFERENCES = 16;

// A reference must become actual file bytes for the multipart upload. Only
// data-URL/base64 input is accepted: fetching an arbitrary caller-supplied
// http(s) URL server-side would hand this Worker to anyone as an SSRF proxy.
// Fetch remote references in your own client and pass the bytes.
function referenceToBlob(reference) {
  const value = String(reference || '');
  if (/^https?:\/\//i.test(value)) {
    throw new Error('OpenAI references must be base64 or data-URL image data, not a remote URL — fetch it client-side and send the bytes.');
  }
  const match = value.match(/^data:(image\/\w+);base64,(.*)$/);
  const mime = match ? match[1] : 'image/png';
  const base64 = match ? match[2] : value;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function extensionFor(type) {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  return 'png';
}

export async function generate(env, { prompt, model, key, resolution, aspect, references }) {
  const refs = (references || []).filter(Boolean).slice(0, MAX_REFERENCES);

  if (refs.length > 0) {
    return editWithReferences({ prompt, model, key, resolution, aspect, refs });
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size: openaiSize(resolution, aspect),
      n: 1,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI API error: ${response.status}`);
  }

  // gpt-image-* models always return base64 (no url).
  const b64 = data.data?.[0]?.b64_json;
  const url = data.data?.[0]?.url;
  const imageUrl = b64 ? `data:image/png;base64,${b64}` : (url || null);
  if (!imageUrl) {
    throw new Error('No image returned from OpenAI');
  }
  return { image_url: imageUrl, seed: null, mime_type: 'image/png' };
}

// Reference path: POST /images/edits, multipart, one repeated `image[]` part
// per reference (the API's own documented shape — a mask, if you send one,
// applies to the FIRST image only; this layer sends no mask, which edits the
// whole frame). Response shape matches /generations: base64 in data[0].
async function editWithReferences({ prompt, model, key, resolution, aspect, refs }) {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('size', openaiSize(resolution, aspect));
  refs.forEach((reference, i) => {
    const blob = referenceToBlob(reference);
    form.append('image[]', blob, `reference-${i}.${extensionFor(blob.type)}`);
  });

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      // NOTE: do NOT set Content-Type — fetch sets the multipart boundary.
    },
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI API error: ${response.status}`);
  }

  const b64 = data.data?.[0]?.b64_json;
  const url = data.data?.[0]?.url;
  const imageUrl = b64 ? `data:image/png;base64,${b64}` : (url || null);
  if (!imageUrl) {
    throw new Error('No image returned from OpenAI');
  }
  return { image_url: imageUrl, seed: null, mime_type: 'image/png' };
}
