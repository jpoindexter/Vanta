---
name: design-system-frameworks
description: Reference-grade survey of the named design systems (Material 3, Apple HIG, Fluent 2, Carbon, SLDS, Polaris, Atlassian, Primer, Ant, Spectrum) and the modern build stack (Tailwind, shadcn/ui, Radix/React Aria/Ark, MUI/Chakra/Mantine/Base) — each system's actual philosophy and rules, plus how to choose adopt-vs-adapt-vs-build.
tags: [design-systems, frameworks, material, hig, fluent, carbon]
---
# Design System Frameworks — the named systems & their rules

A design system framework is a *position*, not a component grab-bag. Every named system below is opinionated about something — Material about physics and motion, HIG about deference, Carbon about enterprise density, Polaris about merchant content. When you adopt one you inherit its opinions; the friction teams feel is almost always the gap between the system's worldview and theirs. This skill is the field guide: what each system actually believes, the concrete rules that fall out of that belief, and the decision of whether to adopt it, adapt it, or build your own on a headless layer.

The single most important framing: **a design system is a set of constraints you're agreeing to.** Adopting Material and then re-skinning every component to fight its elevation model costs more than building from scratch. The win comes from picking a system whose opinions you mostly *agree with*, then theming the parts that are pure brand (color, type, radius, motion personality) while leaving the parts that are pure UX (touch targets, focus order, state layers, a11y semantics) alone.

---

## Platform systems — the OS-backed canon

### Material Design 3 / Material You (Google, current: M3 + Material 3 Expressive, 2024–2025)

**Philosophy:** UI as tactile physical material — surfaces have thickness, cast light, and move with believable motion. M3 dropped literal drop-shadows-as-status for **tonal elevation** (higher surfaces get a lighter tint of the primary color) and made **dynamic color** the headline: a single seed (the user's wallpaper on Android, or a brand color) generates a full tonal palette via HCT (Hue-Chroma-Tone) color space. *Material 3 Expressive* (2025) pushes louder color, larger shapes, springier motion, and emphasized type.

**The actual rules:**
- **8dp grid** (4dp for icons/fine detail). `dp` = density-independent pixels; `sp` = scalable pixels for text (respects user font scale — never use `dp` for type).
- **Dynamic color:** 5 tonal palettes (primary, secondary, tertiary, neutral, neutral-variant) × 13 tones (0–100) → semantic **color roles** (`primary`, `onPrimary`, `surface`, `surfaceContainerHighest`, `outline`…). You theme by seed + scheme, not by hand-picking hex.
- **Tonal elevation + state layers:** elevation = surface tint level, not a shadow. Interaction states (hover/focus/press/drag) render as a translucent **state layer** (8%/10%/10%/16% opacity of `onSurface`) over the component — every interactive component must implement them.
- **Type:** Roboto (or Roboto Flex variable) default; 15 type-scale roles (Display/Headline/Title/Body/Label × L/M/S). Brand font allowed.
- **Components:** FAB (and the new FAB menu), navigation bar (bottom, 3–5), navigation rail (tablet), navigation drawer, snackbar, bottom sheet, extended/filled/tonal/outlined/text buttons, chips, segmented buttons.
- **Shape:** corner-radius is a token scale (none→full); M3 Expressive adds a full **shape library** (squircles, cookie shapes) and morphing.

**Best for:** Android-first or Android-heavy products; teams that want a complete, opinionated, well-documented system with first-party Compose/Flutter/Web implementations. **Worst for:** strongly-branded products that will fight the elevation/state-layer model, or iOS apps (Material on iOS reads as a non-native port).

### Apple Human Interface Guidelines (Apple, current: iOS 18 / macOS 15 / visionOS 2, 2024–2025)

**Philosophy:** three pillars — **clarity** (legible at every size, precise, content-first), **deference** (the UI yields to content; chrome is minimal, translucent, out of the way), **depth** (layered translucency and motion convey hierarchy and place). HIG is a *guideline*, not a code library — it tells you how to behave native, and you implement with UIKit/SwiftUI/AppKit.

**The actual rules:**
- **Type:** SF Pro (SF Pro Text < 20pt, SF Pro Display ≥ 20pt; New York serif; SF Mono). **Dynamic Type mandatory** — use the 11 text styles, never hardcode point sizes for content.
- **Touch:** **44×44pt** minimum tap target (hard floor). **8pt grid** (4pt fine). Pin to **safe areas**, never the raw screen rect.
- **Platform fidelity is the law:** iOS gets tab bars + sheets with detents + edge-swipe-back + the system share sheet; macOS gets a menu bar + toolbar + sidebar + window chrome; never cross-pollinate (no hamburger drawer or FAB on iOS).
- **Materials:** vibrancy/blur (`.ultraThinMaterial`→`.thickMaterial`), semantic colors (`.label`, `.systemBackground`), light/dark via semantic tokens.
- **visionOS:** content on glass material in 3D space; ≥60pt eye+pinch targets; toolbars in **ornaments**, not screen-edge chrome; default window 1280×720pt at 1m.

**Best for:** any app that ships natively on Apple platforms and wants App Store goodwill + free accessibility. **Worst for:** as a cross-platform web system — there is no official web component library; you'd be reimplementing the *feel* without the engine.

### Microsoft Fluent 2 (Microsoft, current, 2023→ongoing)

**Philosophy:** one coherent language spanning Windows, web, mobile, and the whole Microsoft 365 surface — warm, light, and material-aware. Fluent 2 unified the previously-fragmented Fluent UI React + Windows design into a shared token system.

**The actual rules:**
- **Materials:** **Mica** (opaque, wallpaper-tinted, for app backgrounds — cheap to render) and **Acrylic** (translucent blur, for transient/flyout surfaces). Don't stack Acrylic on Acrylic.
- **Type:** **Segoe UI Variable** (Windows) — a variable font with optical sizes (Small/Text/Display) that auto-adjust spacing/weight at size; web uses a Segoe stack.
- **Tokens + theming:** a full alias/global token set drives Fluent UI React v9 (`@fluentui/react-components`), with light/dark/high-contrast and brand ramps generated from a seed.
- **Components:** command bar, nav (top/left), teaching popups, info badges, the `Windows 11` rounded geometry; `react-components` is the modern v9 (griffel CSS-in-JS, tree-shakeable) — avoid the legacy v8 (`@fluentui/react`) for new work.

**Best for:** Windows apps, Microsoft-ecosystem and enterprise productivity web apps, anything that should feel "at home" in Office/Teams. **Worst for:** consumer brand-led products (it reads corporate/Microsoft).

### IBM Carbon (IBM, current: Carbon v11, ongoing)

**Philosophy:** open-source, **enterprise/productivity-first** — built for dense data, complex workflows, and IBM's own product portfolio. Carbon is unfashionably rigorous: everything snaps to a grid, tokens are exhaustive, and the system optimizes for *information density and consistency at scale* over expressiveness.

**The actual rules:**
- **2x Grid:** a strict 16-column responsive grid with a **2x** mini-unit system; spacing tokens are a geometric scale (`$spacing-01`…`$spacing-13`).
- **Type:** **IBM Plex** (Sans/Serif/Mono/Condensed) — IBM's open-source corporate typeface; a defined type set with productive vs expressive scales.
- **Tokens:** deeply layered theme tokens (White / Gray 10 / Gray 90 / Gray 100 themes) with `layer` tokens for nested surfaces — a model many enterprise systems copy.
- **Components:** data tables (Carbon's crown jewel — sorting, batch actions, expansion, pagination), notifications, structured lists, the UI shell. First-party React, plus Web Components, Angular, Vue, Svelte.

**Best for:** B2B/enterprise SaaS, dashboards, admin consoles, data-heavy internal tools, anything in the IBM orbit. **Worst for:** marketing sites, playful consumer apps, anything that needs to feel warm or distinctive.

### Salesforce Lightning (SLDS) (Salesforce, current: SLDS + SLDS 2 in progress)

**Philosophy:** the design system *of the Salesforce platform* — built so thousands of third-party AppExchange apps look native inside Salesforce. Enterprise, CRM-shaped, density-tolerant, and historically delivered as **utility classes + BEM-style component CSS** (`slds-button slds-button_brand`) rather than a JS component lib.

**The actual rules:**
- **SLDS tokens** (formerly "design tokens," now styling hooks/CSS custom props) drive theming; SLDS 2 moves to a modern token + styling-hooks architecture for runtime theming.
- **Utility + BEM CSS:** the canonical consumption is class-based; component frameworks (Lightning Web Components) layer on top.
- **Cosmos/Spring brand**, data tables, page layouts tuned for record pages and consoles.

**Best for:** anything built on or alongside Salesforce/AppExchange. **Worst for:** general-purpose products with no Salesforce relationship — you'd inherit CRM-shaped opinions for nothing.

### Platform-system do / don't (the per-system reflexes)

- **Material — do** use color *roles* and tonal elevation; implement state layers on every interactive; size text in `sp`. **Don't** hardcode hex, fake elevation with drop shadows, or skip state layers — those are the tells of a broken Material implementation.
- **HIG — do** use Dynamic Type text styles, keep the edge-swipe-back, use the system share sheet, respect safe areas. **Don't** import Android signatures (FAB, hamburger drawer, bottom snackbar) or hardcode `17pt`.
- **Fluent — do** use Mica for app backgrounds + Acrylic for transient surfaces, ship high-contrast theme, use v9 `react-components`. **Don't** stack Acrylic on Acrylic, or start new work on legacy v8.
- **Carbon — do** snap to the 2x grid, use `layer` tokens for nested surfaces, lean on its data tables. **Don't** loosen the grid for "breathing room" — Carbon's value *is* the density discipline.
- **SLDS — do** consume via styling hooks + utility/BEM classes so apps stay native in Salesforce. **Don't** hard-fork the CSS; you'll desync from the platform shell.

---

## Product systems worth studying (steal the *thinking*, not the components)

| System | Owner | Opinionated about | Notable artifact |
|---|---|---|---|
| **Polaris** | Shopify | Merchant admin clarity; **content/voice guidelines** are as important as components | App Bridge (embed apps in Shopify admin), exhaustive content guidance |
| **Atlassian Design System** | Atlassian | Productivity at scale; tokens-first theming across Jira/Confluence | Mature **design token** system, ADG heritage |
| **Primer** | GitHub | **Dev-tool density**, keyboard-first, monospace-aware | Primer CSS + Primer React + Primer Primitives (tokens) |
| **Ant Design** | Ant Group | **Data-dense enterprise** React; tables/forms/everything-included | `antd` (huge component set), ProComponents, algorithm-based theming |
| **Spectrum** | Adobe | **Cross-platform** consistency + **accessibility-forward**; creative-tool ergonomics | Spectrum tokens, React Spectrum (built on React Aria), S2 refresh |

- **Polaris** is the case study for *content as a first-class system concern* — its writing guidelines (sentence case, specific verbs, no jargon, "Frame" page structure) are reusable even if you never touch Shopify. **App Bridge** is the model for "our system must work embedded in someone else's chrome": Shopify apps render *inside* the admin, so Polaris components must inherit the host shell's navigation, theming, and resource pickers. Steal the discipline of designing for embedding.
- **Atlassian** is the reference for **token architecture at company scale** — a three-tier model (primitive → semantic → component-ish), spacing primitives, and a real theming pipeline (incl. a light/dark/auto theme switch) shared across Jira, Confluence, Trello, Bitbucket. If you want to see what "tokens as the portable contract between brands and products" looks like in production, read Atlassian's token docs before designing your own.
- **Primer** proves a system can be *opinionated for a domain*. It's tuned for dense, text-and-code-heavy dev tooling: tight spacing, monospace integration, strong keyboard support, and **Primer Primitives** (a clean, multi-format token package). The split — Primer CSS (utility/component classes) + Primer React (components) + Primitives (tokens) — is a good template for a system that must serve both CSS-only and React consumers.
- **Ant Design** is the "batteries-included" extreme — `antd` ships ~70+ components plus ProComponents (page-level patterns), so a data-heavy admin can be built in days. Costs: a strong, recognizable visual signature (everything reads "Ant") and a heavy footprint. Its v5 **algorithm-based theming** — design tokens *computed* from a small set of seed tokens via algorithms (default/dark/compact) — is genuinely worth studying as an alternative to hand-authoring every token.
- **Spectrum** is the bridge to the next section. Adobe open-sourced its **behavior/a11y layer as React Aria** and its component layer as **React Spectrum** — so you can adopt Spectrum's industry-leading accessibility and internationalization engineering *without* its visual skin. Spectrum is also notable for being **truly cross-platform by design** (web, desktop, mobile-web) with platform-scale tokens (e.g. larger touch targets on touch devices) baked in. The "S2" refresh modernizes the look.

**The reusable takeaway across all five:** the durable, portable part of a design system is its **tokens + content/interaction rules**, not its rendered components. You can carry Atlassian-style token architecture, Polaris-style content rules, and Spectrum-style a11y into a system that looks nothing like any of them. Components are downstream of tokens; tokens are the thing worth getting right first (see the `design-tokens` skill).

---

## The modern build stack — how teams actually ship systems now

Three architectures, and the central decision of this whole skill:

| Layer | What you get | What you owe | Examples |
|---|---|---|---|
| **Headless / unstyled primitives** | Behavior, a11y, keyboard, focus mgmt, ARIA — **zero styles** | All visuals (you bring tokens + CSS) | Radix UI, React Aria (Components), Ark UI, Headless UI |
| **Utility-first CSS** | A styling *engine* + constraint-based token scale; no components | Component structure + composition | Tailwind CSS |
| **Styled component libraries** | Looks + behavior in one import | Fighting the theme when you outgrow it | MUI, Chakra, Mantine, Ant |
| **Copy-in components** | Real source in *your* repo, on a headless+utility base | Maintenance (it's your code now) | shadcn/ui |

### Tailwind CSS (utility-first; current v4, 2024–2025)

**What it is:** a utility-class engine where the *config is your token system* — spacing scale, color ramp, type scale, breakpoints, radii all live in one place and compile to atomic classes. v4 moved config to **CSS-first** (`@theme` in CSS, `@import "tailwindcss"`), a new Oxide/Rust engine, and native cascade-layer/container-query support.

- **Helps a system when:** you want design constraints enforced *at the call site* (you can't type an off-scale margin), you're co-locating styles with markup, and you pair it with a component layer (shadcn/Radix) so utilities don't leak everywhere.
- **Hurts a system when:** it *is* the system — raw utilities sprayed across a codebase with no component abstraction means there's no single place to change a button, and "consistency" depends on everyone remembering the same class strings. Tailwind is a styling layer, **not** a component system. Wrap it.

### shadcn/ui (copy-in, not a dependency; current, 2024–2025)

**What it is:** the "**own your components**" model. You run a CLI that *copies* component source (Radix primitives + Tailwind + CVA variants) into your repo. It's not an npm dependency — there's no version to bump, no black box. You edit the code directly.

- **Why it's winning:** zero lock-in, full control, a11y handled by Radix underneath, and it's the de-facto starting point for new React/Tailwind systems. The registry model lets you (or your org) publish your *own* component registry.
- **The tradeoff:** you own maintenance and upstream fixes don't flow to you automatically — you re-copy or diff. For a *design system* this is a feature (you wanted to own it); for a team that wanted a maintained dependency, it's a cost. Treat it as a **scaffold for your system**, not a finished product.

### Radix UI / React Aria / Ark (headless primitives + a11y)

**The most important layer to get right.** These ship the *hard part* — WAI-ARIA roles, keyboard interaction, focus trapping, collision-aware positioning, type-ahead, RTL — with **no styles**.
- **Radix Primitives:** the React standard; powers shadcn. Excellent a11y, composable, unstyled. (Radix Themes is its optional styled layer.)
- **React Aria (Components):** Adobe's hooks + components; arguably the **deepest a11y and i18n** (locale-aware dates/numbers, sophisticated focus mgmt), framework-flexible. Powers React Spectrum.
- **Ark UI:** the framework-agnostic option (React, Vue, Solid, Svelte) from the Chakra team, built on state machines (Zag.js) — pick this if you need **multiple frameworks** from one behavior layer.
- **Rule:** build your system on one of these. Reinventing a focus-managed, ARIA-correct combobox or dialog is months of work and you will get it wrong. The headless layer is where accessibility is *won or lost*.

### Styled component libraries — MUI, Chakra, Mantine, Base

- **MUI (Material UI):** the largest React component lib; implements Material with a powerful `sx`/theme system. Great velocity, but **everything looks like Material** until you invest heavily in theming, and deep customization fights the engine. For the unstyled layer, note the naming: MUI's older in-repo primitives shipped as `@mui/base`, and the team is consolidating on a standalone **Base UI** (`@base-ui-components/react`) — a fresh unstyled/accessible primitive set. Either way, reach for the *unstyled* tier if you want MUI's engineering without Material's skin.
- **Chakra UI:** ergonomic, style-props API, good defaults, accessible. v3 rebuilt on **Ark UI + Panda CSS** (zero-runtime). Good for product teams that want speed and a coherent-but-neutral look.
- **Mantine:** huge, batteries-included (100+ components, hooks, dates, forms, notifications), strong DX, CSS-modules-based theming. Excellent for **dashboards/internal tools** where you want everything now.
- **Base UI** (the standalone unstyled primitive set, with contributors from the MUI / Radix / Floating UI orbit — *not* a styled lib) and **Base Web** (Uber) are headless/low-style primitives for teams building bespoke systems; conceptually they sit in the headless tier alongside Radix, not with the styled libs.

**The styled-lib trap:** picking a styled library and then overriding 80% of it. If you're re-theming every component, you wanted a headless layer + your own tokens — you're now paying the library's bundle and fighting its specificity for nothing.

### Build-stack do / don't

- **Tailwind — do** treat `@theme` as your token source of truth and wrap utilities in components; pair with shadcn/Radix. **Don't** ship raw utilities everywhere with no component layer, or duplicate the same 12-class string across 40 files.
- **shadcn — do** set tokens before copying, treat copied code as *yours* (review it, own it), publish an internal registry for org-wide components. **Don't** expect upstream fixes to flow automatically, or treat it as a finished product instead of a scaffold.
- **Headless (Radix/React Aria/Ark) — do** make it the non-negotiable base of any custom system; pick Ark if you need multiple frameworks, React Aria if you need the deepest i18n/a11y. **Don't** hand-roll dialogs/menus/comboboxes "to keep deps low" — you're trading a tiny dep for a large, silent a11y debt.
- **Styled libs (MUI/Chakra/Mantine) — do** use for single-product velocity and internal tools; reach for MUI **Base UI** / Chakra-on-Ark when you want the engineering without the skin. **Don't** pick one for a multi-brand system you'll re-theme to the studs.

### Worked example — building one Combobox three ways

The choice is most concrete on a hard component (combobox: filtering, keyboard nav, listbox ARIA, type-ahead, mobile behavior):
- **From scratch:** ~weeks. You will get focus management, `aria-activedescendant`, screen-reader announcements, and RTL subtly wrong. Almost never the right call.
- **Headless (React Aria `useComboBox` / Radix):** ~hours. Behavior + a11y are solved; you write the markup and style it with *your* tokens. Result: on-brand, accessible, no dead weight. **This is the default for a real design system.**
- **Styled lib (MUI `Autocomplete`):** ~minutes to working, then *hours fighting the theme* if your brand diverges. Great for a single product on a deadline; a liability for a multi-surface system you'll re-skin.

The pattern generalizes: **the harder and more a11y-laden the component, the more a headless base pays off**; the simpler and more disposable the product, the more a styled lib's velocity wins.

---

## Comparison table — the named systems at a glance

| System | Philosophy (opinionated about) | Best for | Grid / Type | Tokens? | License / delivery |
|---|---|---|---|---|---|
| **Material 3** | Physical material, dynamic color, motion | Android & cross-platform product | 8dp / Roboto, `sp` | Yes (color roles + full token set) | Apache-2.0; Compose/Flutter/Web |
| **Apple HIG** | Clarity / deference / depth, native fidelity | Native Apple apps | 8pt / SF Pro, Dynamic Type | Semantic system colors/text styles | Guideline only; UIKit/SwiftUI |
| **Fluent 2** | Coherent MS ecosystem, materials | Windows + MS-ecosystem web | 4px base / Segoe UI Variable | Yes (alias/global tokens) | MIT; Fluent UI React v9 |
| **Carbon** | Enterprise density, rigor | B2B/data-heavy SaaS | 2x Grid, 16-col / IBM Plex | Yes (deep theme tokens) | Apache-2.0; React/WC/Angular/Vue |
| **SLDS / Lightning** | Native inside Salesforce | Salesforce/AppExchange apps | SLDS grid / Salesforce Sans | Yes (styling hooks) | BSD-3 CSS; LWC |
| **Polaris** | Merchant clarity + content | Shopify apps | 4px base / system font stack | Yes | Custom; React + App Bridge |
| **Atlassian** | Productivity at scale, tokens | Atlassian-ecosystem / large product | 8px / Charlie Display + system | Yes (mature) | Apache-2.0; React |
| **Primer** | Dev-tool density, keyboard | Developer tools | 8px / Mona Sans + Hubot/mono | Yes (Primitives) | MIT; CSS + React |
| **Ant Design** | Data-dense enterprise, complete | Admin/data apps (React) | 8px / system stack + algorithm | Yes (seed→algorithm) | MIT; `antd` React |
| **Spectrum** | Cross-platform + a11y-forward | Creative/cross-platform | 8px / Adobe Clean | Yes | Apache-2.0; React Spectrum |
| **shadcn/ui** | Own-your-components | New React/Tailwind systems | Tailwind config / your choice | Your tokens | MIT (copy-in) |
| **Radix / React Aria / Ark** | Headless behavior + a11y | The base layer of a custom system | n/a (unstyled) | Bring your own | MIT |

---

## Framework availability + theming mechanism — the two hidden selection constraints

Two dimensions sink more "we'll just adopt X" decisions than philosophy ever does: **which frameworks the system actually ships for**, and **how it themes** (which dictates runtime cost, RSC compatibility, and how you override).

| System | Framework availability | Theming mechanism | Official Figma kit? |
|---|---|---|---|
| **Material 3** | Compose, Flutter, Web (MDC/MWC) | Seed → HCT-computed color roles + tokens | Yes |
| **Apple HIG** | UIKit / SwiftUI / AppKit (no web) | Semantic system colors/text styles | Yes (Apple UI kits) |
| **Fluent 2** | React (v9), Windows native, web | Zero-runtime CSS-in-JS (**griffel**) + alias tokens | Yes |
| **Carbon** | React, Web Components, Angular, Vue, Svelte | CSS custom properties (`--cds-*`) + theme tokens | Yes |
| **SLDS** | LWC + framework-agnostic CSS classes | CSS styling hooks (custom props) | Yes |
| **Polaris** | React only | CSS custom properties / tokens | Yes |
| **Atlassian** | React only | Tokens via CSS vars + `@atlaskit/tokens` | Yes |
| **Primer** | React + CSS (framework-agnostic classes) | CSS custom properties (Primitives) | Yes |
| **Ant Design** | React only (Vue/Angular are 3rd-party ports) | **Seed → algorithm-computed** tokens (CSS-in-JS) | Yes |
| **Spectrum** | React (React Spectrum/Aria) + Web Components + CSS | CSS custom properties (Spectrum tokens) | Yes |
| **Tailwind** | Framework-agnostic (any) | Utility classes from `@theme` tokens | n/a |
| **shadcn/ui** | React (+ ports: Svelte, Vue) | CSS vars + Tailwind, CVA variants | n/a (you own) |
| **Radix** | React only | Unstyled — bring any (commonly CSS vars + CVA) | n/a |
| **React Aria** | React only | Unstyled — bring any | n/a |
| **Ark UI** | **React, Vue, Solid, Svelte** (Zag.js state machines) | Unstyled — bring any | n/a |

**Read this table before anything else if you're not a React shop.** Most product systems (Polaris, Atlassian, Ant, React Spectrum, shadcn, Radix, React Aria, Chakra, Mantine, MUI) are **React-only** — for a Vue/Svelte/Solid team the real menu is much shorter: **Carbon** (multi-framework first-party), **Ark UI** (multi-framework headless via Zag state machines), **Material** (Compose/Flutter/Web), or Web-Components systems (Carbon WC, Spectrum WC, Fluent/FAST). This single constraint kills more adoptions than any aesthetic objection.

**Theming mechanism decides runtime cost and RSC fit:**
- **CSS custom properties / styling hooks** (Radix Themes, SLDS, Carbon, Primer, shadcn) — zero runtime, works cleanly under React Server Components, easiest to override. *Default preference for new web systems.*
- **Zero-runtime CSS-in-JS** (Fluent's griffel, Chakra v3 on **Panda CSS**, vanilla-extract) — styles extracted at build, no runtime penalty, RSC-friendly.
- **Runtime CSS-in-JS** (classic MUI/emotion) — flexible but pays a runtime cost and is **penalized under RSC / server rendering**; a real factor for Next.js App Router teams.
- **Utility** (Tailwind) — no runtime; tokens compile to classes.
- **Seed-computed** (Ant v5 algorithm, Material HCT) — small input set generates the full token set; powerful for whole-palette theming, but the computation is the system's, so you theme by *seed*, not by hand.

**Variants live in your component layer, not the framework:** the modern pattern is **CVA** (class-variance-authority) or `tailwind-variants` to declare `variant`/`size`/`state` → class mappings (this is exactly what shadcn ships). Headless behavior (Radix/Aria/Ark) + tokens (CSS vars) + variant mapping (CVA) + styling (Tailwind/Panda) is the canonical 2024–2025 custom-system stack.

**Official Figma-kit parity as an adoption criterion:** Material, HIG, Carbon, Fluent, SLDS, Polaris, Atlassian, Primer, Ant, and Spectrum all ship maintained Figma libraries — so designers and code stay in sync out of the box. Headless layers (Radix/Aria/Ark) and shadcn ship **no** official kit — you build and maintain the Figma↔code parity yourself (see the `design-tokens` and `design-system-governance` skills). For a design-led org, an official, in-sync kit is a real reason to adopt a named system over rolling your own.

---

## How to CHOOSE — adopt vs adapt vs build

**Decision order (do this in sequence):**

0. **What frameworks must you support?** → Gate the whole list first (see the table above). Not React → your real options are Carbon, Ark, Material, or Web-Components systems; most named product systems drop out here before you even discuss aesthetics.
1. **Are you native (one OS)?** → Use that platform's system. iOS → HIG/SwiftUI. Windows → Fluent. There's no good reason to fight the OS canon for a single-platform app.
2. **Is it enterprise/data-heavy and you want it *now*?** → **Adopt** a complete system: Carbon (rigor), Ant or Mantine (velocity), Fluent (MS shops). Accept the visual signature; don't re-skin everything.
3. **Is the brand the product, and you have ≥3 products/surfaces to serve?** → **Build on a headless layer + your own tokens.** Radix/React Aria/Ark for behavior + a token system (DTCG/Style Dictionary) + Tailwind or vanilla-extract/Panda for styling. shadcn/ui is the best *starting scaffold* for this.
4. **One product, small team, React?** → **Adapt:** start from shadcn/ui (you own the code) or a neutral styled lib (Chakra/Mantine) and theme it. Don't build a system from scratch for one product — see "Rule of 3" below.

**Adopt** = take it as-is, theme only color/type/radius. Cheapest, fastest, but you live inside its opinions.
**Adapt** = fork/copy and modify (shadcn is adapt-by-design; forking MUI's theme is adapt-by-force). Mid cost; you own divergence.
**Build** = headless primitives + your tokens + your components. Highest cost, only justified at multi-product scale or when brand *is* the product.

**The opinionated default for a typical new React web product (2024–2026):** start from **shadcn/ui** (Radix behavior + Tailwind v4 tokens + CVA variants), own the copied code, and grow it into your system. It gives you headless a11y, zero lock-in, CSS-var theming, and an explicit ownership model — the four things this whole skill argues for — without committing to a styled lib you'll outgrow or a from-scratch build you can't justify.

**The cost of forking a 3rd-party system** is the part teams underestimate: every upstream a11y fix, security patch, and new-component release now requires a manual merge. Fork only what you'll *maintain*. This is exactly why shadcn's copy-in model is honest — it makes "you own this now" explicit instead of pretending an override layer is free.

**Theming a 3rd-party system to your brand:** the safe surface to change is **color, type, radius, spacing scale, motion personality, and elevation values** — the brand layer. The dangerous surface is **component structure, interaction states, focus order, and ARIA** — the UX/a11y layer. Re-theme the first; leave the second alone. If your brand requires re-architecting the second, you chose the wrong base — drop to a headless layer.

**Signals you picked the wrong system (catch these early):** your theme override file is longer than the components would have been; you're using `!important` or deep descendant selectors to beat the lib's specificity; designers describe the result as "fighting the framework"; you've disabled or rebuilt the system's accessibility behavior; the same component looks different in two places because overrides drifted. Any two of these = re-evaluate the base, ideally before you've built 50 screens on it.

**Accessibility track record as a selection criterion (weight this heavily):** prefer systems with a *demonstrated* a11y engine — React Aria/Spectrum (deepest), Radix, Carbon, Fluent, Polaris all take it seriously. A system's a11y is the most expensive thing to retrofit and the easiest to get wrong; inheriting a tested keyboard/focus/ARIA layer is often the single biggest reason to adopt rather than build. Verify with real screen-reader testing, not the marketing page.

---

## Common mistakes (the expensive ones)

- **Adopting Material, then fighting it.** Importing MUI/Material and overriding elevation, removing state layers, and re-skinning every component until it's "not Material" — you pay Material's bundle and specificity to ship something that isn't Material. If you don't want Material's opinions, don't start from Material; start headless.
- **Using a styled lib then overriding everything.** The 80%-override anti-pattern. If your theme file is longer than the components would have been, you wanted Radix/React Aria + your tokens.
- **Building from scratch with <3 products.** A design system is amortized cost — it only pays back across multiple surfaces/teams. For one product, a component folder is not a "design system," and treating it like one is platform-thinking before you have users. Adapt shadcn/a styled lib instead.
- **No headless layer, so a11y is reinvented.** Hand-rolling dialogs, comboboxes, menus, and tooltips means re-implementing focus trapping, ARIA roles, keyboard nav, and collision detection — and getting them subtly wrong. This is the most common silent a11y failure. Always stand on Radix/React Aria/Ark.
- **Tailwind *as* the system.** Utilities sprayed everywhere with no component abstraction = no single source of truth for a button. Tailwind is the styling engine; you still need a component layer (shadcn) on top.
- **Mixing two systems' opinions.** Material elevation + HIG navigation + Carbon density in one app reads as incoherent. Pick one worldview; borrow *tokens*, not whole component philosophies.
- **Choosing on component count, not philosophy.** "It has 200 components" (Ant/Mantine) wins demos and loses years — you inherit a strong visual signature and a heavy dep. Choose on whether you *agree with the system's opinions*, then on completeness.
- **Treating HIG/Material as web component libraries.** HIG has no official web lib; Material-on-web that isn't Android reads as a port. Match the system to its native target.

---

## Migrating off (or onto) a system

Teams rarely choose on a greenfield — they inherit a system or need to escape one. The moves that work:

- **Escaping a styled lib (MUI/Ant) → headless+tokens:** wrap, don't rip. Introduce a token layer first, route the styled lib's theme to *your* tokens, then replace components leaf-first behind a shared API (`<Button>` keeps its props, swaps its guts). A big-bang rewrite of a live system fails; the **strangler** pattern (new components on the new base, old ones untouched until touched) ships.
- **Adopting shadcn into an existing app:** safe because it's copy-in — add components incrementally, no dependency conflict, no version coupling. Establish your Tailwind `@theme` tokens *before* copying components so they inherit your scale.
- **Two systems coexisting during migration:** acceptable *temporarily* if they're isolated by route/surface, never interleaved in one screen. Set an end date; a permanent two-system state is the worst outcome (double bundle, double mental model, inconsistent a11y).
- **Version jumps to know:** MUI/Chakra v3, Fluent UI v9 (not v8), Tailwind v4 (CSS-first config), Carbon v11, Ant v5 (algorithm theming) are the current majors — onboarding docs from older majors will steer you wrong. Verify the major before copying any setup snippet.

## Operating rules

- **Pick a worldview before a library.** Name what your system is opinionated about (density? brand? platform-native?) — then the framework choice follows.
- **Stand on a headless a11y layer always.** Radix / React Aria / Ark. Never reinvent focus + ARIA.
- **Theme the brand layer, never the UX/a11y layer.** Color/type/radius/motion = yours; states/focus/roles = the system's.
- **Adopt for one product, build for many.** Rule of 3 — no bespoke system until ≥3 surfaces justify the amortized cost.
- **Make ownership explicit.** Copy-in (shadcn) over override-layers when you intend to own divergence.
- **Weight a11y track record heavily** in selection — it's the most expensive thing to retrofit.
- **Don't fight a system you adopted.** If you're overriding >50%, you chose wrong — drop to headless + tokens.
