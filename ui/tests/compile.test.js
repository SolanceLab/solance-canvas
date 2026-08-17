import { describe, it, expect } from 'vitest'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// ── JSX compile gate ─────────────────────────────────────────────
// Every other UI test exercises plain-JS modules (providerKeys, generation,
// api) — none of them would notice a stale import or a syntax error left
// behind in the JSX after the Canvas.jsx / CanvasSettings.jsx strip. This
// bundles each entry point with esbuild (react marked external so no React
// runtime needs to be installed/executed) — a broken import or invalid
// JSX fails the build, and this test, immediately.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(__dirname, '../src')

const entryPoints = ['Canvas.jsx', 'CanvasSettings.jsx', 'index.js'].map((f) => path.join(srcDir, f))

describe('JSX/module compile gate', () => {
  it('Canvas.jsx, CanvasSettings.jsx and index.js bundle cleanly', async () => {
    const result = await build({
      entryPoints,
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      outdir: path.join(__dirname, '.compile-gate-out'),
      external: ['react'],
      logLevel: 'silent',
    })
    expect(result.errors).toEqual([])
    expect(result.outputFiles.length).toBeGreaterThan(0)
  })
})
