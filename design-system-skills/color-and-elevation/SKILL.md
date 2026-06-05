---
name: color-and-elevation
description: Build perceptually-uniform color palettes and physically-consistent depth systems with OKLCH ramps, WCAG/APCA contrast, semantic tokens, and elevation-as-lightness dark mode — concrete values and copy-pasteable CSS.
tags: [design-systems, color, contrast, dark-mode, elevation]
---
# Color & Elevation Systems

A design system's color and depth layers must be **perceptually engineered**, not hand-picked. This skill gives the math, the tokens, and the CSS to ship palettes that stay accessible across light/dark, sRGB/P3, and every screen.

## 1. Color models — what each is for

| Model | Axes | Strength | Fatal flaw | Use for |
|-------|------|----------|-----------|---------|
| **HEX / RGB** | r,g,b | Universal, gamut-true | Not human-legible; no perceptual ops | Storage, final output |
| **HSL / HSV** | h,s,l/v | Easy mental model | **L is not perceptual** — `hsl(60 100% 50%)` (yellow) and `hsl(240 100% 50%)` (blue) both "50%" but yellow is ~6× brighter | Quick tweaks only — never for ramps |
| **LCH / Lab** (CIE) | L,C,h | Perceptually uniform | Hue shifts (blue→purple) on lightness change | Print, legacy perceptual work |
| **OKLCH / OKLab** | L,C,h | **Perceptually uniform, no hue shift, predictable** | Newer; needs fallback for old browsers | **Palette generation, the default** |

**Why OKLCH wins for palettes:** equal steps in `L` look equally spaced to the eye, and changing `L` or `C` does *not* drift the hue. HSL's `lightness` lies — that is the #1 cause of muddy, uneven ramps. Author in OKLCH, ship HEX/RGB fallbacks.

```css
/* Same hue, even perceptual lightness steps — looks like a real ramp */
--blue-300: oklch(0.78 0.12 250);
--blue-500: oklch(0.62 0.16 250);
--blue-700: oklch(0.46 0.14 250);
```

### Gamut: sRGB vs Display-P3
- **sRGB** — the safe floor; every device renders it.
- **Display-P3** — ~25% wider, covers vivid greens/reds modern phones/laptops show. Author accent colors with a P3 boost, fall back to sRGB.

```css
--brand: #4f46e5;                                   /* sRGB fallback */
@supports (color: color(display-p3 1 1 1)) {
  --brand: oklch(0.52 0.21 274);                    /* richer on P3 screens */
}
```
Browsers clamp out-of-gamut OKLCH back into the device gamut automatically, so OKLCH authoring is gamut-safe by default.

## 2. Building a palette — three layers

Tokens flow **primitive → semantic → component**. Never let a component reference a primitive directly.

**1. Primitive ramps (raw, 50–950).** One ramp per hue family + a neutral ramp. 11 steps. Generate by holding `C`/`h` roughly constant and stepping `L` evenly in OKLCH.

```css
:root {
  --gray-50:  oklch(0.985 0.002 250);
  --gray-100: oklch(0.967 0.003 250);
  --gray-200: oklch(0.928 0.006 250);
  --gray-300: oklch(0.872 0.010 250);
  --gray-400: oklch(0.715 0.014 250);
  --gray-500: oklch(0.555 0.016 250);
  --gray-600: oklch(0.446 0.015 250);
  --gray-700: oklch(0.372 0.013 250);
  --gray-800: oklch(0.279 0.010 250);
  --gray-900: oklch(0.208 0.008 250);
  --gray-950: oklch(0.145 0.006 250);
}
```
> Note the **slightly higher chroma at the dark end** for neutrals — a hint of blue keeps near-blacks from looking dead. Pure-gray neutrals read clinical.

**2. Semantic tokens (roles, not values).** This is the layer screens consume. Names describe *purpose*, so they can flip per theme.

```css
:root {
  --color-bg:            var(--gray-50);
  --color-surface:       #ffffff;
  --color-surface-raised:#ffffff;
  --color-text:          var(--gray-900);
  --color-text-muted:    var(--gray-600);
  --color-text-subtle:   var(--gray-500);
  --color-border:        var(--gray-200);
  --color-border-strong: var(--gray-300);

  --color-primary:       var(--blue-600);
  --color-primary-hover: var(--blue-700);
  --color-on-primary:    #ffffff;

  --color-success: oklch(0.62 0.15 150);
  --color-warning: oklch(0.75 0.15 80);
  --color-danger:  oklch(0.58 0.20 27);
  --color-info:    oklch(0.62 0.14 240);
}
```

**3. Component tokens (optional 3rd tier).** Only when a component needs to diverge: `--button-primary-bg: var(--color-primary)`. Rule of 3 — don't create this layer until a real component needs to override a semantic value.

**Color roles:** every system needs **brand** (1 hue, identity), **neutral** (1 ramp, ~90% of the UI), and **accent/functional** (success/warning/danger/info + maybe 1 secondary). Resist a rainbow — most great UIs are one brand hue + grays.

### Generating accessible ramps — the recipe
1. Pick hue `h` and a peak chroma `C` for the family.
2. Set `L` per step from a fixed table (below) — these are perceptual, reusable across hues.
3. **Taper chroma at the extremes** (`50` and `950`) so light tints and dark shades don't oversaturate.
4. Verify each step's contrast against its likely background (§3).

| Step | OKLCH L | Typical role |
|------|---------|--------------|
| 50 | 0.97 | faint tint bg |
| 100 | 0.94 | hover tint |
| 200 | 0.88 | subtle border |
| 300 | 0.80 | border |
| 400 | 0.70 | disabled/icon |
| 500 | 0.62 | base / large text on white |
| 600 | 0.54 | **body text floor on white (~4.5:1)** |
| 700 | 0.46 | strong text, pressed |
| 800 | 0.36 | headings |
| 900 | 0.26 | max text |
| 950 | 0.16 | near-black surface |

## 3. Contrast & accessibility

**WCAG 2.2 (legal/standard baseline):**

| Content | AA | AAA |
|---------|-----|-----|
| Normal text (<18px / <14px bold) | **4.5:1** | 7:1 |
| Large text (≥24px / ≥18.66px bold) | **3:1** | 4.5:1 |
| UI components, focus rings, graphics, icons | **3:1** | — |

- **Never encode meaning in color alone** (1.4.1) — pair red/green with an icon, label, or shape. ~8% of men have a color-vision deficiency.
- Disabled controls are exempt from contrast, but don't hide essential info in them.
- Contrast is the **single highest-leverage accessibility lever** — fix it first.

**APCA (the modern method, future WCAG 3):** WCAG 2.x's ratio is a crude 1970s formula — it *over*-passes light-gray-on-white and *under*-passes some dark pairings. **APCA** models real human contrast perception (accounts for text size, weight, and polarity — dark-on-light vs light-on-dark differ). It outputs an **Lc value** (~0–106), not a ratio. Rough targets: **Lc 90** body text, **Lc 75** larger/headings, **Lc 60** large/non-text, **Lc 45** disabled/decorative. Status (2024–2026): still a **W3C draft**, not yet legally required — **ship to WCAG 2.2 AA for compliance, use APCA to make borderline grays actually readable.** Tools: `apcacontrast.com`, the APCA Figma plugin.

```css
/* Common failure: looks fine, fails AA. gray-400 on white ≈ 2.9:1 */
.bad  { color: var(--gray-400); }   /* ✗ body text */
/* gray-600 on white ≈ 4.6:1 — passes AA for body */
.good { color: var(--gray-600); }   /* ✓ */
```

## 4. Dark mode — not an invert

Inverting a light theme produces harsh, vibrating, eye-straining UI. Dark mode is its own design:

- **Dimmed "white" text** — use `#e6e6e6`–`#d4d4d4` (`oklch(~0.92)`), never `#fff`. Pure white on dark vibrates and induces halation, worse for astigmatism.
- **Never pure-black `#000` backgrounds** — use `oklch(0.16–0.21)` (`~#121212`–`#1a1a1a`). Pure black maxes contrast (uncomfortable), kills elevation cues, and smears on OLED.
- **Desaturate accents** — high-chroma colors glare on dark. Drop chroma ~15–30% and nudge lightness up.
- **Reduce overall contrast** — aim for comfortable, not maximal. ~`Lc 90`/15.8:1, not 21:1.
- **Elevation = lighter surface, not bigger shadow** (shadows barely read on dark). Higher layers get lighter.

```css
:root { color-scheme: light dark; }
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:             oklch(0.16 0.006 250);   /* not #000 */
    --color-surface:        oklch(0.21 0.007 250);
    --color-surface-raised: oklch(0.25 0.008 250);   /* higher = lighter */
    --color-text:           oklch(0.92 0.004 250);   /* not #fff */
    --color-text-muted:     oklch(0.72 0.006 250);
    --color-border:         oklch(0.30 0.008 250);
    --color-primary:        oklch(0.70 0.13 250);     /* lighter + desaturated */
    --color-on-primary:     oklch(0.18 0.01 250);
  }
}
```

**`light-dark()` (2024+, baseline-supported)** — one declaration, both themes, no media query:

```css
:root { color-scheme: light dark; }
.card {
  background: light-dark(#ffffff, oklch(0.21 0.007 250));
  color:      light-dark(var(--gray-900), oklch(0.92 0.004 250));
}
```
For a user toggle, set `color-scheme: light` / `dark` on `:root` via a class or `[data-theme]` and `light-dark()` follows it.

**Surface tint:** in dark mode, mixing a few % of the brand hue into surfaces (Material's "tonal elevation") makes layers cohere. `background: color-mix(in oklab, var(--color-surface), var(--color-primary) 5%);`

## 5. Elevation & depth

Depth comes from **shadow** (light mode) and **surface lightness** (dark mode), kept physically consistent.

### Realistic shadows = layered + ambient
A single `box-shadow` looks like a sticker. Real shadows stack a tight **direct/key** shadow (close, sharp) under a soft **ambient** shadow (far, diffuse), and shadow opacity grows with elevation while staying low (4–18%).

```css
:root {
  /* layered: ambient (soft, low) + direct (tight, slightly darker) */
  --shadow-xs: 0 1px 2px rgb(0 0 0 / 0.05);
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.10);
  --shadow-md: 0 2px 4px rgb(0 0 0 / 0.06), 0 4px 8px rgb(0 0 0 / 0.10);
  --shadow-lg: 0 4px 8px rgb(0 0 0 / 0.06), 0 12px 24px rgb(0 0 0 / 0.12);
  --shadow-xl: 0 8px 16px rgb(0 0 0 / 0.08), 0 24px 48px rgb(0 0 0 / 0.16);
}
```

### Elevation tokens (Material 0–24 → practical 6-step)
Map abstract elevation to a token; assign each UI layer once: `0` base, `1` card, `2` raised card/dropdown trigger, `3` dropdown/menu, `4` modal/dialog, `5` toast/popover. Tie elevation to a **z-index scale** so stacking never collides:

```css
:root {
  --z-base: 0; --z-dropdown: 1000; --z-sticky: 1100;
  --z-overlay: 1200; --z-modal: 1300; --z-toast: 1400; --z-tooltip: 1500;
}
```
> Keep z-index on a named scale with gaps (×100). Random `z-index: 9999` is the root of all stacking bugs.

**Light-source consistency:** pick one light direction (top, slightly front) and keep it for *every* shadow — all `y` offsets positive, blur grows with distance. Inconsistent offsets read as broken depth. Inset shadows (pressed/inputs) flip this intentionally.

**Borders vs shadows:** shadows imply *float*; borders imply *containment on the same plane*. On dark UIs and at low elevation, a 1px border (or a hairline + tiny shadow) reads cleaner than a shadow alone. High-contrast/Windows-forced-colors users lose shadows entirely — never make a shadow the *only* affordance.

**Glassmorphism / blur:**
```css
.glass {
  background: color-mix(in oklab, white 60%, transparent);
  backdrop-filter: blur(12px) saturate(1.4);
  border: 1px solid rgb(255 255 255 / 0.2);   /* edge defines the pane */
}
```
Always provide a solid fallback (`@supports not (backdrop-filter: blur(1px))`) — blur tanks scroll perf on weak GPUs and fails behind busy backgrounds.

## 6. Color theory essentials

- **Harmony:** complementary (opposite hues — high tension, sparingly for accents), analogous (adjacent — calm, cohesive), triadic (3 evenly spaced — vibrant, balance one as dominant).
- **Temperature:** warm (red→yellow) advances/energizes; cool (blue→green) recedes/calms. Warm-tinted neutrals feel inviting; cool-tinted feel technical.
- **Saturation strategy:** desaturate large areas, save high chroma for small focal elements (CTAs, badges). Big saturated fills fatigue the eye.
- **60-30-10:** ~60% dominant (neutral bg), 30% secondary (surfaces), 10% accent (brand/CTA). Keeps hierarchy clean.
- **Semantic conventions:** red = danger/error/stop, green = success/go, yellow/amber = warning, blue = info/neutral-action. **Cultural caveat:** red = luck/celebration in China, mourning elsewhere; green has religious meaning in some regions; in finance red/green can invert by market. Don't rely on convention alone — pair with icon + text (loops back to §3).

## 7. Tokens, theming, gradients

**JSON design tokens** (W3C-aligned, feeds Style Dictionary / Tokens Studio):
```json
{
  "color": {
    "primary": { "$type": "color", "$value": "oklch(0.54 0.16 250)" },
    "text":    { "$type": "color", "$value": "{color.gray.900}" }
  },
  "elevation": {
    "md": { "$type": "shadow", "$value": "0 2px 4px #0000000f, 0 4px 8px #0000001a" }
  }
}
```

**Multi-brand theming** — keep *semantic* names identical, swap the *values* per `[data-theme]`. Components never change:
```css
[data-theme="acme"]  { --color-primary: oklch(0.55 0.18 265); }
[data-theme="globex"]{ --color-primary: oklch(0.60 0.14 160); }
```

**`color-mix()`** generates states without new tokens — hovers, tints, overlays:
```css
--primary-hover: color-mix(in oklab, var(--color-primary), black 12%);
--primary-tint:  color-mix(in oklab, var(--color-primary) 8%, var(--color-surface));
```
> Mix in **`oklab`/`oklch`**, not `srgb` — sRGB mixing muddies through gray (e.g. blue→yellow passes through dirty olive).

**Relative color syntax (2024+)** — derive from one source color:
```css
--primary-light: oklch(from var(--color-primary) calc(l + 0.12) c h);
--primary-faded: oklch(from var(--color-primary) l calc(c * 0.5) h);
```

**Gradients — avoid banding & gray dead-zones:**
```css
/* Interpolate in oklab so the midpoint stays vivid, not muddy */
background: linear-gradient(in oklab, oklch(0.6 0.2 280), oklch(0.7 0.18 200));
```
- Banding (visible stripes) shows on large/low-contrast gradients on 8-bit panels. Fix: add a faint SVG/PNG noise overlay (`opacity: 0.02–0.04`) to **dither**, or keep gradients shorter.
- Always interpolate perceptually (`in oklab`/`in oklch`) — default sRGB interpolation darkens and desaturates the middle.

## Common mistakes (quick reference)

| ✗ Mistake | ✓ Fix |
|-----------|-------|
| Building ramps in HSL with even L steps | Use OKLCH — HSL lightness is perceptually uneven |
| `gray-400` for body text on white (~2.9:1) | `gray-600`+ for AA; verify, don't eyeball |
| Pure `#000` dark bg + pure `#fff` text | `oklch(0.16)` bg, `oklch(0.92)` text |
| Full-chroma accents in dark mode | Desaturate ~20%, lighten slightly |
| Single flat `box-shadow` | Layer ambient + direct shadows |
| Shadow as the only depth/affordance cue | Add border / surface-lightness; survives forced-colors |
| Components point at primitives (`--blue-600`) | Route through semantic tokens so themes flip |
| `color-mix`/gradients in sRGB | Mix and interpolate `in oklab` |
| Random `z-index: 9999` | Named z-scale with gaps |
| Color-only status (red/green dot) | Color + icon + text label |

**Ship order:** OKLCH primitive ramps → semantic tokens → contrast-check every text/bg pair (AA, APCA for grays) → dark theme via `light-dark()` + lighter surfaces → layered shadows on a z-scale → P3 boost last.
