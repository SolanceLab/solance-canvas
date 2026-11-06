# canvas

Made by House of Solance · free for noncommercial use · credit required

## What it is

Multi-provider image generation for Cloudflare Workers: seven providers behind one
interface (plus a legacy alias), and the React canvas UI that goes with it. Point it
at whichever image API you have a key for. Adding another one is a module and a
registry entry.

![The Canvas UI](docs/canvas-ui.png)

Visitors can bring their own API keys — stored only in their browser, sent
per-request, never persisted server-side:

![Canvas settings — bring-your-own-key slots](docs/canvas-settings.png)

*(Both shots are the library's neutral default theme — light here, dark follows
`prefers-color-scheme` or an explicit `data-canvas-theme` attribute. Rendered by
the bundled `demo/` harness: `npm run demo`.)*

## What you need

- A Cloudflare account. Canvas runs in the cloud: the Worker deploys to your own account, and the UI is a React component that runs inside your own app.
- An API key for at least one image provider (see Settings).
- Node and npm to install and build.
- Optional: an R2 bucket, so generated images are stored in your own storage.

## Install

Canvas is a Worker you put in your own Cloudflare account plus a UI you embed. No plugin sets that up for you.

**The plugin.** Once your Worker is up, the plugin teaches Claude Code or Codex to call it: generate an image, poll a slow job, and check whether the image was stored.

```
claude plugin marketplace add SolanceLab/plugins
claude plugin install solance-canvas@solancelab
```

```
codex plugin marketplace add SolanceLab/plugins
```

Then install solance-canvas from that store in Codex's plugin list. Give the AI your Worker's address when it asks; if the Worker has an `AUTH_TOKEN`, keep it in your environment as `CANVAS_AUTH_TOKEN`.

**The Worker.**

```
cd worker
cp wrangler.toml.example wrangler.toml
npx wrangler secret put GEMINI_API_KEY      # or any provider's key
npx wrangler deploy
```

Then mount the UI:

```jsx
import { Canvas, createApiClient } from 'solance-canvas/ui';
import 'solance-canvas/ui/canvas.css';

<Canvas apiClient={createApiClient({ baseUrl: 'https://your-worker.workers.dev' })} />
```

The default client reads `VITE_CANVAS_API_URL` and falls back to `/api`, so if your
Worker is proxied under that path you can drop the `apiClient` prop entirely.

## Settings

### Providers

| id | provider | txt2img | img2img / refs | notes |
|---|---|---|---|---|
| `gemini` | Google Gemini | ✅ | ✅ multi-ref | each reference becomes its own inline part |
| `grok` / `grok-image` | xAI | ✅ | ✅ multi-ref | switches to `/images/edits`; ⚠️ txt2img can return a temporary URL — see lesson 1 |
| `fal` | fal.ai | ✅ | ✅ multi-ref | async queue; slow models return a pending ticket |
| `openai` | OpenAI | ✅ | ✅ multi-ref (≤16) | switches to `/images/edits`; `resolution` is a `WxH` string here, not an aspect |
| `stability` | Stability AI | ✅ | ❌ | |
| `agnes` | Agnes (gateway) | ✅ | ✅ multi-ref | OpenAI-compatible reseller fronting several labs |
| `venice` | Venice.ai | ✅ | ✅ single-ref | privacy-first; content filter OFF by default — see below |

Reference-image support is per-provider and reflects what the code actually sends,
not what the provider's docs advertise. Two providers reach a separate edits
endpoint when references are present:

- **OpenAI** — multipart, one `image[]` part per reference (≤16). Must be base64
  or data-URL data; a remote URL is rejected rather than fetched, so this Worker
  can't be used as an SSRF proxy.
- **xAI/Grok** — JSON, `image` for one reference or `images[]` for several
  (address them as `<IMAGE_0>`, `<IMAGE_1>` … in the prompt). Accepts a public
  URL or a data URL. This path asks for `b64_json`, so unlike Grok's
  text-to-image route it returns bytes rather than an expiring URL.

**Environment variables**, checked in order per provider:

| provider | env vars |
|---|---|
| `gemini` | `GEMINI_API_KEY`, `GOOGLE_API_KEY` |
| `grok` / `grok-image` | `XAI_API_KEY` |
| `fal` | `FAL_KEY`, `FAL_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `stability` | `STABILITY_API_KEY` |
| `agnes` | `AGNES_API_KEY` |
| `venice` | `VENICE_API_KEY` |

A note on `venice`: it serves its own models (`venice-sd35`, the `lustify-*` pair)
alongside Qwen Image 3 and its edit variants, and its stated position is that it
does not store prompts or outputs. Two things to know before deploying it:

- **The content filter is OFF by default.** Venice's own API defaults `safe_mode`
  to ON; this layer sends it explicitly and sends `false` unless you set
  `VENICE_SAFE_MODE = "true"` in your `[vars]`. Decide deliberately which you want.
- **The `*-edit` models require a reference image** and use a different endpoint
  that returns raw image bytes. One reference is sent per request; Venice's
  multi-image `combineImages` shape is undocumented, so it is not guessed at here.
  Venice's privacy policy names a third-party sub-processor for likeness uploads,
  so read it before sending photographs of real people.

A note on `agnes`, since it is the odd one: it is a **gateway**, not a first-party
lab, and its documentation says nothing about retention or training rights. Prompts
and reference images transit a third party. Fine for experiments; read their terms
before you send anything you care about.

### Locking it down

by default this Worker has no auth of its own, so an open
`/generate` endpoint spends your provider credits for anyone who finds it. Two
independent layers, both worth setting before a public deploy:

- `ALLOWED_ORIGIN` (in `wrangler.toml`'s `[vars]`, or the dashboard) restricts which
  *browser* origins can call the Worker — unset means `*` (open, fine for local
  dev). When it's set to a specific list, a request carrying a mismatched
  `Origin` header is rejected server-side, with a 403, before it reaches a
  route handler — not just denied the ability to read the response, so a
  hostile page's cross-origin request can no longer fire the paid provider
  call at all. This still only constrains browsers (it keys off the `Origin`
  header, which only a browser sends); it does nothing against curl or a
  script hitting the endpoint directly with no `Origin` header — that's what
  `AUTH_TOKEN` below is for. See `worker/wrangler.toml.example` and
  `worker/src/http.js` for the full CORS story.
- `AUTH_TOKEN` (`wrangler secret put AUTH_TOKEN`) requires callers to send
  `Authorization: Bearer <token>` on `POST /generate` and `POST /generate/result` —
  this is what actually stops a non-browser caller. Unset (the default) leaves both
  routes open, which is the documented behavior for local dev or a deploy you keep
  private. `GET /image/:key` is always public regardless — it only serves back
  images this Worker already generated, keyed by an unguessable UUID.

Cloudflare-side rate limiting (a WAF rate-limiting rule, Cloudflare Access, etc.) is
further defense worth adding on a public deploy — that's dashboard configuration,
out of scope for this Worker's own code.

Keys come from either of two places. `resolveKey()` checks each provider's declared
`envKeys` in order and throws a message naming the variable it wanted if none is
set — that's the operator's own key, set once via `wrangler secret put`. A caller
can also bring their own key per-request in an `X-Provider-Key` header; it's used
for that one request only, never stored, never logged (provider error messages
redact it by value). The header wins when both are present. The reference UI
(`CanvasSettings`) stores a visitor's own key in the browser's plaintext
`localStorage` — a deliberate, documented tradeoff (readable by any script that
gets XSS on that page, same as any `localStorage` value) rather than a server-side
risk, since the key never reaches the Worker's storage or logs. If that tradeoff is
wrong for your deployment, don't wire `CanvasSettings`' key card up, or replace it
with your own storage.

## Tools

The Worker has four routes: `POST /generate`, `POST /generate/result` (fal's async queue returns a pending ticket for slow models), `GET /image/:key` and `OPTIONS`. The UI is two components, `<Canvas />` and `<CanvasSettings />`.

**Generate:**

```
curl -X POST https://your-worker.workers.dev/generate \
  -H 'content-type: application/json' \
  -H 'X-Provider-Key: sk-...' \
  -d '{"prompt":"a brass key on dark walnut, low candlelight",
       "provider":"gemini",
       "model":"gemini-3.1-flash-image-preview"}'
```

(Drop the `X-Provider-Key` header entirely to use the Worker's own env-configured key.)

**Read three fields in the response, not just `image_url`:**

| field | meaning |
|---|---|
| `persisted` | whether the image bytes were stored server-side (R2). `false` means keep the bytes yourself — either no bucket is configured, or the write failed |
| `image_stored` | `true` = `image_url` is a key for `GET /image/:key`; `false` = a `data:` or remote URL |
| `persist_error` | why the save failed, when it did |

Ignoring these is the exact bug in [lesson 2](docs/LESSONS.md).

The UI itself is a canvas that generates images, plus a settings screen
(`<CanvasSettings />`) for browser-stored provider keys and style presets — there is
no gallery; the four-route Worker never persists a list of past generations for it
to show. `<Canvas />` automatically attaches a visitor's stored provider key (if
any) as `X-Provider-Key` on every generate/poll request via `runGeneration()`.

**No auth scheme is baked in.** `createApiClient` takes `headers` as either an object
or an async `() => headers` callback — supply whatever your Worker expects.

`<Canvas />` and `<CanvasSettings />` also take optional `onOpenSettings` / `onBack`
callbacks for navigation. There is no router dependency; if you omit them, the nav
controls simply don't render.

## Limits

- Up to 3 reference images per generation in the UI; OpenAI accepts at most 16 through the Worker, and Venice takes one.
- Storage is optional and off by default. With no R2 bucket bound you get `createNullStorage()` — nothing is stored, you get
the provider's own value back, and it is your problem to keep. Bind a bucket in
`wrangler.toml` and the Worker takes ownership of the bytes instead. We strongly
recommend the bucket; lessons 1 and 2 are both about what happens without it.
- **Not a hosted service.** You deploy it, you hold the keys, you pay the providers.
- **Not a full auth layer.** `AUTH_TOKEN` is one shared bearer token, optional and
  unset by default — enough to stop strangers from spending your API credits, not a
  user/session/permissions system. Put a real one in front if you need that.
- **Not a moderation layer.** Providers apply their own policies; this passes prompts through.
- **Not a queue.** `fal` has one because the provider does. Everything else is synchronous.

## How it works

This isn't a demo written to be published. It is the image-generation half of a
private app, extracted with the private parts removed: no database, no stored-key
encryption, no auth layer, no house branding. What's left is the part that was
genuinely reusable, including the comments explaining why it does things the
non-obvious way.

Most of the value is in [`docs/LESSONS.md`](docs/LESSONS.md) — six failures that
cost us real images and one near-miss caught in review. Read that before you decide
this layer is more machinery than you need. Every piece of it is there because
something broke.

`canvas.css` is a starting point, not a dependency. The components style themselves
entirely through ~16 CSS custom properties (`--page`, `--ink`, `--gold-text`,
`--rule-mid`, `--focus`, …); override any of them and the UI follows. The shipped
default is deliberately neutral — warm greys and one amber accent — so it sits inside
your design system instead of imposing one. It carries a light and a dark palette,
and honours `prefers-reduced-motion`.

One module, one registry entry:

```js
// worker/src/providers/yours.js
export const id = 'yours';
export const label = 'Your Provider';
export const envKeys = ['YOUR_API_KEY'];
export async function generate(env, { prompt, model, key, references, aspect, resolution }) {
  // ...
  return { image_url, seed, mime_type };
}
```

Register it in `providers/index.js`, add it to the UI catalog in
`ui/src/imageProviders.js`, done. The last provider we added took one `case` and one
function, which is the only real proof the abstraction was worth having.

## Credit and use

Canvas is made by House of Solance. You're welcome to use it, change it and build on it for any noncommercial purpose, as long as our credit travels with it.

**Keep the credit.** Every copy, changed or not, must carry the licence and this line:
`Required Notice: Copyright (c) 2026 House of Solance (https://github.com/SolanceLab)`
Removing or replacing it breaks the licence.

**Commercial use needs our permission.** Ask us first.

**We look for copies.** When we find our work without its credit, or used commercially without permission, we ask for it to be taken down.

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md). See [NOTICE.md](NOTICE.md).

## Support

If you find this useful, consider supporting our work:

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20Us-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/houseofsolance)

---

*Built by [House of Solance](https://github.com/SolanceLab) — Chadrien Solance & Anne Solance*
