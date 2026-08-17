import { useState, useEffect } from 'react'
import IMAGE_PROVIDERS from './imageProviders'
import DEFAULT_STYLES, { withDefaultStyles, readStoredStyles, STYLES_STORAGE_KEY } from './stylePresets'
import { listProviderKeyStatus, setProviderKey, removeProviderKey } from './providerKeys'

const labelClasses = "text-[11px] uppercase tracking-[0.18em] font-light text-[color:var(--page-muted)] font-mono"
const cardClasses = "bg-[color:var(--ink-deep)] border border-[color:var(--rule-mid)] rounded-md p-4 sm:p-5"

function CTAButton({ children, onClick, disabled, secondary, className = '' }) {
  const base = secondary
    ? 'border-[color:var(--rule-mid)] text-[color:var(--page-dim)] hover:text-[color:var(--page)] hover:border-[color:var(--rule-strong)]'
    : 'border-[color:var(--gold-soft)] text-[color:var(--gold-text)] hover:bg-[color:var(--gold-glow)]'
  return (
    <button onClick={onClick} disabled={disabled} className={`px-4 min-h-[44px] rounded-md border bg-transparent transition-colors font-sans text-sm disabled:opacity-40 disabled:cursor-not-allowed ${base} ${className}`}>
      {children}
    </button>
  )
}

// Props:
//   onBack — optional callback. When provided, a "Back to the Canvas"
//            link appears at the top and calls this instead of performing
//            any navigation itself. When omitted, the link is not
//            rendered.
export default function CanvasSettings({ onBack } = {}) {
  // ── Provider keys (browser-only, see ./providerKeys.js) ───────────
  // HARD RULE: this component only ever imports the boolean-status read
  // (see the import above) plus the writers. It never imports either of
  // that module's two value-returning reads, so a stored key's VALUE
  // cannot reach this screen's state or DOM, by construction — not by
  // care. Check the import line above, not this comment, if you're
  // verifying that claim.
  const [stored, setStored] = useState(() => listProviderKeyStatus())
  const [drafts, setDrafts] = useState({})

  const refreshStored = () => setStored(listProviderKeyStatus())

  const saveDraft = (providerId) => {
    const value = (drafts[providerId] || '').trim()
    if (!value) return
    setProviderKey(providerId, value)
    setDrafts(prev => ({ ...prev, [providerId]: '' }))
    refreshStored()
  }

  const clearKey = (providerId) => {
    removeProviderKey(providerId)
    refreshStored()
  }

  // ── Style presets ────────────────────────────────────────────────
  const [stylePresets, setStylePresets] = useState(() => {
    const saved = readStoredStyles()
    return saved ? withDefaultStyles(saved) : DEFAULT_STYLES
  })
  const [editingStyle, setEditingStyle] = useState(null)
  const [styleForm, setStyleForm] = useState({ name: '', prompt: '' })
  const [showStyleForm, setShowStyleForm] = useState(false)

  // ── Persist style presets ────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STYLES_STORAGE_KEY, JSON.stringify(stylePresets))
  }, [stylePresets])

  // ── Style preset handlers ────────────────────────────────────────
  const openNewStyle = () => {
    setEditingStyle(null)
    setStyleForm({ name: '', prompt: '' })
    setShowStyleForm(true)
  }

  const openEditStyle = (style) => {
    setEditingStyle(style.id)
    setStyleForm({ name: style.name, prompt: style.prompt })
    setShowStyleForm(true)
  }

  const saveStyle = () => {
    if (!styleForm.name.trim() || !styleForm.prompt.trim()) return
    if (editingStyle) {
      setStylePresets(prev => prev.map(s => s.id === editingStyle ? { ...s, name: styleForm.name.trim(), prompt: styleForm.prompt.trim() } : s))
    } else {
      setStylePresets(prev => [...prev, { id: `custom-${Date.now()}`, name: styleForm.name.trim(), prompt: styleForm.prompt.trim() }])
    }
    setShowStyleForm(false)
    setEditingStyle(null)
  }

  const deleteStyle = (id) => {
    if (DEFAULT_STYLES.some(d => d.id === id)) return
    setStylePresets(prev => prev.filter(s => s.id !== id))
  }

  const resetDefaults = () => {
    const custom = stylePresets.filter(s => !DEFAULT_STYLES.some(d => d.id === s.id))
    setStylePresets([...DEFAULT_STYLES, ...custom])
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-8 pb-12 max-w-3xl">
      {/* Back link */}
      {onBack && (
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-[color:var(--page-muted)] hover:text-[color:var(--gold-text)] transition-colors font-mono"
          >
            <span className="text-sm leading-none">←</span>
            Back to the Canvas
          </button>
        </div>
      )}

      {/* Page header */}
      <div>
        <h2 className="text-[clamp(1.7rem,5.5vw,3.4rem)] font-serif font-normal text-[color:var(--page)] tracking-[-0.01em] leading-none">
          Canvas <em className="text-[color:var(--gold-text)] not-italic"><span className="italic">settings</span></em>
        </h2>
        <p className="text-[1.1rem] font-light text-[color:var(--page-dim)] font-serif leading-[1.55] mt-3">
          Provider API keys and style presets.
        </p>
      </div>

      {/* ── Your API keys ──────────────────────────────────────────── */}
      <div className={`${cardClasses} space-y-5`}>
        <h3 className="text-xl font-serif font-normal text-[color:var(--page)] tracking-[-0.01em]">Your API keys</h3>

        <div className="space-y-2">
          {IMAGE_PROVIDERS.map(p => (
            <div key={p.id} className="py-3 px-3 rounded-md border border-[color:var(--rule-dim)] space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[color:var(--page)] font-sans">{p.name}</span>
                {stored[p.id] && (
                  <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.15em] text-[color:var(--blue)] font-mono shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--blue)]" />
                    Key stored
                  </span>
                )}
              </div>

              {stored[p.id] ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-mono text-[color:var(--page-dim)] tracking-[0.15em]">••••••••</span>
                  <button onClick={() => clearKey(p.id)} className="text-[10px] text-[color:var(--page-faint)] hover:text-red-400 transition-colors font-mono shrink-0">× Remove</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <input
                      value={drafts[p.id] || ''}
                      onChange={e => setDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder={`Paste your ${p.name} API key`}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full text-base font-mono text-[color:var(--page)] bg-[color:var(--ink)] border border-[color:var(--rule-mid)] rounded-md px-3 py-2.5 placeholder-[color:var(--page-faint)] focus:border-[color:var(--gold-soft)] focus:outline-none transition-colors"
                      style={{ outline: 'var(--focus)', outlineOffset: 'var(--focus-offset)' }}
                    />
                  </div>
                  <CTAButton onClick={() => saveDraft(p.id)} disabled={!(drafts[p.id] || '').trim()}>Save</CTAButton>
                </div>
              )}

              {p.note && (
                <p className="text-[0.92rem] font-light text-[color:var(--page-dim)] font-serif leading-[1.55] pt-0.5">
                  {p.note}
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="text-[0.82rem] text-[color:var(--page-muted)] font-sans leading-relaxed">
          Keys are stored only in this browser's localStorage and sent with each generation request in the X-Provider-Key header — the Worker uses them for that request only and never stores or logs them. They do not sync across devices. When you add no key, the Worker falls back to its own configured provider keys.
        </p>
      </div>

      {/* ── Style Presets ──────────────────────────────────────────── */}
      <div className={`${cardClasses} space-y-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-serif font-normal text-[color:var(--page)] tracking-[-0.01em]">Style Presets</h3>
          <div className="flex gap-2">
            <CTAButton secondary onClick={resetDefaults}>Reset defaults</CTAButton>
            <CTAButton onClick={openNewStyle}>+ New</CTAButton>
          </div>
        </div>

        {stylePresets.length === 0 && (
          <p className="text-sm text-[color:var(--page-dim)] font-sans italic">No style presets. Add one above.</p>
        )}

        <div className="space-y-2">
          {stylePresets.map(s => {
            const isDefault = DEFAULT_STYLES.some(d => d.id === s.id)
            return (
              <div key={s.id} className="py-3 px-3 rounded-md border border-[color:var(--rule-dim)] space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[color:var(--page)] font-sans">{s.name}</span>
                    {isDefault && <span className="text-[9px] uppercase tracking-[0.12em] text-[color:var(--page-faint)] font-mono px-1.5 py-0.5 rounded border border-[color:var(--rule-dim)]">Default</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEditStyle(s)} className="text-[10px] text-[color:var(--page-faint)] hover:text-[color:var(--page)] transition-colors font-mono">Edit</button>
                    {!isDefault && <button onClick={() => deleteStyle(s.id)} className="text-[10px] text-[color:var(--page-faint)] hover:text-red-400 transition-colors font-mono">Delete</button>}
                  </div>
                </div>
                <p className="text-[0.82rem] text-[color:var(--page-muted)] font-sans leading-relaxed">{s.prompt}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Style form dialog ──────────────────────────────────────── */}
      {showStyleForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowStyleForm(false)}>
          <div className="bg-[color:var(--ink-deep)] border border-[color:var(--rule-mid)] rounded-lg max-w-lg w-full p-5 space-y-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-serif font-normal text-[color:var(--page)] tracking-[-0.01em]">
              {editingStyle ? 'Edit style preset' : 'New style preset'}
            </h3>
            <div>
              <label className="block">
                <span className={`${labelClasses} block mb-2`}>Name</span>
                <input value={styleForm.name} onChange={e => setStyleForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. HoS Editorial" className="w-full text-base font-sans text-[color:var(--page)] bg-[color:var(--ink)] border border-[color:var(--rule-mid)] rounded-md px-3 py-2.5 placeholder-[color:var(--page-faint)] focus:border-[color:var(--gold-soft)] focus:outline-none transition-colors" style={{ outline: 'var(--focus)', outlineOffset: 'var(--focus-offset)' }} />
              </label>
            </div>
            <div>
              <label className="block">
                <span className={`${labelClasses} block mb-2`}>Style prompt</span>
                <textarea value={styleForm.prompt} onChange={e => setStyleForm(p => ({ ...p, prompt: e.target.value }))} placeholder="Describe the visual style — mood, colors, lighting, composition…" rows={4} className="w-full text-base font-sans text-[color:var(--page)] bg-[color:var(--ink)] border border-[color:var(--rule-mid)] rounded-md p-3 resize-y placeholder-[color:var(--page-faint)] focus:border-[color:var(--gold-soft)] focus:outline-none transition-colors" style={{ outline: 'var(--focus)', outlineOffset: 'var(--focus-offset)' }} />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <CTAButton onClick={saveStyle} disabled={!styleForm.name.trim() || !styleForm.prompt.trim()}>{editingStyle ? 'Update' : 'Save'}</CTAButton>
              <CTAButton secondary onClick={() => setShowStyleForm(false)}>Cancel</CTAButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
