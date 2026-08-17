// Minimal HTTP helpers for the Worker.
//
// This Worker has no per-caller authentication of its own (see README). That
// makes CORS the only thing standing between "my image generator" and "anyone's
// page can spend my provider credits from a visitor's browser", so it is
// configurable rather than hardcoded:
//
//   ALLOWED_ORIGIN unset                           -> "*"  (open — works out of
//                                                           the box, fine for
//                                                           local development)
//   ALLOWED_ORIGIN = "https://a.com"               -> that origin only
//   ALLOWED_ORIGIN = "https://a.com,https://b.com" -> either, echoed per request
//
// Note what CORS does and does not buy you. When ALLOWED_ORIGIN is a
// specific list, isOriginAllowed() below rejects a mismatched-Origin
// request server-side, before routing — so a browser page on a disallowed
// origin cannot spend the operator's provider credits, not just "cannot
// read the response". It still does not stop curl or any caller that
// doesn't send an Origin header — that is not what CORS is for. If this
// Worker is reachable from the internet and you care about the bill, set
// AUTH_TOKEN too (see index.js) — CORS keeps browsers honest, AUTH_TOKEN is
// the actual lock.
//
// CORS response headers are applied ONCE, at the boundary, by withCors() in
// index.js's fetch() handler. Individual route handlers build plain
// responses and stay ignorant of it — there is no way to add a route and
// forget the headers. The origin REJECTION (isOriginAllowed) is a separate,
// earlier check in index.js's route(), before any handler runs.

function allowedOrigins(env) {
  const raw = (env && env.ALLOWED_ORIGIN) || '*';
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

// CORS response headers alone do NOT stop a request from executing — they
// only tell a *compliant browser* whether it's allowed to read the
// response. A cross-origin "simple request" (e.g. Content-Type: text/plain,
// which this Worker's JSON parsing accepts regardless of header) skips
// preflight entirely: the browser sends it, the Worker runs it — including
// the paid provider call — and only refuses to hand the page the response
// body. That still spends the operator's provider credits from a hostile
// page's visitor. So when ALLOWED_ORIGIN is configured to a specific list
// (not the open "*" default), reject a mismatched Origin server-side,
// before the request is routed to a handler, instead of relying on the
// browser to police itself.
//
// A request with no Origin header at all (curl, a server-to-server call,
// same-origin navigation) is not a browser CORS request in the first
// place — CORS doesn't apply to it, so it is not rejected here. AUTH_TOKEN
// is the tool for closing that door; see index.js.
export function isOriginAllowed(request, env) {
  const list = allowedOrigins(env);
  if (list.length === 1 && list[0] === '*') return true;
  const origin = request && request.headers ? request.headers.get('Origin') : null;
  if (!origin) return true;
  return list.includes(origin);
}

// Resolve the Access-Control-Allow-Origin value for THIS request. When a
// specific allowlist is configured we echo the caller's origin back, and set
// `Vary: Origin` — without which a shared cache can hand one site's approval to
// another. A caller whose origin isn't on the list gets the first configured
// origin, i.e. not itself, so the browser refuses. That is the intent.
export function corsHeaders(request, env) {
  const list = allowedOrigins(env);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Provider-Key',
  };

  if (list.length === 1 && list[0] === '*') {
    headers['Access-Control-Allow-Origin'] = '*';
    return headers;
  }

  const origin = request && request.headers ? request.headers.get('Origin') : null;
  headers['Access-Control-Allow-Origin'] = list.includes(origin) ? origin : list[0];
  headers['Vary'] = 'Origin';
  return headers;
}

// Copy `response` with the CORS headers added. The body is passed through
// untouched, so streamed responses (an R2 object) stay streamed.
export function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request, env))) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function handleOptions() {
  return new Response(null, { status: 204 });
}
