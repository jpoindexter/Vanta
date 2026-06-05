---
name: atomic-design
description: Brad Frost's atomic design methodology (atoms → molecules → organisms → templates → pages) for architecting scalable, multi-platform design systems — use when structuring a component library, mapping tokens to components, organizing Figma/code component trees, or deciding the right level of abstraction for a UI element.
tags: [design-systems, atomic-design, architecture]
---
# Atomic Design — methodology for building scalable design systems

Atomic design is a mental model for **decomposing interfaces into reusable, composable parts** and reassembling them into screens. It is not a folder structure you copy blindly; it is a vocabulary for talking about *granularity* and *composition* so designers and engineers agree on what a "component" is and where it lives. Use it to make a design system legible, not to satisfy a taxonomy.

The core insight: interfaces are not pages, they are **systems of components**. Build the system, and pages fall out of it. The five stages give you a shared language for the spectrum from raw style primitive to fully-composed screen.

## The five stages

| Stage | Definition | Composable? | UI examples (cross-platform) |
|-------|-----------|-------------|------------------------------|
| **Atoms** | Smallest functional UI units; can't be broken down without losing meaning. | Building blocks | Button, input, label, icon, checkbox, avatar, badge, spinner, switch, a single `Text` style |
| **Molecules** | A small group of atoms bonded into a unit with one job. | Atoms → 1 unit | Search field (input + button + label), form field (label + input + error), list row (avatar + title + chevron), tag chip with remove icon |
| **Organisms** | Relatively complex, self-contained sections made of molecules/atoms. | Molecules → section | Nav bar, card, comment thread, product tile, data table, bottom tab bar, settings group |
| **Templates** | Page-level layout: organisms arranged into a structure, **placeholder content only**. | Layout skeleton | Article layout, dashboard grid, checkout scaffold, master-detail split |
| **Pages** | A template filled with **real, representative content** — the highest-fidelity artifact. | Instance | The actual article, a populated dashboard, a real product page |

### Atoms
The irreducible primitives. An atom has a single responsibility and no internal layout decisions about *other* components. A `Button` is an atom; a button *with an icon and a dropdown* is not. Atoms are where your **design tokens** become visible — an atom is the smallest place a color, font size, radius, or spacing token gets applied.

> Litmus test: if removing a child element changes *what the thing fundamentally is*, you've gone below the atom. A label without its text is still a label; a search field without its input is no longer a search field.

### Molecules
Atoms doing one job together. The classic example is a search form: a `label` atom + `input` atom + `button` atom become a `SearchField` molecule. Molecules are the "do one thing well" layer — they encapsulate a small interaction (enter a query, toggle a setting, pick a date) and become genuinely reusable. Most of your *useful* reusable components live here and at the organism level.

### Organisms
Distinct, recognizable sections of an interface. A `Header` organism might contain a logo atom, a `SearchField` molecule, and a `NavList` molecule. Organisms can contain other organisms. They are where layout, responsive behavior, and meaningful state (loading, empty, error) tend to concentrate. On native platforms, a `BottomTabBar` or a `NavigationStack` header is an organism.

### Templates
Templates strip out real content and show **structure**: where the header goes, how the grid flows, what stacks on mobile. They are the design-system equivalent of a wireframe made of real organisms. Templates answer "how is this page laid out and how does it reflow?" without committing to copy or data. In code, a template is often a layout component or a route's skeleton (e.g. a Next.js `layout.tsx`, an `ArticleLayout` with named slots).

### Pages
Templates with real, representative content plugged in — including the *edge cases* that break naive designs: the 40-character name, the empty list, the 3,000-comment thread, the right-to-left locale. Pages are where you **validate the system against reality**. If a page looks wrong, you fix the template or the organisms, not the page. Pages are instances, not new components.

## The chemistry analogy — and its limits

The atoms/molecules/organisms metaphor is a *teaching device*, not a law. Its value: it conveys **hierarchy and composition** at a glance and gives non-overloaded names (unlike "component," "module," "widget," which mean ten things). Its limits, which you must hold honestly:

- **The boundaries are fuzzy.** Is a labeled input an atom or a molecule? Reasonable teams disagree. Don't litigate it — pick a convention and document it.
- **It implies strict containment that real UIs violate.** Organisms contain organisms; molecules sometimes wrap a single atom. Chemistry doesn't, UIs do. That's fine.
- **It says nothing about *behavior, state, or data*** — only structure. A design system also needs token architecture, state conventions, and accessibility rules the metaphor doesn't address.
- **The five buckets are not five folders by mandate.** Many mature systems collapse to three tiers (primitives / components / patterns) or use feature folders. The metaphor is the thinking tool; the file layout is a separate decision.

Treat the five stages as a **spectrum of granularity**, and the names as shorthand for points on it. Don't force every component to declare a stage on its birth certificate.

## Atomic design ↔ design tokens

Tokens and atomic design are complementary layers, not competitors. Tokens are the **sub-atomic** layer — the values atoms consume.

- **Atoms ↔ tokens.** An atom is the first place a token is *applied*. `Button` reads `color.action.primary`, `space.inset.md`, `radius.button`, `font.label`. The atom is the contract between the token system and the rendered pixel.
- **Use the W3C DTCG token format** (`$value` / `$type`, JSON) so tokens are tool-agnostic and transformable (Style Dictionary, Tokens Studio). Three semantic tiers:
  - **Primitive / global** — raw values: `color.blue.600 = #2563EB`, `space.4 = 16px`. Never referenced directly by components.
  - **Semantic / alias** — intent: `color.action.primary → {color.blue.600}`, `color.text.error`. Components reference *these*.
  - **Component-scoped** (optional) — `button.background.default → {color.action.primary}`. Use only when a component needs to diverge; over-using this tier explodes the token count.

```json
{
  "color": {
    "blue":   { "600": { "$value": "#2563EB", "$type": "color" } },
    "action": { "primary": { "$value": "{color.blue.600}", "$type": "color" } }
  },
  "space": { "4": { "$value": "16px", "$type": "dimension" } }
}
```

**Cross-platform payoff:** one token source → Style Dictionary emits CSS custom properties for web, Swift/Compose constants for iOS/Android, and JSON for desktop (Tauri/Electron). Atoms on every platform read the *same* semantic tokens, so a brand-color change is one edit, not N.

## Atomic design ↔ code

The metaphor maps to **composition over inheritance**. You don't subclass a `Button` into a `SearchButton`; you *compose* a `Button` atom inside a `SearchField` molecule. Modern component patterns enforce this:

- **Headless / primitive components** (Radix, React Aria, Ark UI, Headless UI) give you unstyled, accessible *behavior* atoms. You apply tokens via styling. This separates the hard part (a11y, keyboard, focus, ARIA) from the easy part (looks).
- **Slots / compound components** are how molecules and organisms compose without prop-drilling. A `Card` exposes `Card.Header`, `Card.Body`, `Card.Footer`; a `Dialog` uses `Trigger`/`Content`/`Title`. This is composition made literal.
- **Component-driven development**: build atoms → molecules → organisms in isolation, document and test each in **Storybook** (one story per state per level), then assemble. CDD + atomic design are the same idea from two directions.

```tsx
// Atom — single concern, consumes tokens, no layout of others
export function Button({ variant = "primary", ...props }: ButtonProps) { /* ... */ }

// Molecule — composes atoms for one job
export function SearchField({ onSearch }: SearchFieldProps) {
  return (
    <form role="search" onSubmit={/* ... */}>
      <Label htmlFor="q">Search</Label>
      <Input id="q" name="q" />
      <Button type="submit"><Icon name="search" /></Button>
    </form>
  );
}

// Organism — composes molecules + atoms into a section
export function Header() {
  return <header><Logo /><SearchField onSearch={/* ... */} /><NavList /></header>;
}
```

## Naming & organization

Name by **what it is**, not where it sits (`SearchField`, not `Molecule_03`). Keep the atomic stage out of the import path if you can — consumers should write `import { SearchField } from "@/ui/search-field"`, not care that it's a molecule. Two viable layouts:

```
# Strict atomic (good for teaching, design-eng handoff parity with Figma)
ui/
  atoms/      button/  input/  icon/
  molecules/  search-field/  form-field/
  organisms/  header/  data-table/
  templates/  article-layout/

# Tiered + feature (scales better past ~100 components)
ui/
  primitives/   # atoms: button, input, icon
  components/    # molecules + simple organisms
  patterns/      # complex organisms + templates
features/
  checkout/      # screen-specific compositions live with the feature
```

Files `kebab-case`, components `PascalCase`. Co-locate `component.tsx`, `component.stories.tsx`, `component.test.tsx`, and tokens/styles. **Mirror this structure in Figma** (see below) so a designer and an engineer point at the same node.

## Templates vs pages — why both exist

This distinction is the most-skipped and most-valuable part. **Templates verify structure; pages verify reality.**
- A template proves the *layout system* works: reflow, grid, slot order, responsive breakpoints — with neutral placeholder content.
- A page proves the *content system* works: real strings, real data volumes, real edge cases. Pages surface the bugs templates hide (overflow, truncation, empty states, pluralization, RTL).

If you only build pages, you can't reuse layout. If you only build templates, you ship designs that shatter on real data. Build both; let page failures drive fixes *upstream* into templates and organisms.

## How it relates to other models

- **ITCSS (Inverted Triangle CSS):** a *CSS specificity* architecture (settings → tools → generic → elements → objects → components → utilities). Orthogonal to atomic design — ITCSS organizes *stylesheets*, atomic design organizes *components*. They coexist: tokens live in ITCSS "settings," atoms in "components."
- **Material Design / HIG / Fluent:** platform design *languages* with their own component sets. Material 3's tokens and components map cleanly onto atomic thinking — Material "components" are largely your molecules/organisms, Material tokens are your sub-atomic layer. Atomic design is the *methodology*; Material/HIG/Fluent are *specific systems* you can structure atomically.
- **Design Tokens (DTCG):** the sub-atomic layer (above). Complement, not alternative.
- **Component-Driven Development:** same philosophy, build-order emphasis.

## When atomic design breaks down

The failure mode is **taxonomy worship** — spending energy on "is this a molecule or organism?" instead of shipping. Watch for:

- **Over-nesting.** A `Button` atom inside a `ButtonGroup` molecule inside a `Toolbar` organism inside a `Header` organism inside a `Page`… five layers of indirection to change a padding value. Flatten.
- **Premature abstraction.** Don't promote something to a shared atom/molecule on first sight. **Rule of 3: a thing earns a place in the system only after 3 real, concrete uses.** Before that it's a local component in the feature folder. Abstracting at use #1 bakes in the wrong API.
- **Bucket-arguing.** If two people disagree which stage something is, the answer rarely matters — pick one, document it, move on.
- **Premature templates.** Don't build a template library before you have organisms worth arranging.

When the metaphor causes more meetings than it saves, drop to three tiers (primitives / components / patterns) and keep the *composition discipline*. The discipline is the value; the five Greek-derived nouns are not.

## Bottom-up vs top-down

- **Bottom-up (atoms → pages):** purest atomic approach. Strong, reusable foundation; risk of building atoms nobody needs and stalling before delivering a screen.
- **Top-down (page → decompose):** start from a real screen the business needs, **extract** atoms/molecules as you find repetition. Faster to ship, system grows from proven need (aligns with Rule of 3).
- **Recommended: middle-out.** Design 2–3 real key screens (top-down) to discover the *actual* vocabulary, then build the atoms/molecules those screens proved you need (bottom-up), assembling outward. You get reuse without speculative abstraction.

## Governance hooks

A design system is a product with users (your other teams). Wire in:
- **Contribution path:** how a feature team proposes a new shared component; who reviews; the Rule-of-3 promotion gate from feature-local → shared.
- **Versioning:** semver the library; document breaking changes; codemods for renames.
- **Deprecation:** mark, warn (lint rule / console), migrate, remove on a schedule.
- **Source of truth:** tokens in one DTCG repo; Figma variables synced from it (or vice-versa via Tokens Studio) so design and code can't drift.
- **Storybook as the docs + visual-regression gate** (Chromatic or equivalent) on every level.

## Worked example — decomposing a Settings screen

A mobile/desktop **Account Settings** screen:

- **Atoms:** `Text` (heading/body styles), `Switch`, `Input`, `Button`, `Avatar`, `Icon`, `Divider`.
- **Molecules:** `SettingRow` (label + description + `Switch`), `FormField` (label + `Input` + helper/error), `AvatarUpload` (`Avatar` + `Button`).
- **Organisms:** `ProfileSection` (`AvatarUpload` + two `FormField`s), `NotificationsGroup` (header + N `SettingRow`s), `DangerZone` (warning text + destructive `Button`).
- **Template:** `SettingsLayout` — a master-detail split on desktop/tablet (nav rail + scrollable panel), single scroll column on mobile, organisms slotted in order, **placeholder labels**.
- **Page:** the real screen for a real user — actual name, avatar, the *empty* "no connected devices" state, a 60-character display name that must truncate, and the RTL mirror. Bugs found here push fixes into `SettingRow` (truncation) or `SettingsLayout` (reflow), never into the page itself.

## Figma ↔ code parity

- **Figma components = atoms/molecules**; **component sets with variants = an atom's states** (`Button` set: variant × size × state). **Nested instances = composition** (a `SearchField` component places `Input` + `Button` instances) — the literal Figma analog of molecules composing atoms.
- **Figma Variables ↔ DTCG tokens.** Map Figma variable collections to your token tiers (primitive / semantic). Sync with Tokens Studio so the same `color.action.primary` exists in design and code.
- **Mirror the naming and structure** across Figma pages and the repo so `Header / NavList / SearchField` resolves to the same thing in both tools — this is what makes handoff frictionless and keeps the system from forking into a "design version" and a "code version."

**The through-line:** tokens → atoms → molecules → organisms → templates → pages is one continuous composition chain, expressed identically in your token files, your Figma tree, and your component code. Keep those three in sync and the methodology pays for itself; let them drift and the metaphor becomes decoration.
