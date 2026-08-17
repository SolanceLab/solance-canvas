import { useState, useRef, useEffect, useCallback } from 'react'
import { defaultApiClient } from './api'
import IMAGE_PROVIDERS from './imageProviders'
import DEFAULT_STYLES, { withDefaultStyles, readStoredStyles, STYLES_STORAGE_KEY } from './stylePresets'
import { getProviderKey } from './providerKeys'
import { runGeneration } from './generation'
import { resolveImage as resolveImagePure } from './resolveImage'

// ── Layout/style constants ────────────────────────────────────────
const labelClasses = "text-[11px] uppercase tracking-[0.18em] font-light text-[color:var(--page-muted)] font-mono"
const cardClasses = "bg-[color:var(--ink-deep)] border border-[color:var(--rule-mid)] rounded-md p-4 sm:p-5"

// ── Build model options from provider catalog ─────────────────────
// Every provider is listed; each is usable with the Worker's own env key
// (if the operator configured one) or a visitor key stored in this
// browser. The browser can't know whether the server env secret is
// actually set, so the label only ever promises what it can see: "Your
// key" when one is stored here, "Worker fallback" otherwise.
function getModelOptions() {
  const options = []
  IMAGE_PROVIDERS.forEach(p => {
    p.models.forEach(m => {
      options.push({
        id: `${p.id}:${m.id}`,
        label: `${p.name} — ${m.label}`,
        desc: getProviderKey(p.id) ? 'Your key' : 'Worker fallback',
        provider: p.id,
        model: m.id,
      })
    })
  })
  return options
}

const ASPECTS = [
  { id: 'landscape', label: '16:9', icon: '▬' },
  { id: 'landscape32', label: '3:2', icon: '▬' },
  { id: 'portrait', label: '9:16', icon: '▮' },
  { id: 'portrait23', label: '2:3', icon: '▮' },
  { id: 'square', label: '1:1', icon: '⬜' },
  { id: 'custom', label: 'Custom', icon: '✚' },
]

// Resolution tiers for the fal/Seedream path (backend `longEdge`, px).
// Default 2K matches the backend's own default when no tier is chosen.
const RESOLUTIONS = [
  { id: '1k', label: '1K', longEdge: 1024 },
  { id: '2k', label: '2K', longEdge: 2048 },
  { id: '4k', label: '4K', longEdge: 4096 },
]

// Mirrors the backend's own aspect/longEdge-to-pixel math so the saved
// `resolution` metadata reflects the actual pixel dims fal/Seedream will
// render at — including the 960px short-edge floor at the 1K tier, which
// scales BOTH edges up (ratio-preserving) rather than distorting the ratio.
// If your backend computes this differently, update both sides together.
const FAL_MIN_SHORT_EDGE = 960
function falDimsClient(aspect, longEdge) {
  const ratios = {
    '1:1': [1, 1],
    '16:9': [16, 9], '9:16': [9, 16],
    '4:3': [4, 3], '3:4': [3, 4],
    '3:2': [3, 2], '2:3': [2, 3],
  }
  const [rw, rh] = ratios[aspect] || [1, 1]
  let width, height
  if (rw >= rh) {
    width = longEdge
    height = Math.round((longEdge * rh) / rw)
    if (height < FAL_MIN_SHORT_EDGE) {
      height = FAL_MIN_SHORT_EDGE
      width = Math.round((FAL_MIN_SHORT_EDGE * rw) / rh)
    }
  } else {
    height = longEdge
    width = Math.round((longEdge * rw) / rh)
    if (width < FAL_MIN_SHORT_EDGE) {
      width = FAL_MIN_SHORT_EDGE
      height = Math.round((FAL_MIN_SHORT_EDGE * rh) / rw)
    }
  }
  return { width, height }
}

// ── Custom dropdown ───────────────────────────────────────────────
function Dropdown({ label, value, options, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find(o => o.id === value)

  return (
    <div ref={ref} className="relative">
      {label && <span className={`${labelClasses} block mb-2`}>{label}</span>}
      <button
        onClick={() => setOpen(!open)}
        className="w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-md border border-[color:var(--rule-mid)] bg-[color:var(--ink)] text-[color:var(--page)] font-sans text-base transition-colors hover:border-[color:var(--rule-strong)] focus:border-[color:var(--gold-soft)] focus:outline-none"
        style={{ outline: 'var(--focus)', outlineOffset: 'var(--focus-offset)' }}
      >
        <span className={selected ? 'text-[color:var(--page)]' : 'text-[color:var(--page-faint)]'}>
          {selected ? selected.label : (placeholder || 'Select...')}
        </span>
        <span className={`text-[color:var(--page-muted)] text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="absolute z-20 top-full mt-1 w-full bg-[color:var(--ink-raised)] border border-[color:var(--rule-mid)] rounded-md shadow-lg overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={() => { onChange(opt.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2.5 transition-colors font-sans text-sm ${
                opt.id === value
                  ? 'bg-[color:var(--gold-glow)] text-[color:var(--gold-text)]'
                  : 'text-[color:var(--page-dim)] hover:bg-[color:var(--ink-deep)] hover:text-[color:var(--page)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{opt.label}</span>
                {opt.desc && <span className="text-[10px] text-[color:var(--page-muted)] font-normal">{opt.desc}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Aspect ratio selector pills ───────────────────────────────────
function AspectSelector({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ASPECTS.map(a => {
        const isActive = value === a.id
        return (
          <button
            key={a.id}
            onClick={() => onChange(a.id)}
            className={`min-h-[44px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-md border transition-colors px-3 py-2 ${
              isActive
                ? 'border-[color:var(--gold-soft)] bg-[color:var(--gold-glow)] text-[color:var(--gold-text)]'
                : 'border-[color:var(--rule-mid)] text-[color:var(--page-dim)] hover:text-[color:var(--page)] hover:border-[color:var(--rule-strong)]'
            }`}
          >
            {a.id === 'custom' ? (
              <span className="text-sm">{a.icon}</span>
            ) : (
              <span className="text-sm leading-none">{a.icon}</span>
            )}
            <span className="text-[10px] uppercase tracking-[0.08em]">{a.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Resolution tier pills (compact, secondary to the aspect selector) ─────
function ResolutionSelector({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {RESOLUTIONS.map(r => {
        const isActive = value === r.id
        return (
          <button
            key={r.id}
            onClick={() => onChange(r.id)}
            className={`min-h-[44px] min-w-[40px] flex items-center justify-center rounded-md border px-2.5 transition-colors font-mono text-[10px] uppercase tracking-[0.08em] ${
              isActive
                ? 'border-[color:var(--gold-soft)] bg-[color:var(--gold-glow)] text-[color:var(--gold-text)]'
                : 'border-[color:var(--rule-dim)] text-[color:var(--page-faint)] hover:text-[color:var(--page-dim)] hover:border-[color:var(--rule-mid)]'
            }`}
          >
            {r.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Outlined CTA button ───────────────────────────────────────────
function CTAButton({ children, onClick, disabled, secondary, className = '' }) {
  const base = secondary
    ? 'border-[color:var(--rule-mid)] text-[color:var(--page-dim)] hover:text-[color:var(--page)] hover:border-[color:var(--rule-strong)]'
    : 'border-[color:var(--gold-soft)] text-[color:var(--gold-text)] hover:bg-[color:var(--gold-glow)]'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-5 min-h-[44px] rounded-md border bg-transparent transition-colors font-sans text-base disabled:opacity-40 disabled:cursor-not-allowed ${base} ${className}`}
    >
      {children}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────
// Props:
//   apiClient      — an object built by createApiClient() from ./api.
//                    Defaults to a client pointed at VITE_CANVAS_API_URL
//                    (or `/api`) with no auth headers attached.
//   onOpenSettings — optional callback. When provided, a settings icon
//                    appears in the header and calls this instead of
//                    performing any navigation itself — wire it to however
//                    your app opens <CanvasSettings />. When omitted, the
//                    icon is not rendered.
export default function Canvas({ apiClient = defaultApiClient, onOpenSettings } = {}) {
  // ── State ────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(() => {
    const opts = getModelOptions()
    return opts.length > 0 ? opts[0].id : 'gemini:gemini-3.1-flash-image-preview'
  })
  const modelOptions = getModelOptions()
  const [aspect, setAspect] = useState('square')
  const [resTier, setResTier] = useState('2k')
  const [customWidth, setCustomWidth] = useState('')
  const [customHeight, setCustomHeight] = useState('')
  const [stylePresets, setStylePresets] = useState(() => {
    const saved = readStoredStyles()
    return saved ? withDefaultStyles(saved) : DEFAULT_STYLES
  })
  const [activeStyle, setActiveStyle] = useState('')
  const [referenceFiles, setReferenceFiles] = useState([])
  const [referencePreviews, setReferencePreviews] = useState([])
  const REFERENCE_CAP = 3
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const fileInputRef = useRef(null)
  const resultRef = useRef(null)

  // ── Persist style presets to localStorage ────────────────────────
  useEffect(() => {
    localStorage.setItem(STYLES_STORAGE_KEY, JSON.stringify(stylePresets))
  }, [stylePresets])

  // Resolve an `image_url` to something an <img src> can use — see
  // ./resolveImage.js for the (independently tested) mapping rule.
  const resolveImage = useCallback((value) => resolveImagePure(apiClient, value), [apiClient])

  // ── Generate ─────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setError(null)
    setResult(null)

    const activeStylePrompt = activeStyle
      ? stylePresets.find(s => s.id === activeStyle)?.prompt || ''
      : ''

    // Frontend aspect ids → ratio strings the backend providers understand.
    const aspectRatio = aspect === 'landscape' ? '16:9'
      : aspect === 'landscape32' ? '3:2'
      : aspect === 'portrait' ? '9:16'
      : aspect === 'portrait23' ? '2:3'
      : aspect === 'square' ? '1:1'
      : aspect // custom — backend falls back to a default
    const opt = modelOptions.find(o => o.id === model)
    const longEdge = RESOLUTIONS.find(r => r.id === resTier)?.longEdge || 2048

    // `resolution` is a dual-purpose field: forwarded verbatim as the
    // OpenAI (direct) size string when the `openai` provider is used, AND
    // saved as display metadata for every provider. To keep the OpenAI
    // contract byte-identical, only the `fal` path (where `longEdge`
    // actually drives generation) gets the resolution-tier-aware value —
    // computed via the same floor-adjusted math as the backend's own
    // aspect/longEdge math, so the saved metadata matches fal/Seedream's
    // real output pixels. Every other provider keeps the legacy nominal
    // 1080p-ish strings.
    let resolution = ''
    if (aspect === 'landscape') resolution = '1920x1080'
    else if (aspect === 'landscape32') resolution = '1620x1080'
    else if (aspect === 'portrait') resolution = '1080x1920'
    else if (aspect === 'portrait23') resolution = '1080x1620'
    else if (aspect === 'square') resolution = '1024x1024'
    else if (aspect === 'custom' && customWidth && customHeight) resolution = `${customWidth}x${customHeight}`

    if (opt?.provider === 'fal' && aspect !== 'custom') {
      const { width, height } = falDimsClient(aspectRatio, longEdge)
      resolution = `${width}x${height}`
    }

    try {
      const payload = {
        prompt: prompt.trim(),
        model: opt?.model || '',
        provider: opt?.provider || 'gemini',
        aspect: aspectRatio,
        resolution,
        longEdge,
      }
      if (activeStylePrompt) payload.style_prompt = activeStylePrompt
      if (referencePreviews.length > 0) payload.references = referencePreviews

      const userKey = getProviderKey(opt?.provider || '')
      const data = await runGeneration(
        apiClient,
        payload,
        userKey ? { headers: { 'X-Provider-Key': userKey } } : {}
      )
      setResult(data)
      resultRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch (err) {
      setError(err.message || 'Generation failed')
    }
    setGenerating(false)
  }

  // ── Reference image upload ───────────────────────────────────────
  // Multi-ref: append uploads up to REFERENCE_CAP (3). Each file → its own
  // base64 data URL preview. The picker accepts multiple files at once.
  const handleReferenceUpload = (e) => {
    const picked = Array.from(e.target.files || [])
    if (!picked.length) return
    const slotsLeft = REFERENCE_CAP - referenceFiles.length
    const accepted = picked.slice(0, Math.max(0, slotsLeft))
    accepted.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setReferenceFiles(prev => [...prev, file])
        setReferencePreviews(prev => [...prev, ev.target.result])
      }
      reader.readAsDataURL(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const clearReference = (index) => {
    setReferenceFiles(prev => prev.filter((_, i) => i !== index))
    setReferencePreviews(prev => prev.filter((_, i) => i !== index))
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-12">
      {/* ===== Page header ===== */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[clamp(1.7rem,5.5vw,3.4rem)] font-serif font-normal text-[color:var(--page)] tracking-[-0.01em] leading-none">
            The <em className="text-[color:var(--gold-text)] not-italic"><span className="italic">Canvas</span></em>
          </h2>
          <p className="text-[1.1rem] font-light text-[color:var(--page-dim)] font-serif leading-[1.55] mt-3">
            Prompt, generate, save what works.
          </p>
        </div>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="shrink-0 mt-1.5 text-[color:var(--page-muted)] hover:text-[color:var(--gold-text)] transition-colors"
            title="Canvas Settings"
            aria-label="Canvas Settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        )}
      </div>

      {/* ===== Generation panel ===== */}
      <div className={`${cardClasses} space-y-5`}>
        {/* Model dropdown */}
        <Dropdown
          label="Model"
          value={model}
          options={modelOptions}
          onChange={setModel}
          placeholder="Select model..."
        />

        {/* Prompt */}
        <div>
          <label className="block">
            <span className={`${labelClasses} block mb-2`}>Prompt</span>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate…"
              rows={3}
              className="w-full text-base font-sans text-[color:var(--page)] bg-[color:var(--ink)] border border-[color:var(--rule-mid)] rounded-md p-3 resize-y placeholder-[color:var(--page-faint)] focus:border-[color:var(--gold-soft)] focus:outline-none transition-colors"
              style={{ outline: 'var(--focus)', outlineOffset: 'var(--focus-offset)' }}
            />
          </label>
        </div>

        {/* Aspect ratio */}
        <div>
          <span className={`${labelClasses} block mb-2`}>Aspect ratio</span>
          <AspectSelector value={aspect} onChange={setAspect} />
          {aspect === 'custom' && (
            <div className="flex items-center gap-3 mt-3">
              <div>
                <span className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--page-faint)] font-mono block mb-1">Width</span>
                <input
                  value={customWidth}
                  onChange={e => setCustomWidth(e.target.value.replace(/\D/g, ''))}
                  placeholder="1024"
                  className="w-24 text-base font-sans text-[color:var(--page)] bg-[color:var(--ink)] border border-[color:var(--rule-mid)] rounded-md px-3 py-2 text-center placeholder-[color:var(--page-faint)] focus:border-[color:var(--gold-soft)] focus:outline-none transition-colors"
                  style={{ outline: 'var(--focus)', outlineOffset: 'var(--focus-offset)' }}
                />
              </div>
              <span className="text-[color:var(--page-muted)] text-xs mt-5">×</span>
              <div>
                <span className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--page-faint)] font-mono block mb-1">Height</span>
                <input
                  value={customHeight}
                  onChange={e => setCustomHeight(e.target.value.replace(/\D/g, ''))}
                  placeholder="1024"
                  className="w-24 text-base font-sans text-[color:var(--page)] bg-[color:var(--ink)] border border-[color:var(--rule-mid)] rounded-md px-3 py-2 text-center placeholder-[color:var(--page-faint)] focus:border-[color:var(--gold-soft)] focus:outline-none transition-colors"
                  style={{ outline: 'var(--focus)', outlineOffset: 'var(--focus-offset)' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Resolution — 1K/2K/4K, secondary to the aspect selector above */}
        <div>
          <span className={`${labelClasses} block mb-2`}>Resolution</span>
          <ResolutionSelector value={resTier} onChange={setResTier} />
        </div>

        {/* Reference images (up to 3) */}
        <div>
          <span className={`${labelClasses} block mb-2`}>Reference images <span className="normal-case tracking-normal text-[color:var(--page-faint)]">({referencePreviews.length}/{REFERENCE_CAP})</span></span>
          <div className="flex flex-wrap items-center gap-3">
            {referencePreviews.map((src, i) => (
              <div key={i} className="relative inline-block">
                <img src={src} alt={`Ref ${i + 1}`} className="h-24 w-auto rounded-md border border-[color:var(--rule-mid)] object-cover" />
                <button onClick={() => clearReference(i)} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[color:var(--ink-raised)] border border-[color:var(--rule-mid)] text-[color:var(--page-dim)] hover:text-red-400 text-[10px] flex items-center justify-center transition-colors" aria-label={`Remove reference ${i + 1}`}>×</button>
              </div>
            ))}
            {referencePreviews.length < REFERENCE_CAP && (
              <button onClick={() => fileInputRef.current?.click()} className="h-24 px-4 rounded-md border border-dashed border-[color:var(--rule-mid)] text-[color:var(--page-dim)] hover:text-[color:var(--page)] hover:border-[color:var(--rule-strong)] transition-colors font-sans text-sm">
                + Attach image
              </button>
            )}
          </div>
          <p className="text-[0.78rem] text-[color:var(--page-muted)] font-sans leading-relaxed mt-2">
            Gemini, fal and Agnes use all refs as identity/style anchors. Grok, OpenAI direct and Stability <strong>ignore references entirely</strong> — attach one and it is silently dropped. Note: references are uploaded to whichever provider you pick, and Agnes is a third party with no stated data-retention policy.
          </p>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handleReferenceUpload} className="hidden" />
        </div>

        {/* Style preset dropdown */}
        <Dropdown
          label="Style preset"
          value={activeStyle}
          options={[
            { id: '', label: 'None', desc: 'No style overlay' },
            ...stylePresets.map(s => ({ id: s.id, label: s.name, desc: '' })),
          ]}
          onChange={setActiveStyle}
          placeholder="Select a style preset..."
        />

        {/* Generate button + status */}
        <div className="flex items-center gap-4 pt-1">
          <CTAButton onClick={handleGenerate} disabled={!prompt.trim() || generating}>
            {generating ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border border-[color:var(--blue)] border-t-transparent animate-spin" />
                Generating…
              </span>
            ) : 'Generate'}
          </CTAButton>
          {error && <span className="text-sm text-red-400 font-sans">{error}</span>}
        </div>
      </div>

      {/* ===== Result ===== */}
      {(result || generating) && (
        <div ref={resultRef} className={`${cardClasses} space-y-4`}>
          <div className="flex items-center justify-between">
            <span className={labelClasses}>Result</span>
            {result && (
              <CTAButton secondary className="!px-3 !py-1 !text-xs" onClick={() => setResult(null)}>Dismiss</CTAButton>
            )}
          </div>

          {generating && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-[color:var(--blue)] border-t-transparent animate-spin" />
                <span className="text-sm text-[color:var(--page-dim)] font-serif italic">Generating…</span>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              {/* The Worker never drops an image on a storage failure — it
                  falls back to the provider's own value (see storage.js's
                  degrade-never-drop rule). This banner is what makes that
                  fallback visible instead of a silent trap: without it the
                  image renders, looks completely successful, and is gone
                  the moment you leave the page. `persisted` is false in
                  two real cases: no storage bucket is configured on this
                  Worker at all, or the write itself failed (a large image
                  is a common cause of the latter). See docs/LESSONS.md
                  lesson 2. */}
              {result.persisted === false && (
                <div className="rounded-md border border-[color:var(--gold-soft)] bg-[color:var(--gold-glow)] px-4 py-3">
                  <p className="text-[13px] font-sans text-[color:var(--gold-text)] leading-relaxed">
                    <strong>Not stored on the server.</strong> The image generated, but the Worker could not persist it — no storage bucket is configured, or the write failed (very large images are a common cause). Download it now; it is gone when you leave this page.
                  </p>
                  {result.persist_error && (
                    <p className="mt-1.5 text-[11px] font-mono uppercase tracking-[0.12em] text-[color:var(--page-faint)]">
                      {result.persist_error}
                    </p>
                  )}
                </div>
              )}
              {resolveImage(result.image_url) && (
                <div className="rounded-md overflow-hidden border border-[color:var(--rule-dim)] bg-[color:var(--ink)]">
                  <img src={resolveImage(result.image_url)} alt={prompt} className="w-full max-h-[500px] object-contain" />
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono uppercase tracking-[0.12em] text-[color:var(--page-faint)]">
                <span>{modelOptions.find(o => o.id === model)?.label || result.model || model}</span>
                {result.seed && <span>Seed: {result.seed}</span>}
                {result.resolution && <span>{result.resolution}</span>}
                {result.duration_ms && <span>{(result.duration_ms / 1000).toFixed(1)}s</span>}
                <span className="tabular-nums">{new Date().toISOString().slice(0, 10)}</span>
              </div>
              <div className="text-[0.92rem] text-[color:var(--page-dim)] font-sans leading-relaxed">{prompt}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
