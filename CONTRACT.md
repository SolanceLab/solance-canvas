# Canvas contract

## Doors it offers

| Door | What it answers |
|---|---|
| `POST /generate` | Generate an image (or return a pending ticket for slow providers) |
| `POST /generate/result` | Poll a pending ticket |
| `GET /image/:key` | Serve an image the Worker stored (public, unguessable key) |
| `OPTIONS` | CORS preflight |
| `solance-canvas/worker`, `/providers`, `/storage`, `/ui` | JavaScript exports (Worker, provider registry, storage, React UI) |

## Data it owns

| Table / bucket / file | What is in it |
|---|---|
| Optional R2 bucket (bound in `wrangler.toml`) | Generated image bytes, keyed by UUID |
| Visitor's browser `localStorage` | Their own provider keys and style presets (never sent to storage on the server) |

## Settings and secrets it needs

Named here, never valued.

| Name | What it is |
|---|---|
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Google Gemini key |
| `XAI_API_KEY` | xAI Grok key |
| `FAL_KEY` / `FAL_API_KEY` | fal.ai key |
| `OPENAI_API_KEY` | OpenAI key |
| `STABILITY_API_KEY` | Stability AI key |
| `AGNES_API_KEY` | Agnes key |
| `VENICE_API_KEY` | Venice key |
| `VENICE_SAFE_MODE` | `"true"` turns Venice's content filter on (off by default) |
| `AUTH_TOKEN` | Optional bearer token required on both POST routes |
| `ALLOWED_ORIGIN` | Optional list of browser origins allowed to call the Worker |
| `X-Provider-Key` (request header) | A caller's own provider key, used for that one request |
| `VITE_CANVAS_API_URL` | UI build setting: where the Worker answers |
