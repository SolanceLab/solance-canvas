import { describe, it, expect, vi } from 'vitest'
import { runGeneration } from '../src/generation'

// The security-relevant invariant this file exists to prove: a visitor's
// provider key must be forwarded on EVERY poll tick, not just the initial
// /generate call — the pending ticket itself never carries the key. A
// missed forward on any tick is a silent regression (falls back to the
// Worker's env key, or a 400) and this test fails the instant it happens.

function makeFakeClient(overrides = {}) {
  return {
    generate: vi.fn(),
    getGenerationResult: vi.fn(),
    ...overrides,
  }
}

describe('runGeneration', () => {
  it('returns the result immediately when generate() resolves non-pending', async () => {
    const result = { image_url: 'https://x/img.png' }
    const apiClient = makeFakeClient({ generate: vi.fn().mockResolvedValue(result) })
    const headers = { 'X-Provider-Key': 'k' }

    const out = await runGeneration(apiClient, { prompt: 'x' }, { headers, sleep: async () => {} })

    expect(out).toBe(result)
    expect(apiClient.generate).toHaveBeenCalledWith({ prompt: 'x' }, { headers })
    expect(apiClient.getGenerationResult).not.toHaveBeenCalled()
  })

  it('forwards the SAME headers object on every poll tick', async () => {
    const ticket = { pending: true, request_id: 'r1' }
    const finalResult = { image_url: 'https://x/img.png' }
    const apiClient = makeFakeClient({
      generate: vi.fn().mockResolvedValue(ticket),
      getGenerationResult: vi.fn()
        .mockResolvedValueOnce({ pending: true })
        .mockResolvedValueOnce({ pending: true })
        .mockResolvedValueOnce(finalResult),
    })
    const headers = { 'X-Provider-Key': 'k' }

    const out = await runGeneration(apiClient, { prompt: 'x' }, { headers, sleep: async () => {} })

    expect(out).toBe(finalResult)
    expect(apiClient.getGenerationResult).toHaveBeenCalledTimes(3)
    for (const call of apiClient.getGenerationResult.mock.calls) {
      expect(call[1]).toEqual({ headers })
    }
    // generate() also got the same opts.
    expect(apiClient.generate.mock.calls[0][1]).toEqual({ headers })
  })

  it('sends no X-Provider-Key header when none is passed', async () => {
    const apiClient = makeFakeClient({ generate: vi.fn().mockResolvedValue({ ok: true }) })

    await runGeneration(apiClient, { prompt: 'x' }, { sleep: async () => {} })

    expect(apiClient.generate).toHaveBeenCalledWith({ prompt: 'x' }, undefined)
  })

  it('throws the taking-unusually-long error once the deadline passes', async () => {
    const apiClient = makeFakeClient({
      generate: vi.fn().mockResolvedValue({ pending: true }),
      getGenerationResult: vi.fn().mockResolvedValue({ pending: true }),
    })

    let t = 0
    const now = () => t
    const sleep = async () => { t += 5000 }

    await expect(
      runGeneration(apiClient, { prompt: 'x' }, { deadlineMs: 10000, now, sleep })
    ).rejects.toThrow(/taking unusually long/)
  })
})
