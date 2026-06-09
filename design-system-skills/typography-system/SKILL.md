---
name: typography-system
description: Reference-grade guide to building a cross-platform type system — modular/fluid scales, leading & measure, pairing, variable fonts, OpenType, baseline rhythm, accessible ramps, and the tokens that ship it.
tags: [design-systems, typography, type, fonts]
---
# Typography Systems

A type system is the set of rules that turns raw fonts into a coherent, scalable voice across every screen. Get it right and hierarchy, rhythm, and readability come for free; get it wrong and no amount of color or layout rescues it. This is the bible: anatomy → scale → spacing → selection → variable/OpenType → rhythm → hierarchy → tokens → accessibility → mistakes.

---

## 1. Anatomy (the vocabulary you need to make decisions)

- **Baseline** — the invisible line letters sit on. The anchor for vertical alignment.
- **x-height** — height of a lowercase `x`. The *perceived* size of a font; two fonts at 16px look different sizes because of it. High x-height (Inter, Source Sans) reads larger and better at small sizes; low x-height (Garamond) feels elegant but needs more size.
- **Cap height** — top of a capital letter. Usually below ascender height. Aligning UI elements to cap height (not the font's em-box) is what makes icons + text look centered.
- **Ascender / descender** — strokes above x-height (`h`, `b`, `k`) / below baseline (`g`, `p`, `y`). They eat into line-height; this is why a 16px font occupies ~22px of vertical space.
- **Counter** — enclosed/partially-enclosed space inside `o`, `e`, `a`. Open counters survive small sizes and low resolution.
- **Aperture** — the opening of a counter (the gap in `c`, `e`, `a`). Wide apertures (Frutiger, Inter) = legible at distance/small size; closed apertures hurt accessibility.
- **Terminal** — the end of a stroke not finished with a serif. Shape signals the typeface's character/era.
- **Em / em-box** — the design grid the font is drawn on. `1em` = the font-size. The reference for all relative metrics.

> Why care: you can't pick a UI font, set a scale, or align to a grid without knowing x-height, cap height, and how ascenders/descenders consume line-height.

---

## 2. The modular scale

Pick a **base size** and a **ratio**; multiply repeatedly to generate steps. This produces sizes that relate harmonically instead of arbitrary 14/15/17/19px noise.

**Base size:** `16px` on web — it's the browser default, the minimum for comfortable body text, and the anchor for `rem`. Never set `html { font-size: 14px }` (it shrinks everyone's accessibility baseline).

**Common ratios** (smaller ratio = subtle, dense UI; larger = dramatic editorial):

| Ratio | Name | Feel | Use for |
|------:|------|------|---------|
| 1.125 | Major second | Tight, calm | Dense dashboards, data UI |
| 1.200 | Minor third | Gentle | Product UI, forms |
| 1.250 | Major third | Balanced (most popular) | General web/app UI |
| 1.333 | Perfect fourth | Confident | Marketing + app hybrid |
| 1.414 | Augmented fourth (√2) | Strong | Editorial |
| 1.500 | Perfect fifth | Bold | Landing pages |
| 1.618 | Golden ratio | Dramatic | Hero-driven sites |

**Generating a scale** (base 16, ratio 1.25): step_n = 16 × 1.25ⁿ → 10.24, 12.8, 16, 20, 25, 31.25, 39, 48.8, 61… Round to sane px, then **store in rem**.

```css
:root {
  --step--2: 0.64rem;   /* 10px caption-min   */
  --step--1: 0.8rem;    /* 13px caption       */
  --step-0:  1rem;       /* 16px body          */
  --step-1:  1.25rem;    /* 20px h5            */
  --step-2:  1.5625rem;  /* 25px h4            */
  --step-3:  1.953rem;   /* 31px h3            */
  --step-4:  2.441rem;   /* 39px h2            */
  --step-5:  3.052rem;   /* 49px h1            */
}
```

**Pro move:** use *two* ratios — a tight one (1.2) for body/UI steps, a wider one (1.333+) for display/headings. Headlines need more drama than paragraph text. A single ratio across the whole range either makes body cramped or headlines timid.

### Fluid type with `clamp()`

Fixed steps break between a phone and a 27" monitor. `clamp(MIN, PREFERRED, MAX)` scales type with the viewport, no media queries.

```css
/* fluid from 16px @360px viewport → 20px @1240px viewport */
--step-0: clamp(1rem, 0.93rem + 0.31vw, 1.25rem);
--step-5: clamp(2.25rem, 1.1rem + 5.1vw, 4rem); /* hero */
```

The math: `preferred = yIntercept + slope·vw`, where `slope = (maxPx − minPx) / (maxVw − minVw)` and `slope·100` → the `vw` value; the rem term is the intercept so it lands exactly at your min at the min viewport. Use a generator (utopia.fyi) rather than hand-tuning. **Always keep `rem` in the preferred term** so the value still responds to the user's browser zoom/root-size — a pure `vw` clamp defeats zoom and fails WCAG 1.4.4.

---

## 3. Spacing: leading, measure, tracking, kerning

### Line-height (leading) — *the* readability lever

| Context | line-height (unitless) |
|---|---|
| Body text | **1.4–1.6** (1.5 safe default) |
| Long-form reading | 1.5–1.7 |
| UI labels / dense | 1.3–1.4 |
| Headings (large) | **1.1–1.25** |
| Display / hero | 0.95–1.1 (can go sub-1) |

Rules: **set line-height unitless** (`1.5`, not `24px`) so it scales with each element's font-size. Bigger type needs *less* relative leading (the eye travels less to find the next line); small text needs more. Wider columns need more leading; narrow columns can use less. Tighten line-height as font-size grows — a single global `1.5` makes h1s look airy and broken.

### Measure (line length) — the silent readability killer

- **45–75 characters per line; ~66 is the optimum.** Below ~45 the eye jumps too often; above ~75 it loses the return point.
- Set with `max-width` in `ch` (the `0` glyph width): `max-width: 66ch;`. Re-check per font — `ch` varies by typeface.
- Multi-column? 40–50ch each. Captions can run shorter.

### Tracking (letter-spacing)

- **Large/display: tighten** slightly (`-0.01em` to `-0.03em`) — default spacing looks loose at big sizes.
- **Small caps & ALL-CAPS: open up** (`+0.05em` to `+0.1em`) — caps have no ascender/descender cues, so they need air to be legible.
- **Body text: leave at 0.** Designers over-track body; it *reduces* readability by breaking word shapes.
- Use **`em`, never px**, so tracking scales with size.

### Kerning & word-spacing

- **Kerning** = space between specific pairs (`AV`, `To`, `We`). `font-kerning: normal` (default) uses the font's built-in pairs. `text-rendering: optimizeLegibility` enables optical kerning + ligatures but can hurt perf on huge text blocks — reserve for headings.
- **Metric** kerning uses the designer's pair table (trust it for good fonts); **optical** lets the renderer space by glyph shape (rescues fonts with poor metrics). Headlines benefit most.
- **Word-spacing:** rarely touch it. Justified text is where it goes wrong (see mistakes).

---

## 4. Font selection & pairing

**Classification** (so you can reason about pairing): *Serif* (Old-style/Garamond, Transitional/Times, Slab/Roboto Slab), *Sans* (Grotesque/Helvetica, Neo-grotesque/Inter, Humanist/Frutiger, Geometric/Futura), *Mono* (JetBrains Mono, SF Mono), *Display/Script* (headlines only).

**Pairing principles:**
- **Max 2–3 families.** One workhorse for body/UI, one for display, optionally one mono for code/data.
- **Contrast by role, harmonize by feel.** A clean geometric sans heading over a humanist serif body works because roles differ but proportions agree. Pairing two similar sans-serifs reads like a mistake, not a choice.
- **Superfamily** (Source Sans + Source Serif + Source Code; IBM Plex family) gives guaranteed harmony — same designer, matched x-heights and metrics. Lowest-risk pairing.
- **Match x-heights** across paired fonts or the size relationship feels off.
- Never pair two display faces, two geometrics, or fonts from the same era doing the same job.

**System font stack** (zero network cost, instant render, native feel):

```css
font-family: system-ui, -apple-system, "Segoe UI", Roboto,
  Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
/* mono */
font-family: ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono",
  Menlo, Consolas, monospace;
```

### Loading performance

- **`woff2` only** for web fonts — ~30% smaller than woff, universal support. Don't serve ttf/otf to browsers.
- **`font-display`:**
  - `swap` — render fallback immediately, swap in webfont when ready (FOUT). Default choice; text always visible.
  - `optional` — use webfont only if it's near-instant (cached), else stick with fallback. Best for body text / Core Web Vitals (no layout shift).
  - `block` (FOIT) — invisible text up to ~3s. Avoid; it hides content.
- **`preload`** the 1–2 critical fonts (body regular, maybe body bold): `<link rel="preload" href="/inter.woff2" as="font" type="font/woff2" crossorigin>`. Don't preload everything — it starves other resources.
- **Subset** to the glyphs/languages you actually use (`glyphhanger`, `fonttools`) and use `unicode-range` to split by script — Latin-only subsets cut a font from ~200KB to ~15KB.
- **FOUT vs FOIT:** FOUT (flash of *unstyled* text) is preferable — content is readable instantly. Minimize the swap jolt by choosing a fallback whose metrics match (use `size-adjust`, `ascent-override`, `descent-override` on an `@font-face` fallback to eliminate layout shift).

```css
@font-face {
  font-family: "Inter";
  src: url("/fonts/inter-var.woff2") format("woff2-variations");
  font-weight: 100 900;       /* variable range */
  font-display: swap;
}
```

---

## 5. Variable fonts & OpenType

**Variable fonts** ship every weight/width in one file along a continuous **axis**, controlled at runtime. One ~70KB file replaces 6+ static weights.

Registered axes: **`wght`** (weight 1–1000), **`wdth`** (width %), **`opsz`** (optical size), **`ital`** (0/1), **`slnt`** (slant degrees). Plus font-specific custom axes (grade, etc.).

```css
h1 { font-variation-settings: "wght" 720, "wdth" 105; }
body { font-variation-settings: "wght" 400; }
```

Prefer the high-level properties (`font-weight: 720`) when they map to an axis — they're inherited and animatable; reach for `font-variation-settings` only for custom axes.

**Optical sizing (`opsz`)** adjusts letterforms for size: small text gets thicker strokes, more open spacing; large text gets refined, higher contrast. `font-optical-sizing: auto` (default) ties it to font-size automatically — keep it on. This is the single biggest quality jump variable fonts offer.

**OpenType features** (`font-feature-settings`, or semantic `font-variant-*`):

| Feature | Tag | Use |
|---|---|---|
| Ligatures | `liga`/`dlig` | On by default; discretionary for display only |
| **Tabular numerals** | `tnum` | **Tables, prices, anything that must align in columns** |
| Proportional numerals | `pnum` | Running prose |
| Oldstyle numerals | `onum` | Numbers that flow with lowercase in body text |
| Small caps | `smcp` | True small caps (never CSS `font-variant: small-caps` fakery if real ones exist) |
| Fractions | `frac` | `1/2` → proper fraction |
| Slashed zero | `zero` | Code, IDs, anywhere `0`/`O` confusion matters |
| Stylistic sets | `ss01`… | Alternate glyph designs (e.g. Inter's single-story `a`) |

```css
.data-table td { font-variant-numeric: tabular-nums; } /* prefer semantic */
code { font-feature-settings: "zero" 1, "ss01" 1; }
```

> **Tabular vs proportional numerals** is the classic system-design tell: numbers in tables, dashboards, and timers must be `tnum` so digits share one width and columns don't shimmer when values change. Body prose uses proportional for even color.

---

## 6. Vertical rhythm & baseline grid

Consistent vertical spacing makes a page feel composed. Tie everything to a **base unit** — typically **4pt or 8pt**. Margins, line-heights, and component spacing become multiples of it.

- Set body line-height to a grid multiple: 16px body × 1.5 = **24px** line → snaps to a 4/8 grid perfectly. This is why 16/24 is a near-universal default.
- Space between blocks (paragraphs, headings) in grid units (8, 16, 24, 32, 40…).
- **Baseline grid:** align text baselines to evenly spaced horizontal lines. Strict baseline alignment is purist and hard on the web (line-height rounding, mixed sizes); aim for *rhythm* (consistent multiples) rather than pixel-perfect baseline lock unless doing editorial/print.
- **Cap-height alignment vs baseline:** in UI, vertically center elements by **cap height**, not the em-box, so a label looks centered next to an icon or inside a button. CSS `leading-trim`/`text-box-trim` (shipping in modern browsers) finally lets you trim the half-leading above cap height and below baseline so components space by glyph, not by invisible line-box padding — adopt it where supported, with fallbacks.

---

## 7. Hierarchy & the type ramp

Hierarchy is built from **five tools**, in order of strength: **size → weight → color/contrast → spacing → case**. Use the fewest that work. Reaching for ALL-CAPS + bold + big + colored at once is shouting.

- **Size:** primary signal; from the modular scale.
- **Weight:** 400 body, 600/700 emphasis, 300 only at large sizes (thin text fails small).
- **Color/contrast:** demote secondary text with a lighter ink — but never below WCAG contrast.
- **Spacing:** whitespace groups and separates more cleanly than rules/boxes.
- **Case:** small caps / uppercase for overlines, eyebrows — *with* added tracking.

### Reference type ramp (tokens)

| Token | size (rem/px) | line-height | weight | tracking | use |
|---|---|---|---|---|---|
| display | clamp → 48–72 | 1.0 | 700 | -0.02em | hero |
| h1 | 39 / 2.441rem | 1.1 | 700 | -0.01em | page title |
| h2 | 31 / 1.953rem | 1.15 | 700 | -0.01em | section |
| h3 | 25 / 1.563rem | 1.2 | 600 | 0 | subsection |
| h4 | 20 / 1.25rem | 1.3 | 600 | 0 | card title |
| body-lg | 18 / 1.125rem | 1.6 | 400 | 0 | lead paragraph |
| **body** | 16 / 1rem | 1.5 | 400 | 0 | default |
| body-sm | 14 / 0.875rem | 1.45 | 400 | 0 | secondary |
| caption | 13 / 0.8rem | 1.4 | 400 | 0 | meta, timestamps |
| overline | 12 / 0.75rem | 1.3 | 600 | +0.08em | UPPERCASE eyebrow |
| code | 14 / 0.875rem | 1.5 | 400 | 0 | mono, `tnum`+`zero` |

**Responsive ramps:** don't scale every token equally. Headings should compress *more* than body on small screens (a 49px hero at 360px is unreadable; 16px body stays 16px). Fluid `clamp()` per token handles this; or define a mobile ramp that shrinks display/h1/h2 while body holds.

### Per-platform ramps (native systems)

- **iOS — Dynamic Type / SF:** semantic text styles (largeTitle 34, title1 28, title2 22, title3 20, headline 17-semibold, body 17, callout 16, subhead 15, footnote 13, caption1 12, caption2 11). **Never hardcode point sizes** — use the named styles so they respond to the user's accessibility text-size slider (up to XXXL). SF Pro switches optical variants (Display ≥20pt, Text <20pt) automatically.
- **Android — Material 3 / Roboto:** scale roles Display/Headline/Title/Body/Label, each in Large/Medium/Small (e.g. Body Large 16/24, Title Medium 16/24 medium-weight, Label Small 11). Map your tokens to these roles so Material components inherit correctly; respects the OS font-scale setting.
- **Windows / WinUI:** type ramp Caption 12 → Body 14 → Subtitle 20 → Title 28 → Display 68, on Segoe UI Variable (which uses `opsz` for size-appropriate forms).

> Map your single semantic token set (`display`, `h1`…`caption`, `code`) onto each platform's native ramp rather than inventing per-platform names. One mental model, native behavior everywhere.

---

## 8. Accessibility (non-negotiable)

- **Minimum sizes:** body **≥16px** on web (14px floor for genuinely secondary text; never below 12px for anything a user must read). iOS/Android: respect the system text-size setting — don't cap it.
- **Use `rem`, not `px`, for font-size.** `px` font-size ignores the user's browser default; `rem` honors it. This is the #1 accessibility-via-typography rule.
- **Support 200% zoom (WCAG 1.4.4)** and 400% reflow (1.4.10) without loss of content or horizontal scroll. `rem` sizing + fluid layouts + `clamp()` with a rem term get you there; fixed `vw`-only type breaks zoom.
- **Contrast (WCAG 1.4.3):** normal text **≥4.5:1**, large text (≥24px, or ≥18.66px bold) **≥3:1**. AAA wants 7:1 / 4.5:1. Don't demote secondary text into low-contrast gray-on-white.
- **Don't rely on weight/color alone** to convey meaning (1.4.1) — pair with size, label, or icon. Bold-only emphasis disappears for low-vision users.
- **Letter-spacing override (1.4.12):** content must survive user-applied spacing (letter ≥0.12em, word ≥0.16em, line ≥1.5×). Don't lock layouts that break when users adjust spacing.
- **Dyslexia-friendly:** generous line-height (1.5+), left-aligned (ragged-right) not justified, measure ≤70ch, high x-height humanist fonts with open apertures and distinct letterforms (Inter, Atkinson Hyperlegible, Lexend), avoid all-caps for long runs, avoid pure-black-on-pure-white (slight off-white reduces glare), don't italicize whole paragraphs. "Dyslexia fonts" help some users but good general typography helps more.

---

## 9. Common mistakes (do / don't)

| Don't | Do | Why |
|---|---|---|
| Justify text on the web (`text-align: justify`) | Left-align, ragged right | Browsers lack hyphenation/spacing control → ugly "rivers" of whitespace |
| Use 4+ font families | 2–3 max (body, display, mono) | Each family is a download + a cognitive cost; more reads as chaos |
| Set sizes in `px` | `rem` (+ `clamp()` for fluid) | `px` ignores user zoom/root-size → accessibility failure |
| Single global line-height | Tighter for display, looser for body | Leading must scale inversely with size |
| Run lines 100+ chars wide | `max-width: 66ch` | Eye loses the return line beyond ~75ch |
| **Faux bold/italic** (`font-weight:bold` on a font with no bold file) | Load the real weight/italic, or use a variable font | Browser synthesizes by skewing/smearing → muddy, off-brand glyphs |
| Track body text | Track only caps/display | Spacing breaks word shapes, hurting readability |
| Hardcode iOS point sizes | Dynamic Type styles | Breaks the user's accessibility text scaling |
| Tabular data with proportional nums | `font-variant-numeric: tabular-nums` | Columns shimmer/misalign as digits change width |
| Thin weight (200/300) on small text | 400+ for body | Thin strokes vanish at small sizes / low DPI |
| `font-display: block` on body | `swap` or `optional` | FOIT hides content for seconds |

**Synthesis check before shipping a system:** one base + one (or two) ratios → rem scale; tokens with size+line-height+weight+tracking each; ≤3 families in woff2 with `font-display` + preload + subsetting; tabular nums wired for data; fluid `clamp()` with rem terms; contrast + 200% zoom verified; mapped to native ramps on the platforms you target.

---

## Cross-device quick reference

- **Web:** `rem` + `clamp()` + `ch` measure + variable woff2. Logical properties (`margin-block`, `padding-inline`) for i18n/RTL.
- **iOS:** Dynamic Type semantic styles, SF Pro, respect text-size + bold-text accessibility settings.
- **Android:** Material 3 type roles, Roboto/`sp` units (which scale with user font setting — use `sp` for text, `dp` for layout).
- **Desktop (Electron/native):** treat like web but lean on `system-ui` stacks for native feel and zero load cost; honor OS scaling.
