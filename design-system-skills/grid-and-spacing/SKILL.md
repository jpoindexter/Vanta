---
name: grid-and-spacing
description: Reference-grade system for spacing scales, column/baseline grids, responsive breakpoints, and modern CSS Grid/container-query layout built on an 8pt base with copy-pasteable tokens.
tags: [design-systems, layout, grid, spacing, 8pt-grid]
---
# Grid & Spacing Systems

Spacing and grids are the load-bearing skeleton of a design system. Get them right and every component composes; get them wrong and you fight off-grid drift forever. This is the working reference: numbers, tokens, and CSS you paste.

## The three grids (they coexist, they are not alternatives)

| Grid | Governs | Granularity | Tool |
|------|---------|-------------|------|
| **Soft grid** (spacing) | Padding, margins, gaps between everything | 8pt (4pt half-step) | spacing tokens, `gap`, `padding` |
| **Hard grid** (columns) | Page-level horizontal structure: columns, gutters, margins | 12/8/4 columns | CSS Grid `grid-template-columns` |
| **Baseline grid** | Vertical rhythm of text across the page | 4pt (line-height multiples) | `line-height`, `margin-block` |

The soft grid is always on. The hard grid kicks in at the layout/page level. The baseline grid is the strictest and most often skipped — adopt it only when typographic precision matters (editorial, docs), because forcing every component onto a 4pt baseline is expensive.

## The 8pt grid — why 8

- **Divisibility.** 8 divides cleanly by 2 and 4, giving you 4 / 8 / 16 / 24 / 32 without fractions. Halving stays whole (8→4→2).
- **Density scaling.** Screens render at @1x / @2x / @3x. An 8pt value is 8px @1x, 16px @2x, 24px @3x — always a whole pixel, never blurry half-pixels. Odd or 5-based values smear across densities.
- **Less decision fatigue.** A constrained scale means "what spacing here?" has ~8 answers, not 800.
- **Cross-platform.** iOS thinks in `pt`, Android in `dp`, web in `px`/`rem`. 8 maps cleanly to all three (see Density below).

**The 4pt half-step.** Use 4pt for *fine* control where 8pt is too coarse: icon-to-label gaps, dense data tables, tight inline chips, compact toolbars. Rule: 8pt for layout and component spacing; 4pt only when 8 visibly over-spaces a small element. Don't go below 4 except for hairline borders (1px) and `2px` focus-ring offsets.

## The spacing scale (tokens)

A geometric-ish scale on the 8pt grid. This is the canonical set — ship these as tokens, do not invent values between them.

| Token | px @1x | rem | Typical use |
|-------|--------|-----|-------------|
| `space-0` | 0 | 0 | reset |
| `space-px` | 1 | — | hairline border |
| `space-0.5` | 2 | 0.125 | icon nudge, focus offset |
| `space-1` | 4 | 0.25 | tight inline gap (4pt step) |
| `space-2` | 8 | 0.5 | base unit, compact padding |
| `space-3` | 12 | 0.75 | input padding, small gap |
| `space-4` | 16 | 1 | default component padding/gap |
| `space-5` | 20 | 1.25 | (optional) |
| `space-6` | 24 | 1.5 | card padding, section inner gap |
| `space-8` | 32 | 2 | between components |
| `space-10` | 40 | 2.5 | small section gap |
| `space-12` | 48 | 3 | section gap |
| `space-16` | 64 | 4 | large section gap |
| `space-20` | 80 | 5 | page block separation |
| `space-24` | 96 | 6 | hero / major divisions |
| `space-32` | 128 | 8 | full-bleed section padding |

```css
:root {
  --space-0:0; --space-px:1px; --space-0_5:.125rem; --space-1:.25rem;
  --space-2:.5rem; --space-3:.75rem; --space-4:1rem; --space-6:1.5rem;
  --space-8:2rem; --space-10:2.5rem; --space-12:3rem; --space-16:4rem;
  --space-20:5rem; --space-24:6rem; --space-32:8rem;
}
```

**Numeric vs t-shirt naming.** Numeric (`space-4`) scales infinitely and encodes the value (4 → 16px once you know base=4px). T-shirt (`xs/sm/md/lg/xl`) reads fast but breaks when you need a 6th size (`xxl`, `2xl`…). **Recommendation:** numeric tokens that map to the px value for the spacing scale; t-shirt sizing is fine for *component* size variants (`size="sm"`). Pick one convention per token category and never mix.

| t-shirt | numeric | px |
|---------|---------|----|
| `xs` | `space-1` | 4 |
| `sm` | `space-2` | 8 |
| `md` | `space-4` | 16 |
| `lg` | `space-6` | 24 |
| `xl` | `space-8` | 32 |
| `2xl` | `space-12` | 48 |

## Layout / column grids

A column grid is **columns + gutters + margins**. Columns hold content; gutters separate them; margins (outer) frame the page.

**Why 12 columns.** 12 is divisible by 2, 3, 4, and 6 — so it cleanly expresses halves (6+6), thirds (4+4+4), quarters (3×4), and sixths. An 8-column grid can't do thirds; 12 covers the most common splits without fractional columns.

**Responsive column counts** (mobile-first):

| Tier | Columns | Margin | Gutter |
|------|---------|--------|--------|
| Mobile (<768px) | 4 | 16px | 16px |
| Tablet (768–1023) | 8 | 24px | 24px |
| Desktop (≥1024) | 12 | 24–32px | 24px |

**Fluid vs fixed vs hybrid.**
- **Fluid** — columns are `1fr`, everything stretches with the viewport. Best default; use `minmax()` to stop columns collapsing.
- **Fixed** — columns have a set px width; the grid centers in a max-width container. Predictable but leaves dead space on wide screens.
- **Hybrid** (recommended) — fluid columns inside a `max-width` container with auto margins: fluid up to a cap, then centered. This is what most production sites use.

**Max content width / line length.** Cap measure (line length) at **45–75 characters** for body text (~`65ch` ideal). Cap the content container at **1200–1280px** for app shells, **640–720px** for long-form reading. Past that, lines get unreadable and the eye loses its place.

**Container vs full-bleed.** Default content sits in the capped container. Let specific elements break out to full viewport width (hero images, color bands) via a full-bleed escape, then return inner content to the container:

```css
.container { width:min(100% - 2*var(--space-4), 1280px); margin-inline:auto; }
.full-bleed { width:100vw; margin-inline:calc(50% - 50vw); } /* breaks the container */
```

## Responsive breakpoints

Mobile-first, `min-width` only — so styles cascade upward and you never fight `max-width` overrides.

| Token | min-width | Targets |
|-------|-----------|---------|
| `sm` | 480px | large phones |
| `md` | 768px | tablets / small laptops |
| `lg` | 1024px | laptops |
| `xl` | 1280px | desktops |
| `2xl` | 1440px | large desktops |
| `3xl` | 1920px | wide / TV |

`360px` is the practical minimum design width (small Android). Don't add a breakpoint for it — design the base (no media query) to work at 360 and let it scale up.

**Container queries vs media queries.** Media queries respond to the *viewport*; container queries respond to the *component's own width* — so a card in a sidebar and the same card in a wide grid restyle independently. Use container queries for reusable components, media queries for page-level layout shifts.

```css
.card-host { container-type: inline-size; container-name: card; }
@container card (min-width: 30rem) { .card { grid-template-columns: 1fr 2fr; } }
```

**Intrinsic / fluid layouts** beat breakpoints for grids of cards — the layout wraps itself with no media queries at all (RAM / "Repeat Auto-fit Minmax" pattern):

```css
.auto-grid {
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  gap: var(--space-6);
}
```

`auto-fill` keeps empty tracks (preserves column slots); `auto-fit` collapses them so items stretch to fill. Use `auto-fit` for fluid card walls, `auto-fill` when column positions must stay stable. The `min(16rem, 100%)` guard prevents overflow on viewports narrower than the min track.

## CSS Grid + Flexbox for implementing grids

**12-column grid:**
```css
.grid-12 {
  display:grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--space-6);
}
.span-4 { grid-column: span 4; }     /* one-third */
.span-6 { grid-column: span 6; }     /* one-half */
```

**Named lines / areas** make intent legible and reflow trivial:
```css
.app {
  display:grid;
  grid-template-columns: [sidebar] 16rem [main] 1fr;
  grid-template-areas: "nav header" "nav content";
}
.sidebar { grid-area: nav; }
```

**Subgrid** aligns a child's columns to the parent grid — so card internals (title/body/footer) line up across cards regardless of content length:
```css
.cards { display:grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-6); }
.card  { display:grid; grid-row: span 3; grid-template-rows: subgrid; }
```

**`gap` over margins.** Use `gap` for spacing between grid/flex children — no margin-collapse, no last-child reset, no negative-margin gutter hacks. Reserve `margin` for spacing *around* a block relative to siblings outside the flex/grid context.

**Grid vs Flexbox:**

| Use Grid when | Use Flexbox when |
|---------------|------------------|
| 2D layout (rows AND columns) | 1D layout (a row or a column) |
| Page/section structure | Toolbars, button rows, nav items |
| Aligning to a column system | Content-sized, wrap-as-needed items |
| Overlapping / explicit placement | Distributing space (`justify-content`) |

## Density and units

| Unit | Platform | Note |
|------|----------|------|
| `px` | Web | CSS pixel = 1/96in reference; scales with device DPR |
| `pt` | iOS | 1pt = 1px @1x, 2px @2x, 3px @3x |
| `dp` | Android | density-independent pixel; 1dp = 1px @mdpi(160) |
| `rem` | Web | relative to root `font-size` (default 16px) — use for spacing so it respects user zoom/font settings |

**8pt across platforms:** an 8pt iOS value, an 8dp Android value, and `0.5rem`(8px) web value are the same intended size. Design once at @1x in points; the platform multiplies for @2x/@3x. **Always design and tokenize on the @1x grid** — let render-time scaling handle density. Use `rem` for web spacing (accessibility), `px` only for borders/hairlines that must not scale with font size.

**Rounding to the grid:** any computed value (from `%`, `vw`, `clamp()`) should land on a grid multiple. If a calc yields 17px, round to 16. Off-grid values are how drift starts.

**Fluid spacing with `clamp()`** — scale section padding with the viewport while staying on-grid at the ends:
```css
--space-section: clamp(2rem, 5vw, 6rem);   /* 32px → 96px, both on-grid */
```
Clamp the min and max to real tokens; only the middle interpolates.

## Applying spacing — the patterns

| Pattern | Meaning | CSS |
|---------|---------|-----|
| **Inset** | Uniform padding inside a box | `padding: var(--space-4)` |
| **Inset-squish** | Less vertical than horizontal (buttons) | `padding: var(--space-2) var(--space-4)` |
| **Stack** | Vertical gap between stacked elements | `display:grid; gap: var(--space-4)` |
| **Inline** | Horizontal gap between inline elements | `display:flex; gap: var(--space-2)` |
| **Inline-stack** | Wrapping row with consistent gaps | `display:flex; flex-wrap:wrap; gap: var(--space-3)` |

**Component padding scale:** small/compact = `space-2`→`space-3`, default = `space-4`, comfortable/cards = `space-6`. Keep a component's internal paddings on one scale step; don't mix 12px and 16px inside one card.

**Logical properties** (writing-mode safe, RTL-ready — prefer these):
```css
padding-block: var(--space-3);   /* top + bottom */
padding-inline: var(--space-4);  /* left + right (or right + left in RTL) */
margin-block-end: var(--space-8);
```

**Negative space is a tool, not leftover.** Group related items with *less* space, separate unrelated groups with *more* (proximity = relationship). A jump from `space-2` (within a group) to `space-8` (between groups) reads instantly as structure. Generous whitespace signals hierarchy and quality more than any border.

**Optical adjustment.** Mathematically equal spacing can look unequal. Nudge for perception: icons often need a hair less leading space than text; a circle/triangle next to squares may need +1–2px to feel centered; uppercase needs more letter-spacing. The grid is the default; the eye is the final judge — break the grid *deliberately* and rarely.

**Rhythm / baseline:** set `line-height` to a 4pt multiple (e.g. 24px for 16px text = 1.5) and space text blocks by line-height multiples so text rows land on the baseline grid.

## Do / Don't

| Do | Don't |
|----|-------|
| Use tokens for every space value | Type raw `13px`, `25px`, `7px` |
| Stay on 8pt (4pt for fine) | Drift to 5/7/15/18px "because it looks right" |
| `gap` for between, `padding` for inside | Stack margins and fight collapse |
| 4–6 breakpoints, mobile-first `min-width` | 10 breakpoints, mixed min/max |
| Container queries for components | Media-query a component to its parent's width |
| `minmax`/`auto-fit` for card grids | A media query per card-count change |
| Cap measure at ~65ch | Full-width 120-char body text |
| Logical properties (`-inline`/`-block`) | Hard-coded `left`/`right` (breaks RTL) |

## Common mistakes

- **Arbitrary values / magic numbers.** `margin-top: 13px`. Every value must trace to a token. If none fits, the design is off-grid — fix the design, don't add a one-off.
- **Off-grid drift.** A `15px` here, `17px` there. Individually invisible, collectively the UI feels "off" and nothing aligns. Audit with a grid overlay.
- **Too many breakpoints.** Each one multiplies test surface and QA cost. 4–6 covers 99% of devices. Let intrinsic layouts (`minmax`/`clamp`/container queries) absorb the in-between sizes.
- **Mixing margin and gap** for the same job — double spacing and last-child resets. Pick `gap`.
- **Hardcoding density.** Designing at @2px values that don't halve, then getting blurry @3x. Design @1x on the grid.
- **No max-width.** Body text running the full width of a 1920px monitor. Cap the measure.
- **Margins on both neighbors** causing collapse surprises. Own spacing in one direction (e.g. `margin-block-end` only) or use `gap`.
- **Px spacing instead of rem** — ignores user zoom and OS font-size, an accessibility regression.

## Quick checklist

1. Base unit = 8px; tokens defined; nothing off-scale.
2. 12/8/4 columns at desktop/tablet/mobile; content capped (~1280px / ~65ch).
3. Mobile-first `min-width` breakpoints, 4–6 of them.
4. `gap` for spacing, logical properties, `clamp()` for fluid sections.
5. Container queries on reusable components; intrinsic grids for card walls.
6. Every value on the grid; whitespace used to express hierarchy.
