// ── Stability AI ──────────────────────────────────────────────────────

export const id = 'stability';
export const label = 'Stability AI';
// NOTE: same caveat as openai.js — the source never resolved a Stability
// key from env, only from a stored-key table this repo does not carry
// over. STABILITY_API_KEY follows the naming convention of the other
// providers here but is an addition, not a carried-over fact.
export const envKeys = ['STABILITY_API_KEY'];

// Map an aspect ratio to a Stability-supported aspect_ratio value.
function stabilityAspect(aspect) {
  const allowed = ['16:9', '1:1', '21:9', '2:3', '3:2', '4:5', '5:4', '9:16', '9:21'];
  if (aspect && allowed.includes(aspect)) return aspect;
  if (aspect === '4:3') return '3:2';
  if (aspect === '3:4') return '2:3';
  return '1:1';
}

// TODO verify: v2beta/stable-image/generate/sd3 path is documented as
// multipart/form-data with Accept: application/json returning
// { image: <base64>, seed, finish_reason }. Carried across unverified
// against a live call — confirm field names before relying on this in
// production and update this comment once you have.
export async function generate(env, { prompt, model, key, aspect }) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('model', model);
  form.append('aspect_ratio', stabilityAspect(aspect));
  form.append('output_format', 'png');
  form.append('mode', 'text-to-image');

  const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Accept': 'application/json',
      // NOTE: do NOT set Content-Type; fetch sets the multipart boundary.
    },
    body: form,
  });

  if (!response.ok) {
    let msg = `Stability API error: ${response.status}`;
    try {
      const errData = await response.json();
      msg = errData.errors?.join('; ') || errData.message || msg;
    } catch (_) { /* non-json error body */ }
    throw new Error(msg);
  }

  const data = await response.json();
  const b64 = data.image;
  if (!b64) {
    throw new Error('No image returned from Stability');
  }
  return {
    image_url: `data:image/png;base64,${b64}`,
    seed: data.seed != null ? String(data.seed) : null,
    mime_type: 'image/png',
  };
}
