// ── Generate + poll orchestration ───────────────────────────────────
// Pulled out of Canvas.jsx as its own pure, node-testable function.
// Why a separate module: whether a visitor's provider key gets forwarded
// on EVERY poll tick (not just the initial call) is a security-relevant
// invariant — the pending ticket never carries the key, so a missed
// forward silently falls back to the Worker's env key or a 400. That
// needs to be provable without a DOM, so it lives here instead of buried
// inside a React event handler.

export async function runGeneration(
  apiClient,
  payload,
  {
    headers,
    intervalMs = 4000,
    deadlineMs = 8 * 60 * 1000,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = Date.now,
  } = {}
) {
  // Built once, reused on every call — the SAME opts object (and therefore
  // the same headers) goes out on the initial request and every poll tick.
  const opts = headers ? { headers } : undefined

  let data = await apiClient.generate(payload, opts)
  const deadline = now() + deadlineMs
  while (data?.pending && now() < deadline) {
    await sleep(intervalMs)
    data = await apiClient.getGenerationResult(data, opts)
  }
  if (data?.pending) {
    throw new Error('Generation is taking unusually long — the provider may be busy. Please try again.')
  }
  return data
}
