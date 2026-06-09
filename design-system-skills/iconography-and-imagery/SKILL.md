---
name: iconography-and-imagery
description: Reference-grade guide to building and shipping icon systems (grids, optical sizing, variable axes, SVG delivery) and imagery (aspect ratios, art direction, modern formats, performance) with copy-pasteable code, exact numbers, and cross-device rules.
tags: [design-systems, icons, imagery, svg, illustration]
---
# Iconography & Imagery

Icons and images carry most of a UI's pixels and most of its weight. Get the grid, the optics, and the delivery format right and everything reads sharper and loads faster. This is the working reference: build the icon set on a disciplined grid, ship it as inline SVG or a sprite, and serve images as AVIF/WebP with a reserved aspect-ratio box.

## 1. Icon grid & construction

Every icon lives on a square pixel grid. Standardize one base, scale by clean multiples.

| Base grid | Used by | Live area (padding) | Stroke | Corner radius |
|-----------|---------|---------------------|--------|---------------|
| 16px | dense toolbars, inline text icons | 14px (1px) | 1.5px | 1px |
| 20px | compact UI (tables, menus) | 18px (1px) | 1.5px | 1.5px |
| **24px** | **default UI standard (Material)** | **20px (2px)** | **2px** | **2px** |
| 40px | large touch targets, feature tiles | 34px (3px) | 2.5px | 3px |
| 48px | hero / marketing | 40px (4px) | 3px | 4px |

**Keyline shapes** anchor optical consistency. In a 24px box the canonical keylines are: square 18×18, circle ⌀20, vertical rectangle 16×20, horizontal rectangle 20×16. Snap each glyph to the keyline that matches its dominant shape so a circle (◎) and a square (▣) feel the same visual weight even though their bounding boxes differ.

```
24px box, 2px padding → 20px live area
┌────────────────────────┐  ← 24px artboard
│  ┌──────────────────┐  │
│  │   keyline 20×20  │  │  ← optical balance happens HERE
│  │   ┌──────────┐   │  │
│  │   │ glyph    │   │  │
│  │   └──────────┘   │  │
│  └──────────────────┘  │
└────────────────────────┘
```

**Rules**
- **Pixel-snap** all anchors to whole or half pixels at the base size. A 2px stroke centered on a whole-pixel coordinate renders crisp; a stroke on x=12.37 renders blurry. For odd stroke widths (1px) center on the *half*-pixel (x=12.5) so the stroke lands inside one pixel column; for even widths (2px) center on the whole pixel.
- **Optical alignment over mathematical centering.** A triangle (play ▶) centered by its bounding box looks left-heavy — nudge it ~1px right toward its visual centroid. Asymmetric glyphs almost always need a manual optical nudge.
- **Consistent corner radius** across the whole set. Don't mix 1px and 4px corners; pick one radius scaled per base size.
- **Terminal & joint consistency**: choose round vs. butt line caps and round vs. miter joins once (`stroke-linecap`, `stroke-linejoin`) and apply set-wide. Mismatched caps read as two different designers.
- **Optical sizing**: a stroke that reads as 2px at 24px becomes hairline at 16px and chunky at 48px. Maintain *apparent* weight by increasing relative stroke at small sizes and drawing dedicated small variants (don't just `transform: scale()` a 24px icon down to 16px — it goes muddy). Material ships 20/24/40/48 masters for exactly this reason.

## 2. Icon style systems

| Style | When | Notes |
|-------|------|-------|
| **Outline (stroke)** | default / idle states | lighter, modern, neutral; most flexible |
| **Filled (solid)** | selected / active / emphasis | higher contrast, signals "on" |
| **Duotone** | brand accent, illustrative chips | two opacities of one hue, or two tokens |
| **Two-tone / multicolor** | logos, status, rich UI | reserve for meaning, not decoration |

**The selected-state convention:** outline = inactive, filled = active. A tab bar shows outline icons; the current tab fills. This is learned, universal, and keeps you from inventing a new affordance.

**Material Symbols (variable font, 2024–2026)** exposes 4 axes — tune them with `font-variation-settings`, animate them with a transition:

```css
.material-symbols-outlined {
  font-variation-settings:
    'FILL' 0,    /* 0 outline → 1 filled (animatable for select states) */
    'wght' 400,  /* 100–700 weight, match adjacent text weight */
    'GRAD' 0,    /* -25…200 emphasis; +50 on dark bg, -25 on light */
    'opsz' 24;   /* 20–48 OPTICAL SIZE — set to the rendered px size */
  transition: font-variation-settings 200ms ease;
}
.nav-item[aria-current='page'] .material-symbols-outlined {
  font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}
```
> Always set `opsz` to the actual render size — that is what optical sizing is for. GRAD is a finer dial than wght for dark-mode legibility.

**SF Symbols (Apple platforms)** mirror SF font weights (`.ultraLight`…`.black`); pick the weight that matches the adjacent text. Rendering modes: **monochrome** (single tint), **hierarchical** (one hue, layered opacities), **palette** (you supply 2–3 colors), **multicolor** (built-in semantic colors, e.g. yellow warning). Align symbols to text via the SF baseline so glyph and label share a cap line.

## 3. Icon usage

- **Pair icons with labels.** Icon-only is only safe for the ~12 truly universal glyphs (search, close, menu, back, play). Everything else is a guessing game. Icon-only controls **must** carry an accessible name and ideally a tooltip:
  ```html
  <button aria-label="Delete file">
    <svg aria-hidden="true" focusable="false" width="20" height="20">…</svg>
  </button>
  ```
- **Size to cap-height, not line-height.** An inline icon next to 16px text should be ~16–20px (≈1em–1.25em) and vertically centered on the text's cap height. Match by eye — geometric icons often need to be slightly *larger* than the cap height to feel equal.
- **Color with `currentColor`** so icons inherit text color and theme automatically (see §4).
- **Touch target ≥ 44×44px (iOS) / 48×48dp (Android)** regardless of the glyph size. A 20px icon still needs 44px of hittable padding.
- **Avoid ambiguous metaphors**: a floppy disk for "save" survives only by convention; a heart vs. star vs. bookmark all mean "save for later" to different users — pick one and label it. Never overload one glyph with two meanings in the same product.
- **Recognizability ladder**: ~12 glyphs are truly universal (search, close ✕, menu ☰, back ‹, home, settings ⚙, share, trash, play/pause, plus, check, chevron). One tier down (filter, sort, sync, attach) is *familiar but not certain* — keep a label. Anything domain-specific (a custom "reconcile" icon) is decorative until proven; it never flies solo.
- **Direction & RTL**: mirror directional icons (back, next, list-indent, undo's curve) for right-to-left locales with `[dir="rtl"] .icon{ transform:scaleX(-1) }`; never mirror clocks, logos, or media-progress glyphs.

## 4. SVG delivery — the technical core

| Method | Best for | Color | Caching | Verdict |
|--------|----------|-------|---------|---------|
| **Inline `<svg>`** | icons that change color/animate, ≤~40 on a page | `currentColor`, per-instance CSS | none (in HTML) | best for interactivity |
| **SVG sprite + `<use>`** | large reusable sets | `currentColor` works | one cached file | best for scale |
| **`<img src=".svg">`** | decorative, static, isolated | locked at author time | own HTTP cache | simple, no CSS control |
| **Icon font** | — | — | — | **avoid** (see below) |

**Why not icon fonts:** glyphs render on the text baseline (vertical-align headaches), anti-aliasing differs from SVG, they fail as tofu boxes when the font load fails, screen readers may announce the private-use codepoint, and you can't do multicolor. SVG solved all of this. Migrate off icon fonts.

**`currentColor` is the whole trick** — author the SVG with `fill="currentColor"` (or `stroke`), then color it from CSS:
```html
<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" role="img" aria-label="Settings">
  <path d="M12 8a4 4 0 100 8 4 4 0 000-8z…"/>
</svg>
```
```css
.icon-btn { color: var(--fg-muted); }
.icon-btn:hover { color: var(--fg-strong); }   /* icon follows for free */
```

**Sprite pattern** (build once, reference everywhere):
```html
<!-- once, near <body> top, or fetched & injected -->
<svg style="display:none" aria-hidden="true">
  <symbol id="i-search" viewBox="0 0 24 24"><path d="…"/></symbol>
  <symbol id="i-close"  viewBox="0 0 24 24"><path d="…"/></symbol>
</svg>
<!-- anywhere -->
<svg class="icon" width="20" height="20" aria-hidden="true"><use href="#i-search"/></svg>
```

**Accessibility decision tree**
- Decorative (label is adjacent): `aria-hidden="true"` + `focusable="false"`.
- Standalone meaning: `role="img"` + `aria-label="…"`, or a `<title>` as the first child (`<svg><title>Search</title>…`).
- Always add `focusable="false"` — IE/legacy Edge tab-stops into SVGs otherwise.

**Optimize with SVGO** — strips editor cruft, collapses transforms, rounds coordinates. Typical 40–70% size cut. Keep `viewBox`, drop hardcoded `width`/`height` so CSS controls size. Don't let SVGO merge paths you need to animate separately.
```bash
npx svgo --multipass -f ./icons -o ./icons-min
```

**Animate** stroke draw-on, fill toggles, or rotation cheaply with CSS/SMIL; respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce){ .icon-spin{ animation:none } }
```

## 5. Imagery — aspect ratios & art direction

| Ratio | Decimal | Use |
|-------|---------|-----|
| 1:1 | 1.00 | avatars, product thumbs, social grid |
| 4:3 | 1.33 | classic photo, content cards |
| 3:2 | 1.50 | DSLR photography, editorial |
| 16:9 | 1.78 | video, hero, OG images |
| 21:9 | 2.33 | cinematic banners |
| 1.618:1 | golden | balanced editorial crops |

**Reserve the box to kill CLS.** Set `aspect-ratio` (or width/height attrs) so the browser lays out the slot before the image arrives — no content jump:
```css
.media { aspect-ratio: 16 / 9; width: 100%; }
.media img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 35%; }
```
`object-position` lets you bias the crop toward the focal point (faces sit high → favor the top third).

**Art direction = different crops per breakpoint**, not just different sizes. Use `<picture>`:
```html
<picture>
  <source media="(min-width:1024px)" srcset="hero-wide.avif" type="image/avif">
  <source media="(min-width:1024px)" srcset="hero-wide.webp" type="image/webp">
  <source srcset="hero-tall.avif" type="image/avif">
  <img src="hero-tall.jpg" alt="Team on stage" width="800" height="1000" loading="eager" fetchpriority="high">
</picture>
```

**Resolution switching** (same crop, right pixels) = `srcset`/`sizes`:
```html
<img src="card-800.jpg"
     srcset="card-400.jpg 400w, card-800.jpg 800w, card-1200.jpg 1200w, card-2400.jpg 2400w"
     sizes="(min-width:768px) 33vw, 100vw"
     alt="Trail map" width="800" height="600" loading="lazy" decoding="async">
```
The `2400w` source covers @2x/@3x retina; the browser picks by DPR automatically. **Author `sizes` honestly** — a wrong `sizes` makes the browser download the wrong file.

## 6. Image formats — pick by content

| Format | Use when | Wins | Watch |
|--------|----------|------|-------|
| **AVIF** | photos, gradients (primary 2024+) | smallest (~50% < JPEG), HDR, alpha | slower encode; provide WebP fallback |
| **WebP** | universal fallback for AVIF | ~30% < JPEG, alpha, wide support | — |
| **JPEG** | last-resort photo fallback | universal | no alpha; q≈75–82 sweet spot |
| **PNG** | hard-edge UI, transparency, screenshots | lossless, alpha | huge for photos — never for photos |
| **SVG** | logos, icons, flat illustration | infinite scale, tiny, themeable | not for photographic content |

**Order in `<picture>`: AVIF → WebP → JPEG.** First supported wins. Compress to perceptual target, not a blanket quality number — flat graphics tolerate q60, faces need q80+. Strip EXIF/metadata in the build.

**Rough quality + budget targets** (per image, gzip not applicable — already compressed):

| Asset | Format | Quality | Byte budget |
|-------|--------|---------|-------------|
| Hero / LCP | AVIF | ~50–60 | ≤ 150–200 KB |
| Content photo | AVIF/WebP | ~55–65 | ≤ 80 KB |
| Card thumb | AVIF/WebP | ~50 | ≤ 25 KB |
| Avatar 1:1 | WebP | ~70 | ≤ 10 KB |
| Flat illustration | SVG (SVGO) | — | ≤ 15 KB |
| UI icon | inline/sprite SVG | — | ≤ 1–2 KB each |

Measure on real content; faces and text-in-image need the high end, gradients and skies the low end.

**Lazy-load + LQIP/blur-up.** `loading="lazy"` for below-the-fold; `eager` + `fetchpriority="high"` for the LCP hero (the one image you must NOT lazy-load). Blur-up = inline a tiny (~20px wide) base64 placeholder, swap on load:
```css
.blur-up{ filter:blur(12px); transition:filter .3s }
.blur-up.loaded{ filter:none }
```
LQIP variants, smallest to richest: solid dominant-color fill → a ~20px blurred base64 → BlurHash/ThumbHash (≈20–30 char string decoded to a gradient placeholder). All three need the box already reserved by `aspect-ratio` so the swap doesn't shift layout.

**Retina math.** A slot rendered at 400 CSS px needs 800 device px at @2x and 1200 at @3x. Provide those in `srcset` (`400w/800w/1200w`) and let DPR selection do the work — never hardcode @2x in `src`, and don't ship a 2400px file into a 400px slot "to be safe" (it wastes bytes and decode time). Cap meaningful density at ~2x for photos; @3x gains are mostly imperceptible and triple the payload.

## 7. Illustration & brand imagery

- **One style system**: fixed stroke width, shared corner radius, consistent perspective (flat vs. isometric — don't mix), and a **palette pulled from design tokens**, not ad-hoc hex. Illustrations should re-theme with the brand.
- **Grid-built** like icons so a set feels coherent at a glance.
- **Empty states / onboarding**: one focused illustration + one line of copy + one action. Skip elaborate scenes that slow the page.
- **Performance**: export illustration as optimized SVG when flat; rasterize complex gradient/texture art to AVIF — a "lightweight" SVG with 4,000 nodes is heavier and jankier than a 30KB AVIF.

## 8. Photography, scrims & dark mode

- **Text on photos always needs a scrim** for contrast — a gradient/overlay guaranteeing ≥4.5:1 (AA) for body, ≥3:1 for large text:
  ```css
  .hero-overlay{ background:linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.6) 100%) }
  ```
  Prefer a directional gradient over a flat dark wash so the image still breathes. Never place text on a busy region without a scrim — verify contrast on the *actual* pixels behind the text.
- **Photography guidelines**: consistent color grade/temperature across a set, single focal subject, generous negative space where text will land, authentic over stock-cliché.
- **Dark mode**: don't invert photos. Dim them (`filter: brightness(.85)`), swap to a dark-shot `<source>` via `prefers-color-scheme`, or soften pure-white logos to ~90% to cut halation. Provide dark variants of brand illustrations rather than CSS-inverting them.

## Common mistakes

| Don't | Do |
|-------|-----|
| Mix outline + filled + duotone in one cluster | One style per context; filled only for active |
| Mix stroke weights (1px here, 2.5px there) | One stroke per base size across the set |
| Ship icon-only buttons with no name | `aria-label` + tooltip on every icon-only control |
| Draw icons off the pixel grid | Snap anchors; align to keyline shapes |
| `scale()` a 24px icon down to 16px | Draw a dedicated small variant / use `opsz` |
| Use an icon font | Inline SVG or sprite with `currentColor` |
| Ship raw exported SVGs | SVGO multipass, keep `viewBox`, drop width/height |
| Omit width/height/`aspect-ratio` on `<img>` | Reserve the box → zero CLS |
| Serve JPEG/PNG everywhere | AVIF → WebP → JPEG in `<picture>` |
| Lazy-load the LCP hero | `eager` + `fetchpriority="high"` on the hero only |
| One image for all viewports | `<picture>` art direction + `srcset`/`sizes` |
| Text on a busy photo, no scrim | Gradient scrim guaranteeing ≥4.5:1 |
| Inconsistent crops across a card grid | One ratio + `object-fit:cover` + focal `object-position` |
| Invert photos for dark mode | Dim, swap source, or soften logos |
