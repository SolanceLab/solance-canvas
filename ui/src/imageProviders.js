// ── Image generation provider catalog ──────────────────────────────
// Every provider here works with the Worker's own env key when one is
// configured, OR a visitor key added in CanvasSettings — stored only in
// this browser's localStorage, sent per-request as an X-Provider-Key
// header. Neither path is baked into a provider's entry; the Worker
// decides per-request which key it actually had.
//
// Keep this shape stable + extension-friendly: add a provider here, wire a
// matching handler in your backend, and it shows up in the model dropdown.

const IMAGE_PROVIDERS = [
  {
    id: 'grok',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    endpoint: '/images/generations',
    models: [
      { id: 'grok-imagine-image', label: 'Grok Imagine' },
    ],
    defaultModel: 'grok-imagine-image',
    keyEnv: 'XAI_API_KEY',
    supportsAspect: true,
    supportsStyle: false,
    authHeader: 'Bearer',
    note: "Works with the Worker's XAI_API_KEY, or add your own key in Settings.",
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    endpoint: '/images/generations',
    models: [
      { id: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2' },
      { id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro' },
      { id: 'gemini-2.5-flash-image', label: 'Nano Banana (legacy)' },
    ],
    defaultModel: 'gemini-3.1-flash-image-preview',
    keyEnv: 'GOOGLE_API_KEY',
    supportsAspect: true,
    supportsStyle: false,
    authHeader: 'Bearer',
    note: 'Google Gemini image lineage. Nano Banana 2 = fast tier (default). Pro = flagship with "thinking" mode. Original Nano Banana kept as legacy.',
  },

  {
    id: 'agnes',
    name: 'Agnes AI',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    endpoint: '/images/generations',
    models: [
      { id: 'agnes-image-2.1-flash', label: 'Agnes Image 2.1 Flash' },
      { id: 'agnes-image-2.0-flash', label: 'Agnes Image 2.0 Flash (legacy)' },
    ],
    defaultModel: 'agnes-image-2.1-flash',
    keyEnv: 'AGNES_API_KEY',
    supportsAspect: true,
    supportsStyle: false,
    authHeader: 'Bearer',
    // Dev note: the account also exposes chat and video models — check
    // GET /v1/models against your own account before assuming this list
    // is current; providers add and retire models without notice.
    note: 'Text-to-image, image-to-image and multi-image composition. NOTE: Agnes is a gateway run by a third party (Sapiens AI, Singapore), not a first-party lab — prompts and reference images transit that third party, whose docs state nothing about data retention or training rights. Good for the experimental lane; keep sensitive work on engines whose terms you trust. 4K may exceed some backends’ request size limits (unmeasured).',
  },

  {
    id: 'fal',
    name: 'fal.ai',
    baseUrl: 'https://fal.run',
    endpoint: '',  // model slug becomes the path; backend assembles
    models: [
      { id: 'fal-ai/bytedance/seedream/v4', label: 'Seedream 4.0 (via fal)' },
      { id: 'xai/grok-imagine', label: 'Grok Imagine (via fal)' },
      { id: 'openai/gpt-image-2', label: 'GPT Image 2 (via fal)' },
      { id: 'openai/gpt-image-1.5', label: 'GPT Image 1.5 (via fal)' },
      { id: 'openai/gpt-image-1', label: 'GPT Image 1 (via fal)' },
      // Added from the 2026-08-16 provider scout (docs/provider-scout-2026-08-16.md).
      // Slugs verified against fal's live catalog. Caveats: reference images are
      // untested on these three (the generic `<model>/edit` slug the backend
      // derives may not exist for them), and Reve's per-image price was
      // conflicting across sources at scout time — check fal's model page
      // before leaning on it.
      { id: 'fal-ai/ideogram/v3', label: 'Ideogram V3 (via fal) — typography' },
      { id: 'fal-ai/recraft/v4/text-to-vector', label: 'Recraft V4 (via fal) — vector/SVG' },
      { id: 'fal-ai/reve/text-to-image', label: 'Reve 2.1 (via fal)' },
    ],
    defaultModel: 'fal-ai/bytedance/seedream/v4',
    keyEnv: 'FAL_KEY',
    supportsAspect: true,
    supportsStyle: false,
    authHeader: 'Key',  // fal.ai uses "Key <key>", not "Bearer"
    // Dev note: fal.ai also hosts FLUX.2, Hunyuan, Qwen-Image, Recraft, Ideogram,
    // and Seedance (video) — add models above once their fal slugs are verified
    // against fal's own catalog.
    note: 'Built-in fal.ai engines: Seedream 4.0 (strong multi-reference identity, default) and Grok Imagine (cleaner anatomy), plus frontier OpenAI image models without Persona verification. Seedream + Grok support image references via the edit endpoint.',
  },
  {
    id: 'openai',
    name: 'OpenAI (direct)',
    baseUrl: 'https://api.openai.com/v1',
    endpoint: '/images/generations',
    models: [
      { id: 'gpt-image-2', label: 'GPT Image 2' },
      { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
      { id: 'gpt-image-1', label: 'GPT Image 1' },
      { id: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
    ],
    defaultModel: 'gpt-image-2',
    keyEnv: 'OPENAI_API_KEY',
    supportsAspect: true,
    supportsStyle: false,
    authHeader: 'Bearer',
    note: 'Direct OpenAI requires API Organization Verification (Persona biometric ID check). Use the fal.ai entry above to skip verification.',
  },
  {
    id: 'venice',
    name: 'Venice.ai',
    baseUrl: 'https://api.venice.ai/api/v1',
    endpoint: '/image/generate',
    models: [
      { id: 'qwen-image-3', label: 'Qwen Image 3' },
      { id: 'qwen-image-3-pro', label: 'Qwen Image 3 Pro' },
      { id: 'qwen-image-3-edit', label: 'Qwen Image 3 Edit (needs a reference)' },
      { id: 'qwen-image-3-pro-edit', label: 'Qwen Image 3 Pro Edit (needs a reference)' },
      { id: 'qwen-edit-uncensored', label: 'Qwen Edit Uncensored (needs a reference)' },
      { id: 'venice-sd35', label: 'Venice SD3.5' },
      { id: 'lustify-v7', label: 'Lustify v7' },
      { id: 'lustify-sdxl', label: 'Lustify SDXL' },
    ],
    defaultModel: 'qwen-image-3',
    keyEnv: 'VENICE_API_KEY',
    supportsAspect: true,
    supportsStyle: false,
    authHeader: 'Bearer',
    // These three are Venice's own models — text-to-image only, width/height
    // (the backend maps aspect → dimensions ÷16, ≤1280). The wider Venice
    // catalog (FLUX, Seedream, Nano Banana, GPT Image …) duplicates engines
    // already in this list, so only Venice's distinctive models are exposed.
    note: 'Privacy-first host; its written policy does not prohibit adult content, its privacy policy states prompts and outputs are neither stored nor accessible and model providers run under zero-retention. The backend sends safe_mode:false (both endpoints default it ON). The three "Edit" models take a reference image and route to Venice\'s edit endpoint — one reference is sent, and likeness uploads are processed by a third-party sub-processor (BytePlus, Singapore) per Venice\'s privacy policy, so treat photographs of real people as a deliberate choice. The rest are text-to-image. Works with the Worker\'s VENICE_API_KEY, or add your own key in Settings.',
  },
  {
    id: 'stability',
    name: 'Stability AI',
    baseUrl: 'https://api.stability.ai/v2beta',
    endpoint: '/stable-image/generate/sd3',
    models: [
      { id: 'sd3.5-large', label: 'SD 3.5 Large' },
      { id: 'sd3.5-medium', label: 'SD 3.5 Medium' },
    ],
    defaultModel: 'sd3.5-large',
    keyEnv: 'STABILITY_API_KEY',
    supportsAspect: true,
    supportsStyle: true,
    authHeader: 'Bearer',
    note: 'SD 3.5 line — check Stability’s release notes for anything newer.',
  },
]

export default IMAGE_PROVIDERS
