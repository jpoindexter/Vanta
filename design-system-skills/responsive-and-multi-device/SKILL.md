---
name: responsive-and-multi-device
description: Reference-grade playbook for responsive and adaptive design across every screen class — phone, tablet, laptop, desktop, TV, watch, foldable — using mobile-first breakpoints, fluid clamp() type, container queries, logical properties, and dvh/safe-area viewport handling.
tags: [design-systems, responsive, mobile-first, multi-device, breakpoints]
---
# Responsive & Multi-Device Design

One layout, every screen. The goal is not "make it shrink" — it's to serve the right *information density, interaction model, and ergonomics* for each device class. A phone is held one-handed with a thumb; a TV is driven by a D-pad from 10 feet; a watch is glanceable in 2 seconds. Same content, different affordances.

## Philosophy

- **Mobile-first** = author the small layout as the baseline, then *add* with `min-width` media/container queries. Progressive enhancement: the base CSS is the floor everyone gets; larger screens layer on. Smaller cascade, fewer overrides, better perf on weak devices.
- **Desktop-first** (`max-width`, graceful degradation) is legacy. Avoid for new work — you end up un-styling for mobile, which is more code and more bugs.
- **Content-first, not device-first.** Design the content, let it dictate where it breaks. Devices are a moving target; content is yours.
- **Responsive vs adaptive vs fluid:** *Fluid* = continuous scaling (`%`, `vw`, `clamp()`), no jumps. *Responsive* = fluid + breakpoint reflows. *Adaptive* = discrete fixed layouts swapped at thresholds (server-detected or JS), no in-between. Modern default: **fluid + a few responsive breakpoints**. Reserve adaptive for genuinely different device *classes* (e.g. a real TV/watch app, not a width).
- **Intrinsic web design** (Jen Simmons): let the content's natural size drive layout via `minmax()`, `auto-fit`, `clamp()`, `fit-content` — fewer hard breakpoints, no cliffs.

## Breakpoints

Prefer **content-driven** breakpoints: resize the browser, add one where the layout *breaks* (line length >~75ch, cramped columns, awkward gaps). Don't target specific devices — they change yearly.

| Class | Reference width | Common use |
|---|---|---|
| Small phone | 320–360px | absolute floor; must work at 320 |
| Phone | 390–430px | iPhone 14/15, modern Android |
| Tablet (portrait) | 768px | iPad mini/Air portrait |
| Tablet (landscape) / small laptop | 1024px | iPad landscape, 11" laptop |
| Desktop | 1280–1440px | mainstream laptop/monitor |
| Large desktop | 1920px+ | external monitors, cap content width |

- **Major** breakpoints reflow structure (1→2 columns); **minor** ones tweak spacing/type. Most design systems need **3–5 majors total**, not a dozen.
- **Use `em` for breakpoints**, not `px`: `@media (min-width: 48em)` respects the user's root font size / browser zoom. (`48em` = 768px at default 16px.)
- **Orientation:** `@media (orientation: landscape)`. Useful for tablet master-detail and short-viewport keyboard handling, not as a primary axis.
- Cap content with `max-width` + `margin-inline: auto` (e.g. text `max-width: 65ch`, shells `max-width: 1280px`) so 4K monitors don't stretch lines to 200ch.

```css
/* mobile-first, em breakpoints, content-capped */
.container { width: 100%; padding-inline: clamp(1rem, 5vw, 2rem); }
@media (min-width: 48em)  { .grid { grid-template-columns: 1fr 1fr; } }   /* 768 */
@media (min-width: 64em)  { .grid { grid-template-columns: 1fr 2fr 1fr; } } /* 1024 */
@media (min-width: 90em)  { .container { max-width: 1280px; margin-inline: auto; } } /* 1440 */
```

## Units & density

| Unit | Use it for | Avoid for |
|---|---|---|
| `rem` | type, spacing, radii — scales with user root | nothing; default choice |
| `em` | spacing relative to *local* font size, media queries | global spacing |
| `%` | fluid container widths | type sizes |
| `ch` | text measure / line length (`max-width: 65ch`) | non-text |
| `vw/vh` | hero sizing, but pair with `clamp()` | locking font size alone |
| `dvh/svh/lvh` | full-height mobile layouts (below) | — |
| `fr` | grid track distribution | fixed gutters |
| `px` | borders, 1px hairlines, fine detail | type, layout spacing |

- **`dvh` / `svh` / `lvh` solve the mobile URL-bar problem.** On mobile, `100vh` = the *largest* viewport (URL bar hidden), so a `height:100vh` element overflows when the bar is showing and content gets cut off. `svh` = small (bar shown), `lvh` = large (bar hidden), `dvh` = **dynamic** (resizes live as the bar shows/hides). Use `min-height: 100dvh` for app shells / full-screen heroes. Keep a `vh` fallback for old browsers: `min-height: 100vh; min-height: 100dvh;`.
- **Device pixel ratio (DPR):** CSS px ≠ device px. `@1x` (DPR 1) → 1 CSS px = 1 hardware px; `@2x` (Retina, most phones) = 2×2; `@3x` (iPhone Pro) = 3×3. Ship `srcset` with `1x/2x/3x` so a 2× screen gets a sharp image without a 3× screen over-downloading.
- **Cross-platform unit map:** iOS uses **pt** (1pt = 1px @1x = 2px @2x). Android uses **dp** (density-independent px, baseline 160dpi) for layout and **sp** (scalable px, respects user font-size) for text. The web's `rem` is the closest analog to `sp` — it scales with user preference. Reference math: iPhone 15 = 393pt wide × DPR 3 = 1179 physical px; design at 393 CSS px, export assets at 3×.

## Fluid technique — kill the breakpoint cliffs

`clamp(MIN, PREFERRED, MAX)` scales smoothly between two anchors so you don't need a media query for every size jump.

```css
:root {
  /* fluid type: 16px floor → 20px ceiling, scaling with viewport */
  --step-0: clamp(1rem, 0.9rem + 0.5vw, 1.25rem);
  --step-1: clamp(1.25rem, 1rem + 1.2vw, 2rem);    /* h3 */
  --step-2: clamp(1.6rem, 1.2rem + 2vw, 3rem);     /* h2 */
  /* fluid space scale */
  --space-s: clamp(0.75rem, 0.6rem + 0.7vw, 1.25rem);
  --space-l: clamp(2rem, 1.5rem + 2.5vw, 4rem);
}
h2 { font-size: var(--step-2); }
.stack > * + * { margin-block-start: var(--space-l); }

/* fluid grid: as many ~16rem cards as fit, no media queries */
.cards { display: grid; gap: var(--space-s);
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr)); }
```

- `min(16rem, 100%)` inside `minmax` prevents overflow on tiny screens (the column never exceeds the container).
- `auto-fit` collapses empty tracks (cards stretch); `auto-fill` keeps empty tracks (cards stay fixed-width). Pick `auto-fit` for "fill the row," `auto-fill` for "consistent card size."
- Use a tool like Utopia to generate the `clamp()` anchors from a min/max viewport + scale ratio. Don't hand-tune every value.

## Container queries — the design-system unlock

Media queries respond to the **viewport**; container queries (`@container`) respond to the **element's own container**. For reusable components this is decisive: the *same* card behaves correctly in a wide main column and a narrow sidebar without knowing the page layout.

```css
.card-wrap { container-type: inline-size; container-name: card; }

.card { display: grid; gap: 1rem; }
@container card (min-width: 30rem) {
  .card { grid-template-columns: 8rem 1fr; }  /* image beside text when wide */
}
```

- **Container query units:** `cqw`/`cqh` (1% of container width/height), `cqi`/`cqb` (inline/block — prefer these, they respect writing direction), `cqmin`/`cqmax`. Example: `font-size: clamp(1rem, 4cqi, 1.5rem)` scales type to the *container*, not the page.
- Rule of thumb: **container queries for components, media queries for page shell** (global nav, page columns, print).
- Baseline since 2023 across all evergreen browsers. Safe to use; provide a sensible no-query base layout for ancient browsers.

## Logical properties — write once, work in every direction

Use logical (flow-relative) properties instead of physical ones so RTL, vertical writing, and i18n work for free.

| Physical | Logical |
|---|---|
| `margin-left/right` | `margin-inline-start/end`, `margin-inline` |
| `margin-top/bottom` | `margin-block-start/end`, `margin-block` |
| `padding-left` | `padding-inline-start` |
| `width / height` | `inline-size / block-size` |
| `text-align: left` | `text-align: start` |
| `left / right` (inset) | `inset-inline-start/end` |

`padding-inline: 1rem` = left+right in LTR, automatically right+left in RTL. No mirrored stylesheet needed.

## Touch vs pointer — design for the input, not the width

A 1024px screen could be a touch tablet or a mouse laptop. **Width tells you nothing about input.** Query the input:

```css
@media (hover: hover) and (pointer: fine)  { .menu:hover .submenu { display:block; } } /* mouse */
@media (hover: none)  and (pointer: coarse) { .btn { min-height: 44px; } }            /* touch */
```

- **Touch target minimums:** Apple HIG **44×44pt**, Material/Android **48×48dp**, WCAG 2.2 (2.5.8) **24×24 CSS px** absolute floor. Design to **44–48px**. Space targets ≥8px apart.
- **Never gate critical UI behind `:hover`.** Touch has no hover — tooltips, hover menus, and reveal-on-hover content must have a tap/focus equivalent. `@media (hover: hover)` to *enhance*, never to *require*.
- **Thumb zones / reachability:** one-handed phone use puts the easy zone at the **bottom and center**. Put primary actions and nav in the bottom third; top corners are the hardest reach. This is why mobile apps use **bottom tab bars** and **bottom sheets**, not top nav.
- `pointer: coarse` (finger/stylus, imprecise) vs `pointer: fine` (mouse/trackpad). Use it to size hit areas, not to assume device class.

## Viewport & browser chrome

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

- `width=device-width, initial-scale=1` is mandatory — without it mobile browsers render at 980px and shrink. **Never** set `maximum-scale=1` / `user-scalable=no`: it blocks pinch-zoom and fails WCAG.
- `viewport-fit=cover` lets content extend under the notch/rounded corners — required for `env()` safe areas to do anything.
- **Safe-area insets** (notch, Dynamic Island, home indicator, foldable hinge): pad with `env(safe-area-inset-*)`. Combine with your own padding via `max()`:

```css
.app-bar  { padding-top:    max(1rem, env(safe-area-inset-top)); }
.bottom-nav { padding-bottom: max(0.5rem, env(safe-area-inset-bottom)); } /* clears home indicator */
.screen   { padding-inline: max(1rem, env(safe-area-inset-left), env(safe-area-inset-right)); }
```

- **On-screen keyboard:** it resizes the visual viewport, not the layout viewport. `100dvh` + the `VirtualKeyboard` API (`navigator.virtualKeyboard.overlaysContent = true`) and the `env(keyboard-inset-*)` values let you keep the input visible. At minimum, `scrollIntoView()` the focused field and avoid pinning critical controls to the bottom when an input is focused.
- **Address-bar resize:** handled by `dvh` (above). Don't lock heights with `100vh`.

## Per-device-class patterns

| Class | Layout | Navigation | Notes |
|---|---|---|---|
| **Phone** | single column, stacked | bottom tab bar, hamburger, **sheets/modals** | thumb-reachable actions, 44px targets, full-width CTAs |
| **Tablet** | **master-detail / split view**, 2 columns | sidebar or tab bar | support iPad Slide Over/Split View → treat as a *narrower* viewport, don't assume full width; portrait vs landscape differs a lot |
| **Desktop** | multi-pane, dense, sidebars | persistent top + side nav | hover affordances, keyboard shortcuts, right-click menus, denser tables, cursor precision allows small targets (but keep ≥24px) |
| **TV (10-foot UI)** | large, few items per screen, generous spacing | **D-pad focus traversal**, no cursor | huge type (min ~24–32px body, scale up), strong visible **focus state** (the focus ring *is* the cursor), respect **overscan** (5% safe margin), high contrast, no hover, no tiny text |
| **Watch** | one thing per screen, glanceable | crown/swipe, minimal taps | 2-second readability, largest type, single primary action, no dense data, complications-style summaries |
| **Foldable** | adapt to **posture** (folded/unfolded/half-open "tabletop"); avoid content under the **hinge** | reflows phone→tablet on unfold | use `env(fold-*)` / Viewport Segments API to detect the seam; **continuity** — preserve state across fold; book vs tabletop posture changes layout |

- TV focus: every interactive element needs an unmistakable focus style (`:focus-visible` with a thick ring/scale), and a logical spatial traversal order — D-pad moves between *visible neighbors*, so layout = navigation graph.
- Foldables: don't span a single text column across the hinge gap; split into two logical panes or shift content to one side.

## Responsive media

- **Images — resolution switching** (same image, different sizes): `srcset` + `sizes` lets the browser pick.
  ```html
  <img src="hero-800.jpg"
       srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1600.jpg 1600w"
       sizes="(min-width: 64em) 50vw, 100vw"
       alt="…" width="1600" height="900" loading="lazy" decoding="async">
  ```
  Always set `width`/`height` (or `aspect-ratio`) to reserve space and prevent CLS.
- **Art direction** (different *crop* per screen — wide banner on desktop, square on phone): `<picture>` with `<source media="...">`.
  ```html
  <picture>
    <source media="(min-width: 64em)" srcset="banner-wide.jpg">
    <img src="banner-square.jpg" alt="…">
  </picture>
  ```
- Modern formats: offer AVIF/WebP via `<picture><source type="image/avif">` with a JPEG fallback.
- `aspect-ratio: 16 / 9` on the container keeps media boxes stable while fluid; `object-fit: cover` for crop-to-fill.
- **Responsive tables:** wrap in `overflow-x: auto` for horizontal scroll as the floor; for true mobile reflow, switch to a **stacked card layout** (`display: block` rows with `data-label` pseudo-content) below a breakpoint. Never let a wide table cause the whole page to scroll horizontally.
- **Responsive type ramp:** define a modular scale once with `clamp()` (see Fluid section); don't redefine font sizes inside every breakpoint.

## Testing across devices

- **Reflow at 320px wide** with no horizontal scroll, and at **400% zoom** (WCAG 1.4.10 reflow) — both must keep all content/functions usable.
- DevTools device toolbar + responsive mode for fast iteration; throttle to mid-tier mobile + slow network.
- **Test on real devices** for the things emulators lie about: touch ergonomics, safe areas, dynamic viewport (URL bar), keyboard behavior, scroll momentum, real DPR rendering. At least one low-end Android and one iPhone.
- Use a device lab / cloud (BrowserStack, real hardware) for TV, watch, foldable — emulators don't capture D-pad focus or hinge posture.
- Check both orientations, light/dark, and `prefers-reduced-motion`.

## Common mistakes

| Don't | Do |
|---|---|
| Design only at 1440px (or only at 390px) | Design at the extremes + one mid; test 320 → 1920+ |
| `height: 100vh` for full-screen mobile | `min-height: 100dvh` (with `100vh` fallback) |
| Hover-only menus/tooltips | Tap/focus equivalent; `@media (hover:hover)` to enhance only |
| 12 breakpoints chasing devices | 3–5 content-driven, em-based breakpoints + `clamp()` fluid |
| Ignore notch/home indicator | `viewport-fit=cover` + `env(safe-area-inset-*)` |
| 30px touch targets, packed together | 44–48px targets, ≥8px apart |
| `user-scalable=no` | Allow pinch-zoom (accessibility) |
| Fixed `px` everywhere | `rem`/`clamp()` for type & space, `%`/`fr` for layout |
| Wide table breaks page (horizontal page scroll) | Scroll-container or stacked-card reflow |
| Physical `margin-left`/`text-align:left` | Logical `margin-inline-start`/`text-align:start` |
| Component queries the viewport | Component uses `@container`; only the shell uses media queries |
| Images with no `width`/`height` | Always set dimensions or `aspect-ratio` (no CLS) |

**Bottom line:** Build mobile-first with logical properties, let `clamp()` and `auto-fit` grids handle the in-between so you need only 3–5 real breakpoints, scope component responsiveness to `@container`, fix heights with `dvh` and edges with `env()` safe areas, size for the *input* (touch vs pointer) not the width, and treat TV/watch/foldable as distinct ergonomic classes — then verify on real hardware at 320px and 400% zoom.
