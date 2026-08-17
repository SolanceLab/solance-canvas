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

// NOTE: the source this was carved from carries a TODO claiming "Grok
// Imagine supports up to 3 refs — only first used currently," but the
// actual request body never sends `references` at all — txt2img only.
// Kept faithful to the real behavior rather than the stale comment;
// wiring references through is the TODO this file inherits.
export async function generate(env, { prompt, model, key }) {
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
