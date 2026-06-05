---
name: accessibility-and-inclusive-design
description: Reference-grade guide to shipping WCAG 2.2 AA accessible, inclusively designed interfaces across web, native iOS/Android, and desktop — semantic-first markup, contrast/APCA, keyboard, screen readers, forms, touch/motor, motion/cognition, testing, and the legal floor (EAA/Section 508).
tags: [design-systems, accessibility, a11y, wcag, inclusive]
---
# Accessibility & Inclusive Design

Accessibility is not a feature toggle or a final-pass audit — it is a property of correct UI construction. Build it in or rebuild it later. This is the bar for production: **WCAG 2.2 Level AA**, every screen, every platform. Automated tools catch ~30% of issues; the rest is keyboard, screen reader, and judgment. Treat this document as the working reference, not an aspiration.

## 1. WCAG 2.2 structure — POUR

WCAG is organized under four principles. Memorize them; every requirement maps to one.

| Principle | Means | Failure example |
|---|---|---|
| **Perceivable** | Users can perceive the content (sight, sound, touch) | Image with no alt; 2:1 contrast text |
| **Operable** | Users can operate the UI (any input method) | Control reachable by mouse only |
| **Understandable** | Content and operation are predictable | Error says "invalid input" with no fix |
| **Robust** | Works with current and future assistive tech (AT) | Custom `<div>` widget with no role/state |

**Conformance levels:** **A** (must — basics, keyboard, alt text), **AA** (the legal/industry target — contrast, reflow, focus, names), **AAA** (aspirational, not required wholesale — 7:1 contrast, sign language). Ship **AA**. Conformance is per-page and all-or-nothing: a page conforms only if **every** applicable success criterion (SC) at that level is met, with no AT-blocking content anywhere in the page or in any process (e.g. checkout) it belongs to.

### The new WCAG 2.2 success criteria (added Oct 2023)

These are the ones teams miss because they post-date most a11y muscle memory. All are AA unless noted.

| SC | Name | Requirement |
|---|---|---|
| **2.4.11** | Focus Not Obscured (Minimum) | When an element gets keyboard focus, it is **not entirely hidden** by author content (sticky headers, cookie bars, chat widgets). |
| 2.4.12 | Focus Not Obscured (Enhanced) | AAA — focus indicator **not obscured at all**. |
| **2.4.13** | Focus Appearance | The focus indicator is **at least as large as a 2px-thick perimeter** of the component and has **≥3:1 contrast** between focused/unfocused states. (AAA, but treat as the design target.) |
| **2.5.7** | Dragging Movements | Any drag operation has a **single-pointer alternative** (e.g. click-to-move, tap targets, up/down buttons) unless dragging is essential. |
| **2.5.8** | Target Size (Minimum) | Interactive targets are **≥24×24 CSS px**, OR have ≥24px spacing to neighbors, OR are inline in a sentence. (AAA 2.5.5 wants 44px.) |
| **3.2.6** | Consistent Help | If help (contact, chat, FAQ link) appears on multiple pages, it appears in the **same relative order** each time. |
| **3.3.7** | Redundant Entry | Don't make users re-enter info they already gave in the same process — autofill it or let them select it. |
| **3.3.8** | Accessible Authentication (Minimum) | No **cognitive function test** (memorize/transcribe a password, solve a puzzle, identify objects) as the only way to authenticate. Allow password managers (don't block paste), email/OTP, passkeys, WebAuthn. |

> One SC (4.1.1 Parsing) was **removed** in 2.2 — modern parsers handle duplicate IDs/malformed markup. Still write valid HTML; it just isn't a conformance line anymore.

## 2. Color & contrast

Color is the most-failed category in automated scans. Two independent rules: contrast ratios, and never-color-alone.

| Content | Min ratio (AA) | AAA |
|---|---|---|
| Normal text (<18.66px / <24px) | **4.5:1** | 7:1 |
| Large text (≥24px, or ≥18.66px bold) | **3:1** | 4.5:1 |
| **Non-text** (icons, input borders, focus rings, chart series, toggle states) — SC 1.4.11 | **3:1** | — |
| Disabled controls / pure decoration | exempt | — |

```css
/* FAIL: #999 on #fff = 2.85:1 — fails normal text */
.muted { color: #999; }
/* PASS: #767676 on #fff = 4.54:1 */
.muted { color: #767676; }
/* Non-text: a 1px #ddd input border is ~1.2:1 → invisible to low vision. Use ≥3:1. */
input { border: 1px solid #767676; }
```

- **Never convey meaning by color alone** (SC 1.4.1). Required field: add `*` + text, not just a red label. Error state: icon + message, not just a red border. Chart series: pattern/label/direct annotation, not hue only. Link in body text: underline it, don't rely on blue.
- **APCA** (Accessible Perceptual Contrast Algorithm) is the contrast model proposed for WCAG 3.0. It scores **lightness contrast (Lc, roughly 0–106)** and accounts for font weight/size and polarity (dark-on-light vs light-on-dark) — fixing WCAG 2.x's known failures (it over-passes mid greys, mis-rates dark mode). Rough APCA targets: **Lc 90** for body text, **Lc 75** for larger/medium, **Lc 60** for large headings, **Lc 45** for non-text/large UI, **Lc 30** is the floor for any text. Use APCA to *design* contrast, but **conform to WCAG 2.2 ratios** until WCAG 3 lands.
- **Color blindness** affects ~8% of men, ~0.5% of women. Types: **protanopia/protanomaly** (red-weak), **deuteranopia/deuteranomaly** (green-weak — most common), **tritanopia** (blue-weak, rare), **achromatopsia** (no color). Checks: red/green status pairs are the classic trap (use blue/orange, or add icons/text); never "click the green button"; test with a simulator (Chrome DevTools Rendering → Emulate vision deficiencies, Sim Daltonism on macOS, Stark).

## 3. Keyboard operability

If it works with a mouse but not a keyboard, it is broken. Keyboard access is the foundation for switch devices, voice control, and most screen-reader use.

- **Everything operable by keyboard** (SC 2.1.1). `Tab`/`Shift+Tab` to move, `Enter`/`Space` to activate (Space for buttons/checkboxes, Enter for links), arrows within composite widgets, `Esc` to dismiss.
- **No keyboard trap** (SC 2.1.2). Focus must be able to leave any component via keyboard. The *only* intentional trap is a modal — and even then `Esc` (or a close button) must release it.
- **Logical focus order** (SC 2.4.3) follows reading/DOM order. Don't reorder visually with CSS (`order`, absolute positioning) in a way that diverges from DOM — it desyncs tab order from what's seen.
- **Visible focus** (SC 2.4.7) — non-negotiable. Never `outline: none` without a replacement.

```css
/* Use :focus-visible so mouse clicks don't show a ring but keyboard does. */
:focus-visible {
  outline: 3px solid #1a73e8;     /* ≥3:1 vs adjacent colors (2.4.11/2.4.13) */
  outline-offset: 2px;            /* ≥2px perimeter, fully visible */
}
/* Forbidden: */
button:focus { outline: none; }   /* removes the only signal for keyboard users */
```

- **`tabindex` rules:** `0` = in natural order; `-1` = focusable by script only (not by Tab — for managing focus in widgets/dialogs); **never use positive values** — they hijack global order and create chaos.
- **Skip link** (SC 2.4.1) — first focusable element, jumps past the nav to `<main>`. Visible on focus:

```html
<a href="#main" class="skip-link">Skip to main content</a>
<!-- … nav … -->
<main id="main" tabindex="-1"> … </main>
```
```css
.skip-link { position: absolute; left: -9999px; }
.skip-link:focus { left: 1rem; top: 1rem; /* on-screen, high contrast */ }
```

- **Focus trapping in modals:** on open, move focus into the dialog and remember the opener; constrain `Tab`/`Shift+Tab` to focusable children (wrap from last→first and first→last); on close, **return focus to the opener**; close on `Esc`. Mark background inert with `inert` attribute (or `aria-hidden="true"` on siblings).
- **Roving tabindex** for composite widgets (toolbars, radio groups, menus, tabs, grids): exactly **one** child has `tabindex="0"`, the rest `-1`; arrow keys move the `0` and call `.focus()`. The whole widget is one tab stop. (Alternative: `aria-activedescendant`.)
- **Shortcuts** (SC 2.1.4): single-character shortcuts (e.g. `j`/`k`) must be remappable, toggleable off, or active only on focus — or they fire while typing in fields and disrupt voice/AT users.

## 4. Screen readers & semantics

**The first rule of ARIA: don't use ARIA.** A native element with the right semantics beats any ARIA you'll bolt on. Reach for ARIA only when HTML genuinely can't express the pattern. Bad ARIA is worse than none.

### Semantic HTML first

- **Landmarks** structure the page for AT navigation: `<header>`, `<nav>`, `<main>` (one per page), `<aside>`, `<footer>`, `<form>`, `<section aria-label>`. Screen-reader users jump between them.
- **Headings** `<h1>`–`<h6>` are the #1 navigation tool for SR users. **One `<h1>` per page**; never skip levels (no `<h2>`→`<h4>`); style with CSS, not heading rank. Don't fake a heading with bold text.
- **Lists** (`<ul>`/`<ol>`/`<dl>`) announce item counts ("list, 5 items"). Group repeated items as a list.
- **Buttons vs links:** `<button>` performs an action (submit, toggle, open dialog); `<a href>` navigates to a URL/location. A `<div onclick>` is **not** focusable, not keyboard-operable, and announces nothing. Never reinvent these.

```html
<!-- WRONG: not focusable, no role, no keyboard, no announcement -->
<div class="btn" onclick="save()">Save</div>
<!-- RIGHT -->
<button type="button" onclick="save()">Save</button>
```

### Accessible names (every interactive element needs one)

Precedence (later overrides earlier): `aria-labelledby` → `aria-label` → native (`<label>`, `alt`, text content) → `title`.

```html
<!-- visible text IS the name — best -->
<button>Delete invoice</button>
<!-- icon-only button needs an explicit name -->
<button aria-label="Close dialog"><svg aria-hidden="true">…</svg></button>
<!-- point at existing visible text -->
<h2 id="prefs">Notification preferences</h2>
<section aria-labelledby="prefs">…</section>
<!-- extra detail, announced after the name -->
<input aria-describedby="pw-hint">
<p id="pw-hint">At least 12 characters.</p>
```

- **Images:** meaningful → `alt="describes content/function"`; decorative → `alt=""` (empty, not missing — missing makes SRs read the filename); complex (charts) → short `alt` + long description nearby or via `aria-describedby`. Alt for a linked image describes the *destination/action*, not the picture.
- **Live regions** announce dynamic changes without moving focus: `aria-live="polite"` (waits for a pause — status, "Saved", search-result counts), `aria-live="assertive"` (interrupts — errors, time-critical). Roles `role="status"` (=polite) and `role="alert"` (=assertive) are shorthand. The container must exist **empty in the DOM before** you inject text. Don't overuse assertive — it's rude and disorienting.
- **State & properties** must be exposed and **kept in sync** as the UI changes:

| ARIA | Use |
|---|---|
| `aria-expanded="true/false"` | Disclosure, accordion, menu, combobox trigger |
| `aria-selected="true/false"` | Tabs, options, grid cells |
| `aria-checked="true/false/mixed"` | Custom checkbox/radio/switch (`mixed` = indeterminate) |
| `aria-disabled="true"` | Disabled but still in AT tree (unlike `disabled`, stays announced/focusable) |
| `aria-invalid="true"` | Field failing validation; pair with `aria-describedby` → error text |
| `aria-current="page/step/true"` | Current item in a set (nav, breadcrumb, pagination) |
| `aria-hidden="true"` | Remove from AT tree (decorative icons) — **never on focusable content** |
| `aria-pressed="true/false"` | Toggle button |
| `aria-controls` / `aria-owns` | Relate trigger to the thing it controls |

- **`role` only when HTML can't.** `role="tablist/tab/tabpanel"`, `role="dialog"`, `role="menu"` etc. carry obligations: if you take the role, you owe the full keyboard interaction model and state management for it (see WAI-ARIA Authoring Practices Guide / APG). A half-built `role="tab"` is worse than three `<a>` links.

## 5. Forms

Forms are where most real-world a11y fails for users with cognitive, motor, or vision needs.

- **Visible, persistent labels** — programmatically associated. **Placeholder is not a label**: it vanishes on input, fails contrast, and is invisible to many AT setups.

```html
<!-- WRONG -->
<input type="email" placeholder="Email">
<!-- RIGHT: explicit association via for/id -->
<label for="email">Email address</label>
<input id="email" type="email" name="email"
       autocomplete="email" required aria-describedby="email-err">
<p id="email-err" role="alert" hidden>Enter a valid email, e.g. name@site.com</p>
```

- **Errors** (SC 3.3.1 identify, 3.3.3 suggestion): identify the field in text, describe what's wrong, **suggest a fix**. Bad: "Invalid." Good: "Phone must be 10 digits, e.g. 5551234567." Set `aria-invalid="true"` and link the message with `aria-describedby`. On submit, **move focus to the first error** (or a summary `role="alert"` listing each error as a link to its field).
- **`required`** native attribute conveys requirement to AT; `aria-required="true"` for custom controls. Pair with a visible "(required)" or marked optional — don't rely on `*` alone (announce it: include "required" in the label, or `aria-label`).
- **`autocomplete`** (SC 1.3.5) with standard tokens (`name`, `email`, `tel`, `street-address`, `cc-number`, `one-time-code`) lets browsers/password managers/AT fill fields — critical for motor and cognitive users, and required by SC 3.3.8.
- **Grouping:** related controls (radio sets, address blocks, "shipping vs billing") go in `<fieldset>` with a `<legend>` — the legend is announced with each control so the group context isn't lost.
- **Inline validation a11y:** validate on blur or submit, not on every keystroke (firing errors mid-typing is hostile to SR and cognitive users). Use `aria-live` regions or `role="alert"` so the change is announced. Never disable the submit button as the only error feedback — SR users can't tell why it's dead.

## 6. Touch & motor

- **Target size:** WCAG 2.2 floor **24×24 CSS px** (SC 2.5.8) or 24px spacing; design target **44×44 (iOS HIG)** / **48×48 dp (Android Material)** for thumbs and tremor/low-precision users. Small visual control? Expand the hit area with padding or a pseudo-element — the *touch target*, not the glyph, must be big.
- **Spacing** between targets prevents mis-taps; cramped toolbars/icon rows are a motor-accessibility failure even at 24px each.
- **Dragging alternatives** (SC 2.5.7): every drag-and-drop, slider, or reorder needs a single-pointer path (buttons, click-to-place, a numeric input, up/down). Don't ship drag-only.
- **Gesture alternatives** (SC 2.5.1 Pointer Gestures): **no path-based or multipoint-only gestures**. Pinch-zoom, two-finger rotate, swipe-along-a-path must have a simple single-tap/click equivalent. Carousel swipe → also give prev/next buttons.
- **Pointer cancellation** (SC 2.5.2): fire actions on **`up`/`click`, not `down`** — so a user who presses the wrong target can slide off to cancel. No `mousedown`/`touchstart` triggers for destructive actions.
- **`target-size` is per-pointer**, but mouse precision varies too (Parkinson's, RSI) — generous targets help everyone.

## 7. Motion & cognition

- **Respect reduced motion** (SC 2.3.3): heed the OS setting. Don't just slow animation — for vestibular disorders, remove parallax, large slides, zoom, and auto-spin; replace with a cut/fade.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- **No seizure triggers** (SC 2.3.1): nothing flashes **more than 3 times per second**, and avoid large/saturated-red flashes. Applies to GIFs, video, loaders, and canvas/WebGL.
- **Auto-playing / moving content** (SC 2.2.2): anything that moves, blinks, scrolls, or auto-updates for >5s needs a **pause/stop/hide** control (carousels, tickers, marquees, auto-advancing video).
- **Plain language** (relates to 3.1.5): short sentences, common words, expand acronyms on first use, front-load the action. Help dyslexia, ADHD, autism, low literacy, and non-native readers — and everyone under stress.
- **Consistent navigation & identification** (SC 3.2.3, 3.2.4): same nav order across pages; the same component named/iconned the same way everywhere. Predictability lowers cognitive load.
- **Error prevention** (SC 3.3.4, 3.3.6): for legal/financial/data-deleting actions, make submissions **reversible, checked, or confirmed**. "Are you sure?" + an undo window beats a silent destructive click.
- **Timeouts** (SC 2.2.1): warn before a session/timer expires and let users **extend** (≥20s warning, extendable ≥10×), unless the limit is essential (e.g. auction). Don't silently log people out mid-form.
- **No reflow loss / supports zoom** (SC 1.4.10): content reflows to a single column at **320px wide (≈400% zoom)** with no horizontal scroll or clipping. **Text resizes to 200%** (SC 1.4.4) without breaking — use `rem`/`em`, never block zoom (`user-scalable=no` is a violation), and respect **text spacing** overrides (SC 1.4.12).

## 8. Native platform accessibility

The principles are identical; the APIs differ. Lean on platform primitives — they ship correct semantics for free.

**iOS — VoiceOver (UIKit/SwiftUI):**
- Use standard controls (`UIButton`, `UISwitch`) — they carry roles. Set `accessibilityLabel` (name), `accessibilityHint` (what happens), `accessibilityValue` (current value), and `accessibilityTraits` (`.button`, `.header`, `.selected`, `.adjustable`). SwiftUI: `.accessibilityLabel()`, `.accessibilityHint()`, `.accessibilityAddTraits()`, `.accessibilityValue()`.
- **Dynamic Type:** use text styles (`.body`, `.headline`) so text scales to the user's size; test at the largest accessibility sizes; don't hardcode font sizes or clip at large scales. Support **Bold Text**, **Reduce Motion** (`UIAccessibility.isReduceMotionEnabled`), and **Increase Contrast**.
- Group related elements (`accessibilityElement(children: .combine)`), order with `accessibilitySortPriority`, mark decorative views hidden, expose custom actions via the rotor.

**Android — TalkBack (Views/Compose):**
- `contentDescription` for non-text controls (`null` for decorative). Compose: `Modifier.semantics { contentDescription = … }`, `Modifier.clickable` (gives role/focus), `Role.Button`. Use `stateDescription` for toggles, `heading()` for headings, `liveRegion` for announcements.
- Honor **font scale** (`sp` units, never `dp`/`px` for text), **touch targets ≥48dp** (`minimumInteractiveComponentSize`), and the **Remove Animations** setting. Use `mergeDescendants` to group, `traversalIndex` for order.

**Desktop (macOS/Windows/Linux & Electron):** native apps inherit the OS accessibility tree (NSAccessibility, UI Automation, AT-SPI) when using standard controls — label custom controls explicitly. Electron/web-in-shell apps follow all the web rules above; also ensure full keyboard menus, OS high-contrast themes, and OS reduce-motion are respected.

## 9. Testing

Automated tools find ~**30%** of issues — they cannot judge alt-text quality, focus order, name accuracy, or whether a custom widget makes sense. **Manual testing is mandatory.**

1. **Keyboard pass** (do this first, every PR): unplug the mouse. Tab through — can you reach **and operate** everything? Is focus **always visible** and never obscured? Logical order? Can you escape every modal? Any trap?
2. **Screen reader pass:** **VoiceOver** (macOS `Cmd+F5`, iOS), **NVDA** (Windows, free), **TalkBack** (Android), JAWS (enterprise Windows). Navigate by heading, landmark, link, form field. Are names, roles, states announced correctly? Test in the **OS-native pairing** (VoiceOver+Safari, NVDA+Firefox/Chrome, TalkBack+Chrome) — combos differ.
3. **Automated scan:** **axe-core** (DevTools extension or `@axe-core/playwright` in CI), **Lighthouse** (a11y category), Pa11y, WAVE. Run in CI as a regression gate — but never as the whole strategy.
4. **Contrast:** browser DevTools contrast inspector, WebAIM Contrast Checker, the APCA calculator, Stark/Polypane for whole-page sweeps.
5. **Zoom & reflow:** browser zoom to **200%** (text legible, nothing clipped) and **400%** (single-column reflow, no horizontal scroll at 320px). Mobile pinch-zoom must work.
6. **Real assistive tech & real users:** test with switch control, voice control (Voice Control/Dragon), magnification — and, where possible, with disabled users. Lived experience surfaces what tools and checklists miss.

## 10. Inclusive design beyond compliance

WCAG is the **floor**, not the goal. Inclusive design widens who can use the product and makes it better for everyone.

- **Disability is a mismatch, not a trait** — between a person and their context. It's a spectrum of **permanent / temporary / situational**: one-arm amputee (permanent), broken arm (temporary), holding a baby (situational) all benefit from one-handed operation. Design for the spectrum and you cover far more people than the "permanent" count suggests.
- **Curb-cut effect:** features built for disability help everyone — captions help in loud bars and quiet offices, voice control helps while driving, high contrast helps in sunlight, large targets help on the train. Accessibility is broad usability.
- **Cognitive load** is an accessibility concern: minimize steps and choices, chunk information, use progressive disclosure, keep layouts and labels consistent, write plainly, prevent and forgive errors. Helps ADHD, autism, anxiety, low literacy, fatigue.
- **Neurodivergence:** offer dark mode and reduced-motion; avoid auto-playing audio/video and aggressive animation; don't rely on metaphor/idiom; make state and progress explicit; respect literal interpretation; give clear undo. Predictability and control over sensory load matter more than polish.

## 11. The legal floor

- **EAA (European Accessibility Act):** from **28 June 2025**, a broad class of consumer products and services (e-commerce, banking, e-books, transport, comms) sold in the EU must be accessible — effectively to **EN 301 549 / WCAG 2.1 AA** (moving toward 2.2). Real enforcement and penalties.
- **US Section 508** (federal) and **ADA** (private sector, via case law) — DOJ's 2024 rule sets **WCAG 2.1 AA** for state/local government web and apps.
- **Bottom line:** target **WCAG 2.2 AA** and you satisfy the current legal regimes worldwide with headroom.

## 12. Common mistakes (the ones that actually ship)

| Mistake | Why it breaks | Fix |
|---|---|---|
| Placeholder as the label | Vanishes on input, low contrast, no AT name | Real `<label for>` |
| `<div>`/`<span>` as a button | Not focusable, no role, no keyboard | `<button>` |
| `outline: none` with no replacement | Keyboard users lose all focus signal | `:focus-visible` ring ≥2px, ≥3:1 |
| ARIA on top of broken HTML | Conflicting/duplicate semantics confuse AT | Fix the HTML; remove the ARIA |
| `role` without the keyboard model | Announces "tab" but arrows/state don't work | Implement full APG pattern or use links |
| Color-only meaning (red = error) | Invisible to color-blind/low-vision users | Add icon + text |
| Contrast fails (#999, thin grey borders) | Unreadable for low vision; fails 1.4.3/1.4.11 | 4.5:1 text, 3:1 non-text |
| Motion with no opt-out | Triggers vestibular disorders/migraine | `prefers-reduced-motion` + pause control |
| Icon-only control, no name | Announces nothing / reads filename | `aria-label` + `aria-hidden` on the glyph |
| Focus hidden behind sticky header | Keyboard user can't see where they are | `scroll-margin`, respect SC 2.4.11 |
| Empty/missing `alt` confusion | Missing → filename read aloud; wrong → noise | `alt=""` decorative, descriptive otherwise |
| `aria-hidden` on focusable content | Element is operable but silent to AT | Never hide focusable nodes |
| Auto-advancing carousel, no controls | Moving content, fails 2.2.2 | Pause/prev/next, stop on focus/hover |
| Skipped heading levels / multiple h1 | Breaks SR document outline navigation | One h1, sequential levels, style via CSS |
| Drag-only reorder, swipe-only nav | Fails 2.5.7 / 2.5.1 for motor users | Add single-pointer/button alternative |
| Blocking paste / puzzle CAPTCHA login | Fails 3.3.8, defeats password managers | Allow paste, OTP/passkeys, no cognitive test |

**Working order for any screen:** semantic HTML → accessible names → keyboard pass → visible focus → contrast → states/live regions → screen-reader pass → zoom/reflow → reduced motion → automated scan as the backstop. Build it in; don't bolt it on.
