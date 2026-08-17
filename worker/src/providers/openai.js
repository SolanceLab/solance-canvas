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

// TODO: gpt-image-2 supports up to 16 reference images (accessible via
// fal's `<model>/edit` route — see fal.js). This direct-to-OpenAI path
// does not send references at all; it is txt2img only. Kept faithful to
// source rather than inventing an edit request shape here.
export async function generate(env, { prompt, model, key, resolution, aspect, references }) {
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
