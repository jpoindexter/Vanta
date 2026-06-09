---
name: layout-and-composition
description: Reference-grade system for composing any screen — visual hierarchy, Gestalt grouping, alignment, whitespace, scanning patterns, and modern intrinsic CSS layout (Grid/Flexbox/subgrid/container queries/:has) with copy-pasteable recipes.
tags: [design-systems, layout, composition, hierarchy, gestalt]
---
# Layout & Composition

Composition is the deliberate arrangement of elements so the eye lands where you want, groups what belongs together, and never has to guess what matters. Hierarchy is the *what*; layout is the *where*. This skill is the bible for both. Apply it to any screen — marketing page, dense dashboard, settings form, mobile flow.

## 1. Visual hierarchy — ranking the eye's path

The eye does not read a screen top-to-bottom; it ranks elements by salience and jumps to the loudest. You control the ranking with these levers, roughly in order of power:

| Lever | How it raises rank | Watch out for |
|---|---|---|
| **Size / scale** | Bigger = more important. The strongest, fastest signal. | One hero only. Two "biggest" things = no hero. |
| **Weight** | Bolder text/heavier shapes advance. | Don't bold everything — bold loses meaning if overused. |
| **Color & saturation** | Saturated/warm advances; muted/cool recedes. One accent = one action. | Color alone fails for ~8% (colorblind) + low-vision. Pair with shape/text. |
| **Contrast** | High contrast vs background pulls focus. | Body text needs ≥4.5:1; large/UI ≥3:1 (WCAG AA). |
| **Position** | Top-left (LTR) reads first; center = focal; corners = utility. | Don't bury the primary action below the fold. |
| **Whitespace / isolation** | Space *around* an element isolates it → it reads as important. | The single most underused lever. |

**Establish three tiers explicitly.** Primary (the one thing — hero, the CTA), secondary (supporting — subhead, secondary buttons), tertiary (metadata, captions, legal). If you can't point at the one primary element, the screen has no hierarchy. A **focal point** is created by *contrast against context*: a saturated button on a calm page, a large number on a card of small labels. Isolation beats decoration — give the focal point room before you give it a glow.

**Don't stack levers redundantly.** Size *and* weight *and* color *and* a box on the same element is shouting — the eye can't rank four equally-loud things. One or two levers per tier is enough: a heading earns rank from size alone; a CTA from color + isolation. Reserve the loudest combination for the single primary element so it has nothing to compete with.

**Squint test.** Blur your eyes (or drop the design to 10% size). The element that still reads is your primary; if several do, or none does, the hierarchy is flat. This is the fastest hierarchy audit you have — run it on every screen before shipping.

```css
/* Type scale carries 80% of hierarchy. Use a ratio, not arbitrary px. */
:root {
  --step--1: clamp(0.83rem, 0.8rem + 0.15vw, 0.9rem);
  --step-0:  clamp(1rem,   0.95rem + 0.25vw, 1.125rem);  /* body */
  --step-1:  clamp(1.33rem, 1.2rem + 0.6vw, 1.6rem);
  --step-2:  clamp(1.77rem, 1.5rem + 1.3vw, 2.4rem);
  --step-3:  clamp(2.37rem, 1.9rem + 2.3vw, 3.6rem);      /* hero */
}
```

## 2. Gestalt principles — how the eye groups

Gestalt is *perception of grouping*. The brain auto-clusters before it reads. Use it to make structure feel obvious without borders.

| Principle | The eye perceives… | Concrete UI use |
|---|---|---|
| **Proximity** | Near things as one group. | Label sits 4px above its input, 24px from the next field → reads as one unit. The biggest grouping tool you have. |
| **Similarity** | Like-looking things as same kind. | All destructive actions red; all links one color → role learned once. |
| **Common region** | Things in a shared boundary as a set. | A card `background` + `border-radius` groups its contents, even with little spacing. |
| **Closure** | Implied/incomplete shapes as whole. | A 3-sided card edge, a progress ring, an icon outline read as complete. |
| **Continuity** | Aligned elements as a connected flow. | A shared left edge guides the eye down a list/form effortlessly. |
| **Figure / ground** | One layer as subject, rest as backdrop. | Modal + dim scrim; the dialog is figure, page is ground. Elevation = z-shadow. |
| **Common fate** | Things moving together as a group. | Accordion rows sliding in unison read as one section; a staggered list reads as items. |

**Rule:** spacing *between* groups must be visibly larger than spacing *within* a group. If inner and outer gaps are equal, proximity breaks and everything reads as one undifferentiated wall.

**Worked example — a form field.** Label `--s-1` (4px) above its input; help text `--s-1` below; the whole field block separated from the next by `--s-6` (24px). Now the eye reads three fields, not nine loose elements — and you've used zero borders. The same ratio drives list rows, nav sections, and card stacks: tight within, loose between.

**Stacking contexts and figure/ground in practice.** Elevation (`box-shadow`) and a higher `z-index` push an element forward as *figure*; a dim scrim (`background: rgb(0 0 0 / .5)`) pushes everything else back as *ground*. Keep a small, named elevation scale (e.g. `--e-1` card, `--e-2` dropdown, `--e-3` modal) rather than ad-hoc shadows, so depth reads as a system and z-index wars don't start.

## 3. Alignment, balance, rhythm

- **Alignment.** Every element should align to *something* — a grid line, a sibling's edge, a shared baseline. **Edge alignment** (shared left/right) is the workhorse; **center alignment** suits short, symmetric, isolated content (hero, empty state) but fails for ragged left edges (lists, forms) because the eye loses its return point. **Optical alignment** overrides mathematical: nudge a play-triangle, a quote mark, or an arrow icon so it *looks* centered, not so its bounding box is. A single misaligned edge reads as broken even when nothing else is wrong.
- **Proximity / grouping** → see Gestalt §2. Group with space first, region (card/divider) second.
- **Balance.** **Symmetric** = formal, stable, calm (landing heroes, auth screens). **Asymmetric** = dynamic, modern; balance a large element against several small ones (visual weight, not mirror image). A dashboard is asymmetric by nature — balance a wide chart against a stacked column of stat cards.
- **Tension** is intentional imbalance — an off-center subject, a diagonal, a deliberate overlap — used to draw the eye and add energy. Use sparingly; uncontrolled tension reads as a mistake.
- **Rhythm & repetition.** Consistent spacing, recurring card shapes, a repeated type scale create rhythm the eye predicts and relaxes into. **Repetition** is what makes a design feel like a *system*; break it only to signal "this is different."
- **Contrast, scale, dominance.** Contrast (size/weight/color/space) creates the difference that makes hierarchy legible. **Dominance** = one element clearly wins; without a dominant element, the composition has no entry point.

**Grid as alignment backbone.** A column grid (commonly 12 columns on desktop, 4–8 on smaller) gives every element a legal edge to snap to, so alignment is enforced by structure rather than vigilance. Define it once with named lines or `repeat()` and place blocks on it. A **baseline grid** (vertical rhythm — line-heights and spacing as multiples of a base, e.g. 4px) does the same for the vertical axis: text baselines and block edges land on a predictable cadence, which is why a system *feels* tidy even when nothing is consciously noticed.

```css
.grid-12 { display: grid; grid-template-columns: repeat(12, 1fr); gap: var(--s-6); }
.feature { grid-column: 1 / 8; }   /* span 7 cols */
.aside   { grid-column: 8 / -1; }  /* fill to the last line */
```

## 4. Whitespace / negative space

Whitespace is not empty — it is an active grouping and hierarchy tool. **Macro whitespace** = space between major blocks/sections (sets page rhythm, signals importance, gives the page air). **Micro whitespace** = space between lines, words, list items, label-and-input (sets legibility and intra-group cohesion). More space *around* an element raises its perceived rank — luxury/premium UIs are mostly whitespace.

Density is a deliberate choice, not an accident. Offer modes:

| Mode | Use | Row height | Section gap |
|---|---|---|---|
| **Comfortable** | Marketing, reading, onboarding | 48–56px | 64–96px |
| **Cozy** (default) | Most apps | 40–44px | 32–48px |
| **Compact** | Data tables, power tools, IDEs | 28–32px | 16–24px |

```css
/* Spacing token scale — one source of truth, multiples of a base. */
:root { --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-6:24px; --s-8:32px; --s-12:48px; --s-16:64px; }
[data-density="compact"] { --row: 30px; --gap: var(--s-4); }
[data-density="comfortable"] { --row: 52px; --gap: var(--s-12); }
```

The core law: **perceived grouping is a function of relative spacing.** Halve the gap inside a group and double it between groups before you reach for a single border.

## 5. Scanning patterns

- **F-pattern** — text-heavy pages (articles, search results, docs). Eyes scan the top line, drop down the left edge, scan again. Front-load headings and the start of each line with the meaningful word; never bury a verb at line-end.
- **Z-pattern** — sparse pages (landing, hero, sign-up). Eye sweeps top-left → top-right (logo → nav/CTA), diagonally to bottom-left, then bottom-right (final CTA). Place logo, primary nav, and the closing CTA on the Z's anchor points.
- **Layer-cake** — alternating headings and content blocks; users scan headings/subheads and dip into bodies that matter. Make headings genuinely scannable and self-describing.
- **Spotted** — goal-directed scanning for a specific element (a price, a button, an error). Make the target visually distinct so the spotting succeeds fast.
- **Reading direction / RTL.** LTR primacy is top-left; for RTL (Arabic, Hebrew) it mirrors to top-right. Use **logical properties** (`margin-inline-start`, `inset-inline-end`) and `dir="rtl"` so layout flips automatically — never hardcode `left`/`right`.
- **Above the fold** is fuzzy across devices but real: the first viewport must communicate what this is and offer the primary action or a clear scroll affordance. Don't cram everything above it — earn the scroll.

**Match layout to the scan you expect.** A landing page is Z/spotted → big hero, sparse, one CTA on the diagonal. A docs page is F/layer-cake → strong left-aligned headings, scannable subheads, short line-start verbs. A data table is spotted → align numerics right, keep one accent for the cell that matters. Designing a content-heavy article like a sparse landing (centered, huge type) destroys the F-scan; designing a landing like an article (dense left rail of text) buries the CTA. The pattern is a constraint, not a decoration.

## 6. Responsive layout patterns

Catalog of recurring page skeletons and the responsive strategy each uses:

| Pattern | Shape | Use |
|---|---|---|
| **Centered column** | `max-width` measure (60–75ch), auto margins | Reading, articles, settings |
| **Sidebar + content** | Fixed/min sidebar, fluid main | Docs, app shells, dashboards |
| **Holy grail** | Header, footer, fluid center, two flank rails | Classic app shell |
| **Split / 50-50** | Two equal panes | Auth, compare, before/after |
| **Master–detail** | List rail + detail pane; collapses to stack on mobile | Mail, settings, chat |
| **Card grid** | Auto-fitting responsive cards | Galleries, products, catalogs |

**Responsive strategies** (Brad Frost): **mostly-fluid** (fluid grid, reflows then stacks — simplest, default for most); **column-drop** (full-width columns drop one-by-one as width shrinks); **layout-shifter** (layout meaningfully rearranges per breakpoint — most control, most maintenance); **off-canvas** (secondary nav/panels slide off-screen, summoned on demand — mobile nav). **Intrinsic web design** (Jen Simmons): let content size itself — `auto-fit` + `minmax()`, `flex-wrap`, `min()/max()/clamp()` — so the layout responds to *content and container*, not just a handful of device breakpoints. Prefer intrinsic methods; reach for `@media` breakpoints only where intrinsic rules can't express the change.

**Breakpoints are content-driven, not device-driven.** Don't chase device widths (iPhone, iPad…) — they change yearly and you'll never cover them all. Add a breakpoint where *the layout breaks*: a line gets too long, a card too cramped, columns too narrow. Common anchors: ~`30rem`/480px (phone→large phone), ~`48rem`/768px (→tablet/stack-to-row), ~`64rem`/1024px (→sidebar appears), ~`80rem`/1280px (→max content width / multi-column). Treat these as starting guesses you adjust by eye.

**The `min()` column trick** prevents the classic `minmax()` overflow on tiny screens. `minmax(16rem, 1fr)` overflows below 16rem; `minmax(min(16rem, 100%), 1fr)` clamps to 100% and never blows out the viewport. Use it in every `auto-fit` grid.

## 7. CSS implementation — Flexbox vs Grid, and recipes

**Choose by dimensionality.** **Flexbox** = one axis, content-driven distribution (toolbars, button rows, tag lists, nav, anything that should wrap by content size). **Grid** = two axes, layout-driven structure (page skeletons, card galleries, forms, anything with row *and* column alignment). They compose — Grid for the page, Flex inside cells.

```css
/* Sticky footer — page fills viewport, footer pinned to bottom. */
body { min-block-size: 100dvh; display: grid; grid-template-rows: auto 1fr auto; }

/* Perfectly centered card — modern, no margin hacks. */
.center { display: grid; place-items: center; min-block-size: 100dvh; }

/* Responsive sidebar shell — sidebar shrinks to content, main takes the rest. */
.shell { display: grid; grid-template-columns: minmax(200px, 18rem) 1fr; gap: var(--s-6); }
@media (max-width: 48rem) { .shell { grid-template-columns: 1fr; } } /* stack on mobile */

/* Intrinsic auto-grid gallery — NO media queries; cards reflow by available width. */
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  gap: var(--s-6);
}

/* Stack → row by content (the "RAM" / Switcher pattern). */
.cluster { display: flex; flex-wrap: wrap; gap: var(--s-4); }

/* Subgrid — align card internals (title/body/footer) across a row. */
.card-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem,1fr)); gap: var(--s-6); }
.card { display: grid; grid-row: span 3; grid-template-rows: subgrid; } /* titles/bodies/footers line up */
```

**Logical properties** (`block`/`inline`, `inset-*`, `margin-inline`, `padding-block`) make layouts direction- and writing-mode-agnostic — default to them over physical `top/left/width/height`.

**Container queries** make components responsive to *their container*, not the viewport — the same card adapts whether dropped in a sidebar or a full-width grid. This is component-level responsive design and the single biggest 2024+ shift.

```css
.card-wrap { container-type: inline-size; container-name: card; }
@container card (min-width: 22rem) {
  .card { grid-template-columns: 8rem 1fr; }   /* media beside text when the container is wide */
}
```

**`:has()` for layout reactions** — parent responds to children, no JS:

```css
.layout:has(> .sidebar) { grid-template-columns: 16rem 1fr; } /* only when a sidebar exists */
.field:has(:invalid) { border-color: var(--danger); }
```

**Worked recipe — full holy-grail app shell, intrinsic + container-aware.**

```css
.app-shell {
  display: grid;
  min-block-size: 100dvh;
  grid-template:
    "header  header" auto
    "sidebar main"   1fr
    "footer  footer" auto / minmax(0, 16rem) 1fr;
  gap: var(--s-4);
}
.app-shell > header { grid-area: header; }
.app-shell > .sidebar { grid-area: sidebar; }
.app-shell > main { grid-area: main; container-type: inline-size; min-inline-size: 0; }
.app-shell > footer { grid-area: footer; }

@media (max-width: 48rem) {                 /* stack on small screens */
  .app-shell { grid-template:
    "header" auto "main" 1fr "footer" auto / 1fr; }
  .app-shell > .sidebar { display: none; }  /* move to off-canvas drawer */
}
```

`min-inline-size: 0` on `main` is load-bearing: grid/flex children default to `min-width: auto`, which lets long content (a wide table, a `<pre>`) refuse to shrink and blow out the layout. Set it to `0` (or `min-width:0`) on any flex/grid child that holds variable-width content.

## 8. Aspect ratio, overflow, sticky, safe areas

```css
.thumb { aspect-ratio: 16 / 9; object-fit: cover; }     /* reserve space, no layout shift */
.scroll-x { overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; }
.sticky-head { position: sticky; inset-block-start: 0; z-index: 10; }  /* table/section headers */
.app { padding: env(safe-area-inset-top) env(safe-area-inset-right)    /* notches, home indicators */
        env(safe-area-inset-bottom) env(safe-area-inset-left); }

/* Robust truncation: needs min-width:0 on the flex item or it never shrinks. */
.truncate { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Multi-line clamp (2 lines, then ellipsis). */
.clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
```

- **Overflow strategy:** decide per region — wrap (clusters), scroll (tables, horizontal card rails with snap), truncate (`text-overflow: ellipsis` on a single line with `min-width:0` on the flex child), or paginate. Never let content silently clip.
- **Sticky vs fixed:** `sticky` flows with content then pins (section headers, sub-nav); `fixed` leaves flow entirely (toolbars, FABs). Fixed elements must not cover content — pad the scroll container for their height.
- **Content-out vs canvas-in:** design *content-out* (let real content determine size, then constrain) rather than *canvas-in* (fix a frame and pour content in). Content-out survives translation, long names, dynamic data, and zoom.

## 9. Cross-device & touch realities

- **Use `dvh`/`svh`/`lvh`, not `vh`.** Mobile browser chrome shrinks/grows the viewport; `100vh` overflows behind the URL bar. `100dvh` (dynamic) tracks the visible area; `svh`/`lvh` give the small/large extremes when you need stability.
- **Touch targets ≥ 44×44px** (Apple HIG) / 48×48px (Material) with spacing between them — fingers aren't cursors. Don't pack tappable rows tighter than `--row` 44px on touch.
- **Thumb zones.** On phones, the bottom third is the easy-reach zone; the top is a stretch. Put primary actions (compose, next, pay) at the bottom — bottom bars and FABs exist for this. Reserve the top for back/title/secondary.
- **Hover is not guaranteed.** Don't hide critical info or actions behind `:hover` — touch has no hover. Gate hover-only affordances with `@media (hover: hover)` and provide a tap path.
- **Respect motion preference.** Wrap transitions/parallax in `@media (prefers-reduced-motion: reduce)` and disable them — vestibular safety, not polish.
- **Orientation & foldables.** Test portrait *and* landscape; don't assume tall. Avoid layouts that only work at one orientation; intrinsic grids handle both for free.

```css
.sheet { block-size: 100dvh; }                          /* mobile-safe full height */
@media (hover: hover) { .row:hover .actions { opacity: 1; } } /* reveal only where hover exists */
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

## 10. Do / Don't

**Do:** establish one clear primary element per screen · group with whitespace before borders · keep gaps between groups larger than within · align every element to a shared edge or grid · constrain text to a 60–75ch measure · use `clamp()`/`min()`/`max()` and `auto-fit minmax()` for fluidity · let components respond via container queries · use logical properties · reserve image space with `aspect-ratio`.

**Don't:** center everything (ragged-left lists/forms must left-align) · make every element compete (no hierarchy) · mix alignment edges within a group · fight the grid with one-off margins and absolute positioning · set fixed heights on text containers (causes overflow/clip on zoom or translation) · ignore reflow at 200%/400% zoom · use color as the *only* signal · cram everything above the fold.

## 11. Common mistakes (and the fix)

1. **Centering everything.** Looks tidy empty, falls apart with real content. → Left-align lists, forms, multi-line text; reserve center for short isolated content.
2. **No hierarchy / everything bold.** Nothing stands out. → Pick ONE primary, demote the rest with size/weight/color/space.
3. **Inconsistent alignment.** A single stray edge reads as broken. → Snap everything to a shared grid; audit by squinting for misaligned edges.
4. **Fighting the grid.** Pixel-pushed margins and absolute positioning to force a look. → Express intent in Grid/Flex; if you're nudging by 1px constantly, the structure is wrong.
5. **Fixed heights on dynamic content.** Truncation, clipping, overlap when text grows, translates, or zooms. → Use `min-height`, let content size the box, handle overflow explicitly.
6. **Ignoring reflow / zoom.** Layout breaks at 200% zoom or 320px width. → Test at 320px and 400% zoom; use relative units and intrinsic layouts so it reflows, not scrolls in two axes.
7. **Equal inner/outer spacing.** Groups dissolve. → Make outer gaps visibly larger than inner.
8. **Viewport-only thinking.** Components that look right full-width break in a sidebar. → Make components respond to their container, not the page.
9. **`100vh` on mobile.** Content hides behind the URL bar / overflows. → Use `100dvh` (or `svh`/`lvh`).
10. **Magic-number spacing.** Random `13px`/`27px` margins → no rhythm, impossible to maintain. → Spacing from a token scale only (multiples of a 4px base).
11. **Min-width auto overflow.** A wide table or `<pre>` blows out a flex/grid layout. → `min-width:0` / `min-inline-size:0` on the variable-width child.
12. **Tiny touch targets.** Sub-44px tap zones, packed tight → misfires on phones. → ≥44–48px with spacing; bigger in the thumb zone.
