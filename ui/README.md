# solance-canvas / ui

A React image-generation UI: prompt, pick a model/aspect/style, attach up to
3 reference images, generate. `Canvas` is the generator; `CanvasSettings` is
its companion screen for browser-stored provider API keys and style
presets.

This package has no backend of its own — it's a client. Point it at your
API (see `worker/` in this repo for a reference implementation, or bring
your own that speaks the same three endpoints).

## Install

```
npm install <this-package>
```

Peer dependencies: `react` (18+). Nothing else — no router, no CSS
framework required at the JS level (see **Styling** below).

## Usage

```jsx
import { Canvas, CanvasSettings } from '<this-package>'

function App() {
  const [showSettings, setShowSettings] = useState(false)

  return showSettings ? (
    <CanvasSettings onBack={() => setShowSettings(false)} />
  ) : (
    <Canvas onOpenSettings={() => setShowSettings(true)} />
  )
}
```

Both components manage their own state internally (prompt, presets, form
fields) — drop them in and they work. `onOpenSettings` / `onBack` are the
only wiring you need to supply, and both are optional: omit them and the
corresponding nav control (a gear icon on `Canvas`, a "Back to the Canvas"
link on `CanvasSettings`) just doesn't render. There is no router
dependency — you decide how these two screens connect in your own app (a
route, a tab, a modal, whatever you're using).

### Props

**`<Canvas apiClient? onOpenSettings? />`**
| Prop | Type | Default | Purpose |
|---|---|---|---|
| `apiClient` | object from `createApiClient()` | `defaultApiClient` | Where/how requests are made. |
| `onOpenSettings` | `() => void` | — | Called when the settings icon is clicked. Icon hidden if omitted. |

**`<CanvasSettings onBack? />`**
| Prop | Type | Default | Purpose |
|---|---|---|---|
| `onBack` | `() => void` | — | Called when "Back to the Canvas" is clicked. Link hidden if omitted. |

`CanvasSettings` takes no `apiClient` — provider keys live entirely in this
browser's `localStorage` (see **Provider keys** below), so it has nothing to
fetch.

## The API client (`api.js`)

The UI never calls `fetch` directly — every request goes through a client
built by `createApiClient()`, so you can point the same component at any
backend and supply your own auth.

```js
import { createApiClient } from '<this-package>'

const apiClient = createApiClient({
  baseUrl: 'https://api.example.com',
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
})

<Canvas apiClient={apiClient} />
```

- **`baseUrl`** — no trailing slash. If you don't pass one, it reads the
  build-time env var `VITE_CANVAS_API_URL`, falling back to `/api` (handy
  behind a same-origin reverse proxy).
- **`headers`** — a plain object merged into every request, or an async
  function called before each request (for auth that needs to be computed
  fresh, like a token that refreshes). **This client has no auth scheme
  baked in** — no cookies, no bearer-token assumption, nothing. Bring
  your own via `headers`.
- **`fetchImpl`** — override `fetch` itself (tests, non-browser runtimes).

If you don't build a client at all, `Canvas`/`CanvasSettings` fall back to
`defaultApiClient`, a client with no auth headers pointed at
`VITE_CANVAS_API_URL` / `/api`.

The client exposes exactly the Worker's three routes:

| Method | Path | Client call |
|---|---|---|
| POST | `/generate` | `generate(payload, { headers })` |
| POST | `/generate/result` | `getGenerationResult(ticket, { headers })` |
| GET | `/image/:key` | `imageUrl(key)` — builds the URL, doesn't fetch it |

`generate` and `getGenerationResult` both take an optional second argument,
`{ headers }`, merged on top of the client's own headers for that one call
— `Canvas` uses this to attach a visitor's stored provider key. You don't
need to call these directly for normal use: `Canvas` drives them for you
through `runGeneration()` (see `generation.js`), which handles the
`pending`-ticket poll loop and re-sends the same headers on every tick.

## Provider keys

`CanvasSettings` includes a "Your API keys" card, one row per provider in
`imageProviders.js`. A key entered there:

- lives **only** in this browser's `localStorage`, under
  `solance_canvas_provider_keys` — never synced across devices, never sent
  anywhere except the configured Worker;
- is sent as an `X-Provider-Key` header on that one generate/poll request,
  read fresh each time from storage — the Worker uses it for that request
  only and never stores or logs it;
- is optional per provider. Leave it blank and the Worker falls back to
  its own env-configured key for that provider, if one is set.

`providerKeys.js` is the only module that can read a stored key's *value*
(`getProviderKey`, `readProviderKeys`). `CanvasSettings.jsx` deliberately
imports only the boolean-status read (`listProviderKeyStatus`) plus the
writers (`setProviderKey`, `removeProviderKey`) — so a stored key cannot
reach that screen's DOM, by construction.

## Styling

`Canvas` and `CanvasSettings` are styled with Tailwind utility classes plus
a set of CSS custom properties for color — no CSS file ships with this
package. Define these on your page (`:root` or a wrapping element) to get
the intended look:

```
--page, --page-dim, --page-faint, --page-muted
--ink, --ink-deep, --ink-raised
--rule-mid, --rule-dim, --rule-strong
--gold-soft, --gold-glow, --gold-text
--blue
--focus, --focus-offset
```

Fonts are referenced inline as `Cormorant Garamond`, `Söhne`, and
`JetBrains Mono` — load whichever fonts you like under those family names,
or override the classes. Without these variables/fonts defined the
components still render and function; they just fall back to browser
defaults for color and font.

## `imageStorage.js`

`isStoredImageKey(value)` distinguishes a Worker-stored object key
(`<uuid>.<ext>`, resolved to a URL via the api client's `imageUrl()` and
served by `GET /image/:key`) from a legacy `data:` or `https:` value
(rendered directly). If your backend stores images differently, keep this
predicate in sync with whatever guard your image-serve route uses to
accept a key — see the comments in the file.

## Local storage

Style presets persist to `localStorage` under `hos_canvas_styles`, with a
read-fallback to a legacy key (`hos_generator_styles`) — see the comment
in `stylePresets.js` before renaming either key; a blind rename there has
silently destroyed a user's saved presets before. Provider keys persist
separately under `solance_canvas_provider_keys` (see **Provider keys**
above).
