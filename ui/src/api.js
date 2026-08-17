// ── Canvas API client ────────────────────────────────────────────────
// Canvas.jsx and CanvasSettings.jsx don't talk to `fetch` directly — every
// request goes through a client built here, so a consuming app can point
// the component at its own backend without touching component code.
//
// Endpoints this client wraps (the Worker's whole surface):
//   POST /generate         — kick off a generation
//   POST /generate/result  — poll a pending generation ticket
//   GET  /image/:key       — fetch a Worker-stored image (plain public route)
//
// No auth scheme is baked in. This client does not know about bearer
// tokens, cookies, sessions, or any particular login flow — bring your own
// by passing `headers`, either as a plain object merged into every request,
// or as an async function called before each request (useful when your
// auth value needs to be computed fresh each time, e.g. a token that
// refreshes). See `getHeaders` in the example below.
//
// Example:
//
//   import { createApiClient } from '@yourscope/canvas-ui'
//
//   const apiClient = createApiClient({
//     baseUrl: 'https://api.example.com',
//     headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
//   })
//
//   <Canvas apiClient={apiClient} />

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Vite exposes build-time env vars on `import.meta.env`. This falls back to
// a same-origin `/api` path so the component still does something sane if
// you forget to set it (e.g. behind a reverse proxy that rewrites /api/*).
const DEFAULT_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_CANVAS_API_URL) ||
  '/api'

/**
 * Build a Canvas API client.
 *
 * @param {Object} [opts]
 * @param {string} [opts.baseUrl] — API base URL, no trailing slash.
 *   Defaults to `import.meta.env.VITE_CANVAS_API_URL`, falling back to `/api`.
 * @param {typeof fetch} [opts.fetchImpl] — fetch implementation to use.
 *   Defaults to the global `fetch`. Override in tests or non-browser runtimes.
 * @param {Object|Function} [opts.headers] — extra headers merged into every
 *   request (JSON requests get `Content-Type: application/json` added
 *   automatically). Pass a plain object, or an async `() => Promise<Object>`
 *   for headers that must be computed per request. This is the ONLY place
 *   auth is supplied — the client has no auth scheme of its own.
 */
export function createApiClient({ baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch, headers } = {}) {
  async function resolveHeaders() {
    if (typeof headers === 'function') return (await headers()) || {}
    return headers || {}
  }

  async function rawRequest(endpoint, options = {}) {
    const extra = await resolveHeaders()
    const finalHeaders = {
      'Content-Type': 'application/json',
      ...extra,
      ...options.headers,
    }
    const response = await fetchImpl(`${baseUrl}${endpoint}`, { ...options, headers: finalHeaders })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new ApiError(data.error || `HTTP ${response.status}`, response.status)
    }
    return response
  }

  // JSON request/response — the shape both endpoints use.
  async function request(endpoint, options = {}) {
    return (await rawRequest(endpoint, options)).json()
  }

  return {
    // POST /generate — kick off a generation. May return the finished
    // result, or `{ pending: true, ...ticket }` for providers whose jobs
    // outlive a single request — poll that ticket with getGenerationResult.
    // `reqOpts.headers` are merged on top of the client's own (e.g. a
    // visitor's X-Provider-Key).
    generate: (payload, reqOpts = {}) =>
      request('/generate', { method: 'POST', body: JSON.stringify(payload), headers: reqOpts.headers }),
    // POST /generate/result — poll a pending generation ticket. Re-send
    // the same `headers` on every tick — the ticket itself never carries
    // a visitor's key.
    getGenerationResult: (ticket, reqOpts = {}) =>
      request('/generate/result', { method: 'POST', body: JSON.stringify(ticket), headers: reqOpts.headers }),
    // Build the URL for GET /image/:key. This is a plain public route (no
    // auth), so a stored key resolves straight to a direct <img src>.
    imageUrl: (key) => `${baseUrl}/image/${encodeURIComponent(key)}`,

    // Escape hatch, in case a consumer needs an endpoint this client
    // doesn't wrap yet.
    request,
  }
}

// Ready-to-use client pointed at VITE_CANVAS_API_URL (or `/api`), with no
// auth headers attached. Most apps will want their own `createApiClient(...)`
// call instead so they can supply `headers`; this default exists so
// `<Canvas />` works out of the box against a same-origin/public API.
export const defaultApiClient = createApiClient()
