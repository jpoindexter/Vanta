---
name: components-and-states
description: Reference-grade guide to designing and building UI components — anatomy, the full interaction-state matrix, variants vs sizes vs states, sizing tokens, per-component anatomy/states/a11y, and modern headless/data-state/CSS patterns across web, iOS, Android, and desktop.
tags: [design-systems, components, states, variants, patterns]
---
# Components, Variants & States

A component is a contract: a stable **anatomy** (named parts), an **API** (props/slots), and a complete **state matrix**. Ship all three or you ship a liability. The #1 source of "feels broken" UI is missing states — not missing features.

## 1. Component anatomy — the parts model

Every component decomposes into named parts. Name them; style each part independently; expose them as slots. Headless libraries (Radix, ARK, React Aria) formalize this as `Root`, `Trigger`, `Content`, `Item`, etc.

```
┌─ Container (Root) ──────────────────────────────┐
│  [leading slot]  Label / Value  [trailing slot] │
│                  Helper / Description text       │
└─────────────────────────────────────────────────┘
```

| Part | Role | Example |
|---|---|---|
| **Container / Root** | Bounding box, owns padding/radius/border, carries `data-state` | the `<button>`, the field wrapper |
| **Leading** | Icon, avatar, prefix, adornment | search glass in input |
| **Label** | Primary text, the accessible name | "Save changes" |
| **Value / Content** | Live content | input text, selected option |
| **Trailing** | Action, chevron, clear, counter, status | clear-X, dropdown caret |
| **Helper / Description** | Secondary text below | "We'll never share this" |
| **Error / Validation** | Replaces helper when invalid | "Email is required" |

**Rule:** A slot accepts arbitrary children (composition); a prop configures a fixed dimension (config). Prefer slots for content, props for behavior/appearance. See §9.

## 2. The interaction state matrix (define + treat EVERY one)

This is the heart of the skill. Each state needs a defined **visual treatment** and **a11y signal**. Use `data-state` attributes (set by headless libs or your own code) + native pseudo-classes.

| State | When | Visual treatment | Signal |
|---|---|---|---|
| **default / rest** | idle, interactive | base bg/border/text; sufficient affordance to look clickable | — |
| **hover** | pointer over (pointer devices only) | subtle bg/elevation/underline shift; never the *only* affordance | `:hover` |
| **focus** | element focused (any input) | — (avoid showing for mouse) | `:focus` |
| **focus-visible** | focused via keyboard | **2px visible ring, 2px offset, ≥3:1 contrast** | `:focus-visible` |
| **active / pressed** | pointer/key down | darken/scale 0.97/inset shadow; ~instant | `:active`, `[data-state=active]` |
| **selected / checked** | chosen in a set | filled/accent bg, check glyph, bold | `[aria-selected]`, `[aria-checked]`, `:checked` |
| **disabled** | not interactive *and reason exists* | 38–50% opacity OR muted token; `cursor:not-allowed`; **no hover** | `:disabled`, `[aria-disabled]` |
| **loading / busy** | async in flight | spinner replaces/joins label, keep width stable, lock interaction | `[aria-busy=true]`, `[data-state=loading]` |
| **error / invalid** | failed validation | danger border + helper→error text + icon (not color alone) | `[aria-invalid=true]` |
| **read-only** | viewable, not editable, still focusable/copyable | muted bg, normal text, no edit caret | `[readonly]`, `aria-readonly` |
| **expanded / open** | disclosure open | rotated chevron, revealed panel | `[aria-expanded=true]`, `[data-state=open]` |
| **dragging** | being dragged | raised elevation, 0.8 opacity, grabbing cursor, placeholder gap | `[data-dragging]`, `[aria-grabbed]` |
| **indeterminate** | partial (tri-state checkbox) | dash glyph | `:indeterminate` |
| **placeholder / empty** | no value yet | muted placeholder text (not a label substitute) | — |

**Combined states** are real: `hover + selected`, `focus-visible + invalid`, `loading + disabled`. Test them. **Precedence** (highest wins): `disabled` > `loading` > `error` > `selected/active` > `focus-visible` > `hover` > `rest`. A disabled element shows no hover and no error styling change on pointer.

```css
/* Modern state-driven button — pseudo-classes + data-state + tokens */
.btn {
  --btn-bg: var(--accent-9);
  --btn-fg: white;
  display: inline-flex; align-items: center; gap: var(--space-2);
  block-size: var(--control-h-md); padding-inline: var(--space-4);
  border-radius: var(--radius-2); border: 1px solid transparent;
  background: var(--btn-bg); color: var(--btn-fg);
  font: inherit; cursor: pointer;
  transition: background .12s, box-shadow .12s, transform .04s;
}
.btn:where(:hover)            { --btn-bg: var(--accent-10); }
.btn:active                   { transform: translateY(.5px) scale(.99); }
.btn:focus-visible            { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.btn:disabled,
.btn[aria-disabled="true"]    { opacity: .5; cursor: not-allowed; }
.btn[aria-busy="true"]        { pointer-events: none; }
.btn[data-state="loading"] .btn__label { visibility: hidden; }
/* :where() keeps specificity 0 so app overrides win without !important */
```

Use `:is()`/`:where()` to group selectors, and `:has()` for parent-aware styling (`.field:has(:invalid)` lights the whole field). Prefer `:focus-visible` over `:focus` — never strip the ring without replacing it.

## 3. Variants vs sizes vs states vs shape

Keep these axes **orthogonal**. A button is `variant × size × state`, not 30 hand-named classes.

- **Semantic variants** (intent/emphasis): `primary` (one per view), `secondary`, `tertiary`, `ghost` (transparent until hover), `outline`, `danger`/destructive, `link`. Map to *meaning*, not color — themes reskin them.
- **Sizes** (one scale, shared across controls):

| Size | Height | Padding-X | Font | Icon | Radius |
|---|---|---|---|---|---|
| `sm` | 32px | 12px | 13–14px | 16px | 6px |
| `md` | 40px | 16px | 14–16px | 20px | 8px |
| `lg` | 48px | 20px | 16–18px | 24px | 10px |

- **Shape**: `rounded` (default), `pill` (`border-radius: 9999px`), `square` (icon-only). Shape ≠ size.
- **States**: §2 — runtime, never a variant.

**Props API design:** `variant`, `size`, `shape`, plus boolean state-ish props (`disabled`, `loading`, `selected`). Booleans use `is/has/can/should`. Avoid boolean explosion (`isPrimary isSecondary…`) — use one `variant` union. Validate at the boundary (Zod / TS union). Slots (`leadingIcon`, `children`, `trailingIcon`) over a dozen content props.

## 4. Core components — anatomy · states · a11y

| Component | Key parts | States that MUST exist | a11y essentials |
|---|---|---|---|
| **Button** | container, leading, label, trailing | rest/hover/focus-visible/active/disabled/**loading** | `<button type>`; loading→`aria-busy`; icon-only→`aria-label` |
| **Icon-button** | square container, icon | + tooltip on hover/focus | `aria-label` required; min 40×40 hit area |
| **Input / Textarea** | wrapper, label, leading, field, trailing, helper/error | rest/hover/focus/filled/**invalid**/disabled/read-only | real `<label for>`; `aria-invalid`+`aria-describedby`→error id; textarea: `field-sizing:content` |
| **Select / Combobox** | trigger(value+chevron), listbox, option, group | closed/**open**/option hover/**selected**/disabled/loading/empty | `role=combobox` `aria-expanded`; typeahead; ↑↓/Home/End/Esc; selected→`aria-selected` |
| **Checkbox / Radio** | control box, check/dot, label | unchecked/checked/**indeterminate**(cb)/focus-visible/disabled/invalid | native input + styled box; radio = one Tab stop, arrows move; label clickable |
| **Switch / Toggle** | track, thumb, label | off/on/focus-visible/disabled/loading | `role=switch` `aria-checked`; instant + animated thumb |
| **Slider** | track, range fill, thumb(s), ticks | rest/hover/dragging/focus-visible/disabled | `role=slider` `aria-valuemin/max/now`; arrows ±step, PageUp/Down ±10% |
| **Card** | container, media, header, body, footer, actions | rest; if interactive → hover/focus-visible/active/selected | whole-card link → one focusable; don't nest interactives without care |
| **Badge / Chip / Tag** | container, leading dot/icon, label, (removable) ✕ | static; chip adds selected/disabled/removable | removable ✕ → own `aria-label`; status by icon+text, not color alone |
| **Avatar** | image, fallback initials/icon, status dot | loaded/**fallback(error)**/loading | `alt` = name or `""` if decorative; status dot needs text equivalent |
| **Tooltip** | trigger, content, arrow | hidden/**open** | hover *and* focus; `aria-describedby`; never the only place info lives; not for interactive content |
| **Popover** | trigger, content, arrow | closed/open | focus moves in, `Esc` closes, returns focus; `aria-expanded` |
| **Modal / Dialog** | overlay, container, header(title+close), body, footer | closed/open/loading | `role=dialog` `aria-modal`, labelled by title; **focus trap**; `Esc`; scroll-lock; restore focus |
| **Drawer / Sheet** | scrim, panel, handle | closed/open/dragging(swipe) | same as dialog; edge-swipe on mobile; respects safe-area insets |
| **Toast / Snackbar** | container, icon, message, action, dismiss | enter/visible/exit; queued | `role=status`(polite)/`role=alert`(assertive); auto-dismiss ≥5s + pause-on-hover; never errors-only-here |
| **Tabs** | tablist, tab, indicator, tabpanel | rest/hover/**selected**/focus-visible/disabled | `role=tablist/tab/tabpanel`; arrows move, `aria-selected`; manual vs automatic activation |
| **Accordion** | item, header(button), content | collapsed/**expanded**/focus-visible/disabled | header is a `<button aria-expanded>`; `data-state=open/closed`; animate `grid-template-rows:0fr→1fr` |
| **Menu / Dropdown** | trigger, content, item, separator, sub-trigger | closed/open/item hover/focus/disabled/checked | `role=menu/menuitem`; ↑↓ wrap, typeahead, `Esc`, roving tabindex |
| **Breadcrumb** | `<nav aria-label>`, ol, item, separator, current | links; **current**(not a link) | `aria-current="page"` on last; separators decorative/`aria-hidden` |
| **Pagination** | prev, page numbers, ellipsis, next | rest/hover/**current**/disabled(ends) | `<nav aria-label="Pagination">`; current → `aria-current="page"` |
| **Table** | table, thead, th(sortable), tbody, row, cell | row hover/selected; col sort asc/desc; loading(skeleton rows)/empty | `<th scope>`; sortable th → button + `aria-sort`; caption; sticky header |
| **List** | list, item, leading, content, trailing, dividers | item rest/hover/selected/disabled; loading/empty | `<ul>/<ol>`; selectable → `role=listbox/option` or `aria-selected` |
| **Nav (top/side/bottom)** | nav, items, current, icon+label | item rest/hover/**current/active**/focus-visible | `<nav aria-label>`; current → `aria-current="page"`; bottom-nav ≥48dp targets |
| **Search** | wrapper, leading glass, input, clear, results/suggest | empty/typing/loading/results/**no-results**/clear | `role=searchbox` or `type=search`; debounce; announce result count via live region |
| **Segmented control** | track, segment, indicator | rest/hover/**selected**/focus-visible/disabled | radiogroup semantics; arrows move; one selected always |
| **Progress / Spinner** | track, fill OR rotating arc | determinate(0–100)/indeterminate | `role=progressbar` `aria-valuenow`; spinner → `aria-label="Loading"`; respect reduced-motion |
| **Skeleton** | shimmer blocks matching final layout | loading only | `aria-hidden=true` + parent `aria-busy`; match real content dimensions to avoid layout shift |

## 5. Sizing tokens

| Token group | Values | Notes |
|---|---|---|
| Control heights | 32 / 40 / 48 (px) | sm/md/lg; some systems add 24 (xs) / 56 (xl) |
| **Touch target min** | **44×44px (iOS HIG)**, **48×48dp (Android Material)** | even if visual is smaller, pad the hit area |
| Padding scale | 4 / 8 / 12 / 16 / 20 / 24 | `--space-*`; inline padding ≈ height × 0.4 |
| Icon sizes | 16 / 20 / 24 (px) | pair with sm/md/lg control |
| Radius scale | 0 / 2 / 4 / 6 / 8 / 12 / 9999 | 9999 = pill; keep ≤3 in active use |
| Border | 1px (hairline), 2px (focus ring) | ring offset 2px |

Touch targets are non-negotiable on mobile: a 24px icon-button needs invisible padding to reach 44/48. Spacing between adjacent targets ≥8px.

## 6. States in code — attributes & theming

Drive styling off semantic attributes, not class soup:

```html
<button data-state="loading" aria-busy="true" disabled>…</button>
<div role="tab" aria-selected="true" data-state="active" tabindex="0">…</div>
<div class="field" data-invalid>
  <input aria-invalid="true" aria-describedby="email-err" />
  <p id="email-err" role="alert">Enter a valid email.</p>
</div>
```

```css
/* Per-component theming via CSS custom properties — override anywhere up the tree */
.field {
  --field-border: var(--gray-7);
  --field-ring: var(--accent-8);
}
.field:has(:focus-visible) { box-shadow: 0 0 0 2px var(--field-ring); }
.field:has([aria-invalid="true"]),
.field[data-invalid]       { --field-border: var(--red-8); }
.field input               { border: 1px solid var(--field-border); }
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

`data-state` (open/closed/active/loading) reads cleanly, is what Radix/ARK emit, and survives SSR. Reserve ARIA for *semantics the AT needs* (`aria-busy`, `aria-invalid`, `aria-expanded`), not for styling hooks you could express with `data-*`.

## 7. Density, RTL, theming, composition, control model

- **Density modes:** a single `--density` knob scaling heights/padding (comfortable 40 / compact 32 / spacious 48). Drive via `data-density` on root → recompute token sizes. Don't shrink touch targets below platform minimums in compact mode on touch devices.
- **RTL:** use **logical properties** everywhere (`margin-inline-start`, `padding-block`, `inset-inline-start`, `text-align: start`). Set `dir="rtl"`; mirror directional icons (chevrons, back arrows) but not literal ones (clock, logos). `:dir(rtl)` selector for the rest.
- **Theming hooks:** token layers — primitive (`--blue-500`) → semantic (`--accent-9`, `--fg`, `--bg`) → component (`--btn-bg`). Theme by reassigning semantic tokens (`[data-theme=dark]`). Support `color-scheme` + `prefers-color-scheme`. Never hardcode hex in a component.
- **Composition over config:** prefer `<Card><Card.Header/><Card.Body/></Card>` slots over a 20-prop `<Card title subtitle media footer …/>`. Slots scale; config props don't (rule of 3 before adding a prop).
- **Controlled vs uncontrolled:** support both. Uncontrolled (internal state, `defaultValue`) for simple cases; controlled (`value` + `onChange`) when the parent owns truth. Pattern: `value ?? internalState`. Document which props make it controlled. Never silently switch a component between the two.

## 8. Cross-platform component equivalences

| Concept | Web | iOS (UIKit / SwiftUI) | Android (Material 3) | Desktop |
|---|---|---|---|---|
| Button | `<button>` | `UIButton` / `Button` | `Button` / `FilledButton` | native button widget |
| Switch | `role=switch` | `UISwitch` / `Toggle` | `Switch` | toggle/checkbox |
| Select | `<select>`/combobox | `UIPickerView` / `Picker` | `ExposedDropdownMenu` | `<select>` / NSPopUpButton |
| Slider | `<input type=range>` | `UISlider` / `Slider` | `Slider` | native slider |
| Modal | `<dialog>`/role=dialog | sheet / `.sheet` | `Dialog` / `ModalBottomSheet` | window/dialog |
| Drawer/Sheet | role=dialog sheet | bottom sheet / `.sheet` | `ModalBottomSheet` | side panel |
| Toast | role=status | no native (build) | `Snackbar` | system notification |
| Tabs | role=tablist | `UITabBar`(bottom) / `TabView` | `TabRow` (top) | tab strip |
| Segmented | radiogroup | `UISegmentedControl` / `Picker(.segmented)` | `SegmentedButton` | segmented control |
| Nav (primary) | top/side `<nav>` | bottom `UITabBar` | bottom `NavigationBar` / rail | side menu / titlebar |

Platform conventions differ: iOS puts primary nav at the **bottom tab bar**; Material uses **bottom navigation** (≤5 items) or a **nav rail/drawer**; web is flexible (top or side). Respect each platform's default control rather than porting web pixel-for-pixel. Map *intent* to native components; don't reskin a web button to look iOS-native — use the platform control.

## 9. Common mistakes (do / don't)

| Don't | Do |
|---|---|
| Strip `outline` / only style `:focus` | Use `:focus-visible` with a 2px, 3:1-contrast ring + offset |
| Disable a button with no explanation | Show *why* (inline error, tooltip on a wrapper) or keep enabled + validate on submit |
| Convey state by **color alone** | Pair color with icon + text (error icon + message; status label) |
| Hover-only affordances (desktop-only reveal) | Make actions reachable by keyboard + touch; hover is enhancement |
| Skip loading / empty / error states | Design all four: rest, loading (skeleton/spinner), empty, error — every data view |
| Width jumps when label → spinner | Reserve width; swap label visibility, keep box size |
| `<div onClick>` everywhere (div soup) | Semantic `<button>/<a>/<input>` — free a11y, focus, keyboard |
| Placeholder as the label | Real `<label>`; placeholder is a hint, disappears on type |
| Per-component ad-hoc sizes | One shared size scale (sm/md/lg) across all controls |
| Tooltip holding the only copy of info | Tooltips supplement; critical info lives in the DOM |
| `!important` to win specificity | `:where()` for zero-specificity base, let app layers override |
| Animate with no `prefers-reduced-motion` guard | Wrap motion; provide reduced/instant fallback |
| `aria-*` to fake a native control | Use the native element; add ARIA only when HTML can't express it |
| One Tab stop per radio/menu item | Roving tabindex: group is one stop, arrows move within |

**Checklist before "component done":** anatomy named · all §2 states defined incl. combined · focus-visible ring · disabled has a reason · loading/empty/error exist · touch target ≥44/48 · keyboard-operable · labelled for AT · sizes from the scale · RTL via logical props · reduced-motion honored · controlled+uncontrolled supported.
