// ── Provider registry ────────────────────────────────────────────────
// Every provider module exports the same small contract:
//
//   export const id;                    // provider id used in the request body
//   export const label;                 // human name
//   export const envKeys;               // env vars checked, in order
//   export async function generate(env, { prompt, model, key, references, aspect, resolution, longEdge })
//     -> { image_url, seed, mime_type }  // seed/mime_type may be null
//
// fal.js additionally exports submit(env, opts) and poll(env, opts) for its
// async-queue / pending-ticket flow — see the comment at the top of that
// file before collapsing it back into a single call.
//
// grok.js serves both the `grok` and `grok-image` ids via `aliases`.

import * as gemini from './gemini.js';
import * as grok from './grok.js';
import * as fal from './fal.js';
import * as openai from './openai.js';
import * as stability from './stability.js';
import * as agnes from './agnes.js';
import * as venice from './venice.js';

const modules = [gemini, grok, fal, openai, stability, agnes, venice];

// Maps every provider id — including aliases like `grok-image` — to its
// module.
export const providers = {};
for (const mod of modules) {
  providers[mod.id] = mod;
  for (const alias of (mod.aliases || [])) {
    providers[alias] = mod;
  }
}

// Resolve the API key for a provider from environment variables only.
// There is no stored-key lookup and no database here by design — bring
// your own key storage upstream of this module if you need one; this
// registry only knows how to read env vars.
//
// Returns the first non-empty value from the provider's envKeys, in
// order, or throws a clear Error naming the provider and the env vars it
// checked.
export function resolveKey(env, provider) {
  const mod = providers[provider];
  if (!mod) {
    throw new Error(`Unknown provider '${provider}'. Known providers: ${Object.keys(providers).join(', ')}`);
  }
  for (const envKey of mod.envKeys) {
    const value = env?.[envKey];
    if (value) return value;
  }
  throw new Error(`No API key available for provider '${mod.label}' (${mod.id}). Set one of: ${mod.envKeys.join(', ')}.`);
}
