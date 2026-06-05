---
name: design-tokens
description: Architect, name, format, and export design tokens as the single source of truth across Figma, code, and multi-platform builds using the W3C DTCG format, a primitive→semantic→component tier model, and a Style Dictionary v4 pipeline.
tags: [design-systems, tokens, theming, architecture]
---
# Design Tokens — the single source of truth

Design tokens are named, structured key–value pairs that store every visual decision in a design system — color, spacing, type, radius, motion — as data instead of hardcoded literals. One token (`color.bg.default`) is authored once and consumed everywhere: Figma, CSS, iOS, Android, Tailwind. Change the value, every surface updates. Tokens turn "the brand blue" from a number scattered across 400 files into one row that design and engineering both point at.

## Why tokens (read before you skip the semantic tier)

- **Single source of truth.** The value lives in one place. No `#2563EB` typed by hand in a component.
- **Design↔code parity.** Designers edit Figma variables; engineers consume the same names. The handoff is the token, not a redline.
- **Theming for free.** Light/dark, multi-brand, density, and platform are *modes* of the same semantic tokens. Swap the mode, not the markup.
- **Scale.** A 12-step gray ramp, a type scale, a spacing scale — defined once, referenced by intent. Adding a brand is a new mode, not a rewrite.
- **Refactor safety.** Renaming or deprecating a decision is a token change with a known blast radius, not a global find-and-replace.

## The 3-tier architecture (the core mental model)

Tokens flow in one direction. **Components reference semantic. Semantic references primitive. Primitive references nothing.** Never let a component reach past semantic into a raw primitive.

| Tier | AKA | Holds | Example | Themeable? |
|------|-----|-------|---------|------------|
| 1 — Primitive | global, base, core, option | Raw, context-free values | `color.blue.500 = #2563EB`, `dimension.4 = 16px` | No — fixed palette |
| 2 — Semantic | alias, decision, system | **Intent**, references a primitive | `color.bg.default → {color.gray.50}` | **Yes — modes flip here** |
| 3 — Component | scoped | Component-specific, references semantic | `button.primary.bg → {color.action.default}` | Inherits from semantic |

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  PRIMITIVE  │ ◄── │     SEMANTIC      │ ◄── │    COMPONENT      │
│ blue.500    │     │ color.action.def  │     │ button.primary.bg │
│ #2563EB     │     │ {color.blue.500}  │     │ {color.action.def}│
└─────────────┘     └──────────────────┘     └──────────────────┘
   raw value           intent / role            local override
```

**When to add each tier:**
- **Primitive** — always. Build the full ramp up front (50–950 for color, a spacing/type scale). Primitives are the only place literal values live.
- **Semantic** — the moment a value carries *meaning*. The second you ask "is this *the* background or just gray.50?", you need `color.bg.default`. Themes are impossible without this tier — it is not optional polish.
- **Component** — only when a component needs to deviate from semantic, OR when a heavily-reused component benefits from a stable, scoped contract (`button.*`). Don't create a component token for every CSS property — most components should consume semantic tokens directly. Apply the rule of 3: don't mint a component token until the override repeats.

**The aliasing rule, stated plainly:** a component should never know that the brand color is blue. It knows `color.action.default`. The semantic layer is the *only* layer that maps intent→primitive, so it is the *only* layer a theme has to override.

## Token types & categories

| Category | `$type` | Notes |
|----------|---------|-------|
| Color | `color` | Hex, or DTCG color object `{colorSpace, components, alpha}`. Ramps 50–950. |
| Spacing / size | `dimension` | `{value, unit}` — `px` or `rem`. Drives padding, margin, gap, width, icon size. |
| Typography | `typography` | **Composite** — bundles fontFamily, fontSize, fontWeight, lineHeight, letterSpacing. |
| Font family | `fontFamily` | String or array (fallback stack). |
| Font weight | `fontWeight` | `100`–`900` or keyword (`bold`). |
| Radius | `dimension` | Corner radius scale: `sm`, `md`, `lg`, `full`. |
| Border | `border` | **Composite** — `{color, width, style}`. |
| Shadow | `shadow` | **Composite** (often array for layered shadows) — `{color, offsetX, offsetY, blur, spread}`. |
| Opacity | `number` | `0`–`1`. |
| Z-index | `number` | Layering scale — name by role (`zIndex.modal`), not by value. |
| Duration | `duration` | `{value, unit}` — motion timing, ms. |
| Easing | `cubicBezier` | `[x1, y1, x2, y2]`. |
| Breakpoint | `dimension` | Responsive thresholds. |

**Composite tokens** bundle multiple sub-values into one logical unit. A `typography` token is one decision ("body text") even though it's five properties. Reference composites whole; don't re-decompose them in components.

## Naming conventions

A token name is a path. The de-facto model is **CTI** (Category → Type → Item) extended to `namespace · object · base · modifier`, or equivalently `category-property-variant-state`.

```
color   ·  bg     ·  primary  ·  hover
└type     └concept  └variant    └state
```

**What makes a good name:**
- **Name by intent, not appearance.** `color.danger` not `color.red`. `color.bg.subtle` not `color.gray.100`. The whole point of semantic tokens dies if you name them after the value — a red error token that becomes orange shouldn't be called `color.red`.
- **Consistent ordering.** Always category-first, modifier-last. `color.text.primary.disabled`, never `color.disabled.text.primary`.
- **Predictable scales.** Use numeric ramps (`50…950`) or t-shirt sizes (`xs sm md lg xl`) — pick one per category and never mix.
- **Case: `kebab-case` in JSON keys / CSS,** dot-paths in references. CSS output becomes `--color-bg-default`.
- **No magic in the name.** `space.4` is fine as a primitive (scale step); `space.button-gap` is the semantic. Don't bake pixel values into names (`margin-16`).

| ✅ Good | ❌ Bad | Why |
|--------|-------|-----|
| `color.danger.bg` | `color.red.bg` | Intent survives a palette change |
| `color.text.primary` | `color.text.dark` | "dark" is wrong in dark mode |
| `space.inset.md` | `padding.medium.16` | Value baked into name |
| `radius.md` | `border-radius-8px` | Couples name to current value |
| `font.body.default` | `font.arial.14` | Brittle, appearance-named |

## W3C DTCG JSON format

The [Design Tokens Community Group](https://www.designtokens.org/) spec is the interop standard (Tokens Studio, Style Dictionary v4, Figma exporters all target it). Rules:

- Every token object has a **`$value`** and a **`$type`** (or inherits `$type` from a parent group).
- **`$description`** documents intent. **`$extensions`** holds tool-specific metadata.
- **References / aliasing** use curly-brace paths: `"$value": "{color.blue.500}"`.
- A group sets a default `$type` for its children; tokens can override.
- Reserved `$`-prefixed keys are tokens metadata; any non-`$` key is a nested group or token name.

```json
{
  "color": {
    "$type": "color",
    "blue": {
      "500": { "$value": "#2563EB", "$description": "Primitive — brand blue, do not use directly in components." },
      "600": { "$value": "#1D4ED8" }
    },
    "gray": {
      "50":  { "$value": "#F9FAFB" },
      "900": { "$value": "#111827" }
    },
    "action": {
      "default": { "$value": "{color.blue.500}", "$description": "Semantic — interactive/primary action surface." },
      "hover":   { "$value": "{color.blue.600}" }
    },
    "bg": {
      "default": { "$value": "{color.gray.50}" },
      "inverse": { "$value": "{color.gray.900}" }
    },
    "text": {
      "primary": { "$value": "{color.gray.900}" }
    }
  },
  "space": {
    "$type": "dimension",
    "4":  { "$value": { "value": 16, "unit": "px" } },
    "inset-md": { "$value": "{space.4}", "$description": "Semantic — default component inset." }
  },
  "typography": {
    "body-default": {
      "$type": "typography",
      "$value": {
        "fontFamily": "Inter",
        "fontSize": { "value": 1, "unit": "rem" },
        "fontWeight": 400,
        "lineHeight": 1.5,
        "letterSpacing": { "value": 0, "unit": "px" }
      }
    }
  },
  "button": {
    "primary": {
      "bg":      { "$type": "color", "$value": "{color.action.default}" },
      "bg-hover":{ "$type": "color", "$value": "{color.action.hover}" },
      "padding": { "$type": "dimension", "$value": "{space.inset-md}" }
    }
  }
}
```

## Theming & modes

A **mode** is an alternate set of values for the *same* semantic token names. Light and dark are two modes of `color.bg.default`. The discipline: **semantic tokens flip across modes; primitives never do.** Dark mode is not a new palette of `gray.900-but-darker` — it's `color.bg.default → {color.gray.900}` instead of `{color.gray.50}`.

| Axis | Modes | What flips |
|------|-------|-----------|
| Color scheme | light / dark / high-contrast | `color.bg.*`, `color.text.*`, `color.border.*` → different primitives |
| Brand | brand-a / brand-b | `color.action.*` → different brand ramps; spacing/type usually shared |
| Density | comfortable / compact | `space.*` semantic tokens → tighter primitives |
| Platform | web / ios / android | `dimension` units, font stacks, motion |

```jsonc
// Tokens Studio "sets" / Figma "modes" — one semantic name, value per mode
{
  "light": { "color.bg.default": "{color.gray.50}",  "color.text.primary": "{color.gray.900}" },
  "dark":  { "color.bg.default": "{color.gray.900}", "color.text.primary": "{color.gray.50}"  }
}
```

```css
/* Output: same custom property, value swaps by mode. Markup never changes. */
:root            { --color-bg-default: #F9FAFB; --color-text-primary: #111827; }
[data-theme=dark]{ --color-bg-default: #111827; --color-text-primary: #F9FAFB; }
```

**Figma variables map directly:** a variable collection = a token set; each *mode* column = a theme. **Tokens Studio** calls them *sets* + *themes* and exports DTCG JSON. Keep one collection per tier (Primitives / Semantic) so modes only exist where they belong — on semantic.

## Tooling pipeline

```
Figma Variables ──► Tokens Studio ──► tokens.json (DTCG) ──► Style Dictionary v4 ──► outputs
   (authoring)        (sync/export)      (source of truth)        (transform)         (consume)
                                              │
                          ┌───────────────────┼────────────────────┬──────────────┐
                          ▼                    ▼                    ▼              ▼
                   CSS custom props      JS/TS tokens        iOS (Swift)    Android (XML)
                   --color-bg-default    export const …      UIColor         <color name=…>
                                                            Tailwind theme  Compose/Flutter
```

- **Figma Variables** — designers author primitives + semantic with modes. Native variable modes do light/dark/brand.
- **Tokens Studio** (Figma plugin) — bridges Figma ⇄ a git-backed `tokens.json` in DTCG format. Manages sets/themes, references, and pushes to GitHub.
- **Style Dictionary v4** — the build engine. Reads DTCG JSON, applies **transforms** (e.g. `color/hex`, `size/rem`, `name/kebab`) and **formats** (per-platform file templates) to emit every target.

```jsonc
// style-dictionary.config.json (v4)
{
  "source": ["tokens/**/*.json"],
  "platforms": {
    "css":     { "transformGroup": "css", "buildPath": "dist/css/",
                 "files": [{ "destination": "tokens.css", "format": "css/variables" }] },
    "ts":      { "transformGroup": "js",  "buildPath": "dist/ts/",
                 "files": [{ "destination": "tokens.ts",  "format": "javascript/es6" }] },
    "ios":     { "transformGroup": "ios-swift", "buildPath": "dist/ios/",
                 "files": [{ "destination": "Tokens.swift", "format": "ios-swift/class.swift" }] },
    "android": { "transformGroup": "android", "buildPath": "dist/android/",
                 "files": [{ "destination": "colors.xml", "format": "android/colors" }] }
  }
}
```

```css
/* dist/css/tokens.css */
:root {
  --color-blue-500: #2563eb;
  --color-action-default: var(--color-blue-500);
  --color-bg-default: #f9fafb;
  --space-inset-md: 16px;
}
```

```ts
// dist/ts/tokens.ts
export const ColorActionDefault = "#2563EB";
export const SpaceInsetMd = "16px";
```

**Tailwind** — map tokens into `theme.extend` so utilities resolve to custom properties:
```js
// tailwind.config.js
export default { theme: { extend: {
  colors: { bg: { default: "var(--color-bg-default)" }, action: { DEFAULT: "var(--color-action-default)" } },
  spacing: { "inset-md": "var(--space-inset-md)" },
} } };
```

**CI sync** — Tokens Studio pushes `tokens.json` to a PR → CI runs `style-dictionary build` → commits/publishes `dist/`. Treat generated files as build artifacts (don't hand-edit). Gate the PR on a visual-regression or token-diff check.

## Governance

- **Ownership.** A design-systems owner (or DRI) reviews every token PR. Primitives change rarely and need the highest bar; semantic changes need design sign-off; component tokens can be team-owned.
- **Versioning — semver on the published package.**
  - **Patch** — value change that doesn't alter intent (a hex nudge).
  - **Minor** — **additive** only (new token, new mode). Safe to consume.
  - **Major** — rename or removal of a token (breaking). Never silently rename.
- **Deprecation, not deletion.** Mark `$deprecated` / add to `$description`, keep the old token aliasing the new value for one major cycle, then remove. Ship a codemod or mapping table.
- **Additive-first.** Adding tokens is cheap and non-breaking; prefer it over mutating existing ones.
- **Contribution.** New token requests go through: propose intent → check an existing semantic token covers it → if not, add semantic referencing an existing primitive → only add a primitive if the value truly doesn't exist. PR includes name rationale + the tier it lands in.

## Common mistakes

| Mistake | Why it hurts | Fix |
|---------|-------------|-----|
| **Skipping the semantic tier** (components reference primitives) | No theming possible; dark mode means editing every component | Always route components → semantic → primitive |
| **Naming by appearance** (`color.red`, `text.dark`) | Name lies when the value or mode changes | Name by intent: `color.danger`, `text.primary` |
| **Hardcoding in components** (`padding: 16px`) | Token system bypassed; drift returns | Consume `{space.inset.md}` / `var(--space-inset-md)` |
| **Too-specific primitives** (`color.button-blue`) | Primitives must be context-free building blocks | Primitives are raw ramps; specificity lives in semantic |
| **Modes on the primitive layer** | Palette mutates per theme; references break | Modes live on semantic only |
| **One giant flat file, no tiers** | Can't tell decision from raw value; un-themeable | Separate primitive / semantic / component groups |
| **Component token per CSS property** | Token explosion, unmaintainable | Components consume semantic directly; add component tokens only on the rule-of-3 |
| **Hand-editing generated `dist/`** | Overwritten on next build; source drifts | Edit `tokens.json`; regenerate |
| **Renaming without deprecation** | Breaks every consumer silently | Major bump + alias old→new for one cycle + codemod |

## Checklist before shipping a token set

- [ ] Three tiers exist and reference one-directionally (component→semantic→primitive).
- [ ] No component or app code references a primitive directly.
- [ ] Every semantic token is named by intent, not appearance.
- [ ] Light/dark (and any brand) are *modes* of the same semantic names.
- [ ] Source is DTCG JSON (`$value`/`$type`); outputs are generated, not hand-written.
- [ ] Pipeline emits every target platform from one source via Style Dictionary.
- [ ] Versioning + deprecation policy is written down and enforced in PR review.
