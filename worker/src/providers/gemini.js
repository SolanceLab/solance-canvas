// ── Google Gemini ────────────────────────────────────────────────────
// generateContent with inline image parts. Full multi-reference support:
// each reference becomes its own inlineData part, with the text prompt
// added last so the model reads "here are the images, now do this".

import { parseReference } from './shared.js';

export const id = 'gemini';
export const label = 'Google Gemini';
export const envKeys = ['GEMINI_API_KEY', 'GOOGLE_API_KEY'];

export async function generate(env, { prompt, model, key, references }) {
  const contents = [];
  for (const r of (references || [])) {
    const ref = parseReference(r);
    if (ref) contents.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
  }
  contents.push({ text: prompt });

  // The key goes in a HEADER, not the query string. Google accepts both, but a
  // URL travels further than a header does: it turns up in proxy logs, trace
  // spans, error messages built from the request, and anything that records an
  // outbound subrequest. A header is far less likely to be retained anywhere.
  // (The original private implementation used `?key=` — this is a deliberate
  // hardening change, not a faithful carry-over.)
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: contents }],
        generationConfig: { temperature: 1, topP: 0.95, topK: 40, maxOutputTokens: 8192 },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini API error: ${response.status}`);
  }

  const candidates = data.candidates || [];
  if (candidates.length === 0) {
    throw new Error('No candidates returned from Gemini');
  }

  for (const part of (candidates[0]?.content?.parts || [])) {
    if (part.inlineData) {
      return {
        image_url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        seed: null,
        mime_type: part.inlineData.mimeType,
      };
    }
  }

  const text = candidates[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') || '';
  throw new Error(`Gemini returned text only (no image). Model '${model}' may not support image generation. Response: ${text.slice(0, 200)}`);
}
