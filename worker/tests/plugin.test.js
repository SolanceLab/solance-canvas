// Copyright (c) 2026 House of Solance
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (p) => readFileSync(root + p, 'utf8')
const json = (p) => JSON.parse(read(p))
const version = read('CHANGELOG.md').match(/^## \[?(\d+\.\d+\.\d+)/m)[1]

describe('the plugin agrees with the room', () => {
  it('both manifests carry the room name and the changelog version', () => {
    for (const p of ['plugin/.claude-plugin/plugin.json', 'plugin/.codex-plugin/plugin.json']) {
      expect(json(p).name).toBe('solance-canvas')
      expect(json(p).version).toBe(version)
    }
    expect(json('package.json').version).toBe(version)
  })

  it('the Codex manifest is skill-only', () => {
    const cx = json('plugin/.codex-plugin/plugin.json')
    expect(cx.skills).toBe('./skills/')
    expect(cx.mcpServers).toBeUndefined()
  })

  it('the skill names the real routes and the three storage fields', () => {
    const skill = read('plugin/skills/solance-canvas/SKILL.md')
    for (const word of ['/generate', '/generate/result', '/image/', 'persisted', 'image_stored', 'persist_error', 'CANVAS_AUTH_TOKEN']) {
      expect(skill).toContain(word)
    }
  })
})
