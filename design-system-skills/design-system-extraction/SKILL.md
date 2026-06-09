---
name: design-system-extraction
description: Extract a production-ready design system from a screenshot, UI image, or live-site capture — color, typography, spacing, radius, elevation, and components — via a structured multi-pass vision pipeline that quantizes noisy pixels into clean DTCG tokens, with observed-vs-inferred confidence labels. Use when reverse-engineering a reference UI into reusable tokens.
tags: [design-systems, vision, extraction, tokens, reverse-engineering]
---
# Design System Extraction — turn an image into a system

You are handed a screenshot, a UI mockup, a photo of a screen, or a captured web page, and asked to "pull the design system out of it." The naive move — eyedrop a few colors, guess a font — produces a pile of literals, not a system. This skill is the disciplined pipeline that turns noisy pixels into a **clean, tiered, reusable token set + component inventory**, and is honest about what a flat image can and cannot tell you.

The hard part is not *seeing* the values. It is **quantization**: a screenshot gives you `#2563EB` and `#2462EA` for the same button (anti-aliasing, JPEG bleed, retina downscaling), and `15px`, `16px`, `17px` gaps that are all meant to be one `16px` step. Extraction without normalization just launders noise into tokens. Your job is to recover the *intended* system behind the measured pixels.

## What an image can and cannot give you

**Can:** the visible palette, type sizes/weights/hierarchy, spacing rhythm, corner radii, shadow layers, the components present in *this* state, and the layout grid.

**Cannot (mark these explicitly, never invent them):**
- **Interaction states** you can't see — hover, focus, active, disabled, error. A static shot shows one state. Flag the rest as `inferred` or `missing`.
- **The semantic intent** — whether that blue is `primary` or just a one-off accent. You infer roles; you don't read them.
- **Exact values** — pixel measurement is ±1–2px and colors drift with compression. Round to the system, don't transcribe the noise.
- **Tokens behind gradients/images/video**, text rendered as raster, or anything off-screen / scrolled away.
- **Responsive behavior** from a single breakpoint. Need ≥2 captures (mobile + desktop) to infer breakpoints.

Output a **confidence label per dimension** — `observed` (measured directly), `inferred` (reasoned from convention), `missing` (not derivable). This is the difference between an honest extraction and a hallucinated one.

## The pipeline

```
1. Capture & condition   → know the scale factor; upscale text regions
2. Multi-pass vision     → one focused pass per dimension (don't ask for everything at once)
3. Measure & sample      → raw values with positions
4. Quantize & normalize  → snap to a base unit; dedupe the palette; fit scales
5. Assign semantic roles → primitive → semantic token tiers
6. Emit DTCG tokens      → + component inventory + confidence map
7. Validate              → contrast, re-render sanity, reproduces-the-source
```

### 1. Capture & condition
- Record the **scale factor**. A retina screenshot is 2× — a "32px" measured height is a 16px CSS value. Halve measurements on @2x captures or every number doubles.
- If text is small/blurry, request a **higher-resolution crop** of the type specimen region before reading sizes — guessing weights off 11px blurred text is how you get `600` when it's `500`.
- Multiple images (states, pages, breakpoints) → process each, then **merge** (step 8). One image → note the single-state limitation.

### 2. Multi-pass vision (the prompts)

Do **not** ask a vision model "extract the design system" in one shot — it averages everything and invents the gaps. Run **one focused pass per dimension**, each with a strict schema. These are the prompts (adapt the wording to your vision tool; keep the structure):

**Pass A — Color**
> Analyze ONLY color in this UI image. Return JSON: `{ "swatches": [{ "hex": "#RRGGBB", "where": "<element/region>", "approx_coverage": "<dominant|accent|rare>" }], "notes": "<gradients, transparency, dark/light mode>" }`. Sample the actual fills — background, surfaces, text, borders, the primary action, accents. Do not normalize or dedupe yet; report what you see, including near-duplicates. Ignore antialiased edge pixels.

**Pass B — Typography**
> Analyze ONLY typography. Return JSON: `{ "faces": [{ "role": "<heading|body|mono|ui>", "family_guess": "<best-guess family + serif|sans|mono|display>", "confidence": "<high|med|low>" }], "specimens": [{ "text": "<sample>", "px_size": <n>, "weight_guess": <100-900>, "line_height_px": <n>, "letter_spacing": "<tight|normal|wide>", "role": "<h1|h2|...|body|caption|label>" }] }`. Estimate cap-height-based px sizes. Note if a number is uncertain.

**Pass C — Spacing & layout**
> Analyze ONLY spacing and layout. Return JSON: `{ "gaps_px": [<measured gaps between repeated elements>], "paddings_px": [{ "component": "<button|card|input>", "padding": "<t r b l>" }], "container_max_px": <n|null>, "columns": <n|null>, "alignment": "<grid|stacked|asymmetric>" }`. Measure repeated rhythms (list item gaps, section padding), not one-offs.

**Pass D — Shape & elevation**
> Analyze ONLY corner radius and shadows. Return JSON: `{ "radii_px": [{ "component": "<button|card|input|avatar>", "radius": <n> }], "shadows": [{ "component": "<card|dropdown|modal>", "approx": "<x y blur spread + color/opacity>" , "layers": <n> }], "borders": [{ "component": "<...>", "width_px": <n>, "style": "<solid|...>" }] }`.

**Pass E — Component inventory**
> Inventory every distinct UI component visible. Return JSON array: `[{ "type": "<button|input|card|nav|badge|toggle|tab|...>", "variants_visible": ["<primary|secondary|...>"], "anatomy": "<parts>", "states_visible": ["<default|...>"], "states_not_visible": ["<hover|focus|disabled|error>"] }]`. List states you CANNOT see as `states_not_visible` — do not fabricate them.

### 3–4. Quantize & normalize — the step that makes it a *system*

This is where extraction earns its keep. Raw passes give noise; you fit the underlying scale.

- **Color dedupe.** Cluster swatches within ~ΔE < 3 (perceptually identical) into one token. `#2563EB` + `#2462EA` → one `blue.600`. Build ramps in **OKLCH** for perceptual evenness; if you only have 2–3 stops, generate the missing steps by interpolating lightness, and mark them `inferred`. Detect dark mode (is the bg lightness < 50%?) and extract both modes if both are present.
- **Spacing base unit.** Take all measured gaps/paddings, divide by candidate bases (4, 8), and pick the base that most values are near-multiples of. Snap each value to the nearest multiple: `15→16, 23→24, 31→32` on a 8pt grid (4pt for denser UIs). Emit a scale (`space.1=4, space.2=8, space.3=12, space.4=16, …`), not raw pixels.
- **Type scale.** Sort px sizes, dedupe near-equal (±1px), and fit a ratio (common: 1.125 / 1.2 / 1.25 / 1.333). Express as a named scale (`text.xs…text.4xl`). Snap weights to the standard ladder (100–900); don't emit `513`.
- **Radius & shadow** snap to a small scale (`radius.sm/md/lg/full`; `shadow.sm/md/lg`).

Rule: **if two measured values are within measurement error of one scale step, they ARE that step.** Preserving the noise is the most common extraction failure.

### 5. Semantic roles (primitive → semantic)

Map deduped primitives to roles by **position and convention**, and label the inference:
- Largest-area neutral → `color.bg.default`; the slightly-raised neutral → `color.surface`.
- Highest-contrast text neutral → `color.text.default`; muted → `color.text.muted`.
- The saturated color on the main CTA → `color.action.primary` (this is `inferred`, not read).
- Hairline neutral on dividers/inputs → `color.border.default`.

Two tiers minimum: **primitive** (`blue.600 = #2563EB`) and **semantic** (`color.action.primary = {blue.600}`). Components reference semantics, never primitives — same discipline as the `design-tokens` skill.

### 6. Output — DTCG tokens + inventory + confidence

Emit [W3C DTCG](https://www.designtokens.org) JSON (pairs with the `design-tokens` skill's Style Dictionary pipeline):

```json
{
  "color": {
    "blue": { "600": { "$type": "color", "$value": "#2563eb", "$extensions": { "confidence": "observed" } } },
    "action": { "primary": { "$type": "color", "$value": "{color.blue.600}", "$extensions": { "confidence": "inferred" } } }
  },
  "space": { "4": { "$type": "dimension", "$value": "16px", "$extensions": { "confidence": "observed" } } },
  "fontSize": { "base": { "$type": "dimension", "$value": "16px" } },
  "radius": { "md": { "$type": "dimension", "$value": "8px" } }
}
```

Plus a **component inventory** (type · variants · anatomy · observed states · missing states) and a **confidence map** summarizing what's solid vs guessed.

### 7. Validate
- **Contrast:** run every text-on-bg semantic pair through WCAG (AA = 4.5:1 body / 3:1 large) — the `accessibility-and-inclusive-design` skill. Flag failures; the source may itself be inaccessible.
- **Re-render sanity:** mentally (or actually) rebuild one component from the tokens and compare to the crop. If it doesn't reproduce, your quantization snapped too hard or the role mapping is wrong.
- **Round-trip the palette:** the deduped palette should still visually cover the source — if you lost the accent, you over-clustered.

## Multi-image merge (states & breakpoints)
- **States** (hover/focus/disabled captures of the same component) → fill the `states_not_visible` gaps from step 2E with `observed` values.
- **Breakpoints** (mobile + desktop of the same page) → infer breakpoint(s) where layout changes; extract per-breakpoint spacing/columns; promote shared values to base tokens. See `responsive-and-multi-device`.
- **Pages** → union the component inventories; reconcile conflicting values toward the more frequent one.

## Pitfalls (each one silently corrupts the output)
- **Retina ×2 not halved** → every dimension doubled. Always establish scale first.
- **Antialiased/compressed color bleed** → phantom palette entries. Sample fills, not edges; cluster by ΔE.
- **Transcribing noise as tokens** → `15/16/17px` shipped as three values. Snap to the grid.
- **Inventing unseen states** → fabricated hover/disabled colors. Mark `missing`, ask for more captures.
- **Single-pass "extract everything"** → averaged mush. One focused pass per dimension.
- **Primitive-only output** → a flat color list, not a system. Always add the semantic tier.
- **Treating the screenshot as ground truth** → it's one rendering of an unknown source; report confidence, not certainty.

## Related skills
`design-tokens` (the tier model + DTCG export pipeline this feeds) · `color-and-elevation` (OKLCH ramps, contrast, dark mode) · `typography-system` (type scales) · `grid-and-spacing` (the 8pt base) · `components-and-states` (the full state matrix you're inferring) · `accessibility-and-inclusive-design` (the contrast gate).
