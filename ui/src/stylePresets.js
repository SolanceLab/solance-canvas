// ── Canvas style presets ───────────────────────────────────────────
// Single source of truth, imported by Canvas.jsx + CanvasSettings.jsx.
// Each preset's `prompt` is appended after the subject as the
// `style_prompt`. Fragments are model-agnostic natural language (work
// across Seedream/FLUX/Grok/gpt-image/Gemini) — no weights or
// model-specific tokens.

export const DEFAULT_STYLES = [
  // ── Photographic ─────────────────────────────────────────────────
  { id: 'cinematic', name: 'Cinematic', category: 'Photographic', prompt: 'cinematic film still, dramatic volumetric lighting, shallow depth of field, 35mm, muted color grade, atmospheric mood, anamorphic' },
  { id: 'studio-portrait', name: 'Studio Portrait', category: 'Photographic', prompt: 'studio portrait, soft key light with subtle fill, seamless backdrop, flattering catchlights, 85mm lens, crisp detail, professional headshot' },
  { id: 'analog-film', name: 'Analog Film', category: 'Photographic', prompt: '35mm analog film photograph, warm grain, soft halation, faded highlights, nostalgic color cast, gentle vignette, vintage stock' },
  { id: 'black-and-white', name: 'Black & White', category: 'Photographic', prompt: 'black and white photograph, rich tonal range, deep blacks, bright highlights, fine grain, high contrast monochrome, timeless' },
  { id: 'film-noir', name: 'Film Noir', category: 'Photographic', prompt: 'film noir still, high-contrast chiaroscuro, hard shadows, venetian blind light, smoky atmosphere, moody monochrome, 1940s mystery' },
  { id: 'golden-hour', name: 'Golden Hour', category: 'Photographic', prompt: 'golden hour photograph, warm low sun, long soft shadows, glowing rim light, amber tones, hazy backlight, serene' },
  { id: 'macro', name: 'Macro', category: 'Photographic', prompt: 'extreme macro photograph, razor-sharp focus on tiny subject, creamy bokeh background, intricate texture detail, soft diffused light' },
  { id: 'long-exposure', name: 'Long Exposure', category: 'Photographic', prompt: 'long exposure photograph, silky motion blur, light trails, smooth flowing water, still sharp subject, dreamy time-lapse' },
  { id: 'fashion-editorial', name: 'Fashion Editorial', category: 'Photographic', prompt: 'high fashion editorial photograph, bold styling, dramatic studio lighting, glossy magazine finish, striking pose, sleek composition, couture' },
  { id: 'documentary', name: 'Documentary', category: 'Photographic', prompt: 'documentary photojournalism, candid natural light, authentic unposed moment, gritty realism, reportage framing, true-to-life color' },
  { id: 'product-shot', name: 'Product Shot', category: 'Photographic', prompt: 'commercial product photograph, clean studio lighting, seamless white background, soft reflections, crisp detail, balanced composition, advertising quality' },
  { id: 'architectural', name: 'Architectural', category: 'Photographic', prompt: 'architectural photograph, clean geometric lines, balanced symmetry, natural daylight, wide angle, corrected perspective, minimal crisp detail' },

  // ── Illustration ─────────────────────────────────────────────────
  { id: 'anime', name: 'Anime', category: 'Illustration', prompt: 'anime illustration, clean cel shading, expressive large eyes, vibrant colors, crisp linework, dynamic composition, Japanese animation style' },
  { id: 'manga', name: 'Manga', category: 'Illustration', prompt: 'black and white manga panel, bold ink linework, screentone shading, dramatic speed lines, expressive characters, high contrast, comic page' },
  { id: 'comic-book', name: 'Comic Book', category: 'Illustration', prompt: 'comic book art, bold outlines, flat saturated colors, halftone dot shading, dynamic action poses, ink-heavy, vintage superhero style' },
  { id: 'graphic-novel', name: 'Graphic Novel', category: 'Illustration', prompt: 'graphic novel illustration, moody muted palette, textured ink shading, cinematic framing, expressive linework, mature atmospheric tone' },
  { id: 'flat-vector', name: 'Flat Vector', category: 'Illustration', prompt: 'flat vector illustration, clean geometric shapes, bold solid colors, minimal shading, crisp edges, modern graphic design, scalable' },
  { id: 'line-art', name: 'Line Art', category: 'Illustration', prompt: 'minimal line art, single-weight black contours, clean white background, no shading, elegant continuous lines, simple and refined' },
  { id: 'childrens-book', name: "Children's Book", category: 'Illustration', prompt: "children's book illustration, soft rounded shapes, warm cheerful palette, gentle textures, whimsical friendly characters, cozy storybook charm" },
  { id: 'storybook-watercolor', name: 'Storybook Watercolor', category: 'Illustration', prompt: 'storybook watercolor illustration, soft washes, delicate pencil outlines, muted pastel tones, dreamy textured paper, gentle whimsical mood' },
  { id: 'kawaii-sticker', name: 'Kawaii Sticker', category: 'Illustration', prompt: 'cute kawaii sticker, bold clean outline, glossy pastel colors, simple rounded chibi shapes, die-cut white border, playful adorable' },
  { id: 'editorial-illustration', name: 'Editorial Illustration', category: 'Illustration', prompt: 'editorial illustration, conceptual metaphor, limited bold palette, textured shapes, clever composition, modern magazine art, expressive simplicity' },

  // ── Painterly ────────────────────────────────────────────────────
  { id: 'oil-painting', name: 'Oil Painting', category: 'Painterly', prompt: 'oil painting, rich impasto brushstrokes, layered glazing, warm classical palette, visible canvas texture, dramatic light, fine art' },
  { id: 'watercolor', name: 'Watercolor', category: 'Painterly', prompt: 'watercolor painting, translucent washes, soft bleeding edges, granulating pigment, white paper showing through, loose expressive, delicate' },
  { id: 'gouache', name: 'Gouache', category: 'Painterly', prompt: 'gouache painting, opaque matte color, flat layered shapes, soft visible brushwork, muted vintage palette, textured handmade feel' },
  { id: 'impressionist', name: 'Impressionist', category: 'Painterly', prompt: 'impressionist painting, broken dappled brushstrokes, vibrant light, soft focus, plein air color, shimmering atmosphere, loose expressive' },
  { id: 'sumi-e', name: 'Sumi-e Ink Wash', category: 'Painterly', prompt: 'sumi-e ink wash painting, minimal black brushstrokes, gradient gray washes, expressive negative space, rice paper, zen simplicity, calligraphic' },
  { id: 'acrylic', name: 'Acrylic', category: 'Painterly', prompt: 'acrylic painting, bold vivid color, confident brushstrokes, layered texture, crisp edges, matte finish, contemporary fine art' },
  { id: 'renaissance', name: 'Renaissance', category: 'Painterly', prompt: 'Renaissance oil painting, sfumato soft transitions, balanced composition, warm earth tones, naturalistic figures, classical light, old master technique' },
  { id: 'baroque', name: 'Baroque', category: 'Painterly', prompt: 'Baroque painting, intense chiaroscuro, dramatic spotlight, rich deep colors, dynamic movement, ornate detail, theatrical grandeur' },

  // ── Digital / Concept ────────────────────────────────────────────
  { id: 'digital-painting', name: 'Digital Painting', category: 'Digital / Concept', prompt: 'digital painting, smooth blended brushwork, rich lighting, vibrant color, detailed rendering, painterly texture, polished illustration' },
  { id: 'concept-art', name: 'Concept Art', category: 'Digital / Concept', prompt: 'concept art, cinematic composition, atmospheric perspective, moody lighting, detailed environment, professional game and film design, evocative' },
  { id: 'matte-painting', name: 'Matte Painting', category: 'Digital / Concept', prompt: 'digital matte painting, vast epic landscape, photoreal detail, cinematic depth, atmospheric haze, dramatic scale, film background art' },
  { id: 'splash-art', name: 'Splash Art', category: 'Digital / Concept', prompt: 'splash art, dynamic heroic pose, dramatic rim lighting, energetic brushwork, vivid saturated color, painterly motion, game key art' },
  { id: 'dark-fantasy', name: 'Dark Fantasy', category: 'Digital / Concept', prompt: 'dark fantasy art, ominous atmosphere, muted desaturated palette, dramatic shadows, intricate gothic detail, moody fog, grim and epic' },

  // ── 3D / Render ──────────────────────────────────────────────────
  { id: '3d-render', name: '3D Render', category: '3D / Render', prompt: '3D render, photorealistic materials, global illumination, soft ray-traced shadows, studio lighting, high detail, octane render quality' },
  { id: 'stylized-3d', name: 'Stylized 3D', category: '3D / Render', prompt: 'stylized 3D character render, smooth subsurface skin, soft cinematic lighting, expressive proportions, vibrant color, polished animated film quality' },
  { id: 'claymation', name: 'Claymation', category: '3D / Render', prompt: 'claymation style, handmade clay texture, visible fingerprints, soft studio lighting, stop-motion charm, tactile matte surfaces, playful' },
  { id: 'low-poly', name: 'Low Poly', category: '3D / Render', prompt: 'low poly 3D, faceted geometric shapes, flat shaded triangles, minimal palette, clean simple forms, stylized digital craft, crisp' },
  { id: 'isometric', name: 'Isometric', category: '3D / Render', prompt: 'isometric illustration, 45-degree angle, miniature diorama, clean precise geometry, soft ambient occlusion, tidy color blocks, game asset' },

  // ── Retro / Aesthetic ────────────────────────────────────────────
  { id: 'synthwave', name: 'Synthwave', category: 'Retro / Aesthetic', prompt: 'synthwave retrowave art, neon magenta and cyan glow, sunset grid horizon, chrome highlights, 1980s aesthetic, dark atmospheric haze' },
  { id: 'vaporwave', name: 'Vaporwave', category: 'Retro / Aesthetic', prompt: 'vaporwave aesthetic, pastel pink and teal, glitch artifacts, retro 90s computer graphics, classical statues, dreamy surreal nostalgia' },
  { id: 'cyberpunk', name: 'Cyberpunk', category: 'Retro / Aesthetic', prompt: 'cyberpunk scene, neon-lit rain-slick streets, holographic signs, dense futuristic city, moody teal and magenta, high-tech dystopia, atmospheric' },
  { id: 'steampunk', name: 'Steampunk', category: 'Retro / Aesthetic', prompt: 'steampunk style, brass gears and copper pipes, Victorian machinery, warm sepia tones, intricate clockwork detail, retro-futuristic invention' },
  { id: 'art-deco', name: 'Art Deco', category: 'Retro / Aesthetic', prompt: 'art deco design, bold symmetry, sleek geometric patterns, gold and black palette, elegant streamlined forms, 1920s luxury, ornamental' },
  { id: 'art-nouveau', name: 'Art Nouveau', category: 'Retro / Aesthetic', prompt: 'art nouveau illustration, flowing organic lines, ornate floral motifs, elegant curves, muted gold palette, decorative border, Mucha-inspired' },
  { id: 'pop-art', name: 'Pop Art', category: 'Retro / Aesthetic', prompt: 'pop art, bold flat primary colors, thick black outlines, halftone dots, high contrast, comic-inspired graphic, Warhol-style retro punch' },
  { id: 'ukiyo-e', name: 'Ukiyo-e', category: 'Retro / Aesthetic', prompt: 'ukiyo-e woodblock print, flat color planes, bold outlines, delicate gradients, traditional Japanese composition, muted natural palette, Edo period' },
  { id: 'pixel-art', name: 'Pixel Art', category: 'Retro / Aesthetic', prompt: 'pixel art, crisp blocky pixels, limited retro palette, dithered shading, 16-bit video game sprite, clean grid, nostalgic' },
  { id: 'bauhaus', name: 'Bauhaus', category: 'Retro / Aesthetic', prompt: 'bauhaus design, primary color blocks, clean geometric shapes, minimal grid composition, bold sans-serif sensibility, functional modernist abstraction' },
]

// ── localStorage migration ────────────────────────────────────────
// A user's custom + edited style presets live in localStorage, so renaming
// the storage key blind would silently throw them away. Read the current
// key, fall back to the legacy one, and let the next save write the
// current key.
//
// The legacy key is deliberately NOT deleted: if a deploy carrying a
// renamed key ever gets rolled back, the old build reads the legacy key
// and the user's presets are still there. It costs a few KB of localStorage
// and buys a safe reverse gear. These key strings are carried over verbatim
// from where this component was ported from — if you rename either key in
// your own fork, keep this same read-both / write-one pattern, deliberately,
// not blind.
export const STYLES_STORAGE_KEY = 'hos_canvas_styles'
export const LEGACY_STYLES_STORAGE_KEY = 'hos_generator_styles'

// Returns the parsed stored presets, or null if there are none to read.
// Callers pass the result through withDefaultStyles().
export function readStoredStyles() {
  try {
    const saved = localStorage.getItem(STYLES_STORAGE_KEY)
      || localStorage.getItem(LEGACY_STYLES_STORAGE_KEY)
    if (!saved) return null
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

// Merge any default presets the user doesn't already have (by id) into their
// stored set — so new defaults appear without wiping custom/edited presets.
// Appends missing defaults; preserves existing order + user edits.
export function withDefaultStyles(stored) {
  if (!Array.isArray(stored) || stored.length === 0) return DEFAULT_STYLES
  const have = new Set(stored.map(s => s && s.id))
  const missing = DEFAULT_STYLES.filter(d => !have.has(d.id))
  return missing.length ? [...stored, ...missing] : stored
}

export default DEFAULT_STYLES
