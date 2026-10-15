# Design tokens: one system

Status 2026-10-15, Stage 1 of the unification. The goal: one set of primitives (Radix, wrapped in `components/ui`), one token layer, nothing hard-coded.

## The rule

A colour, radius, text size, spacing step or icon is **picked from the system**, never typed as a literal. `src/styles/design-guard.test.ts` enforces it as a ratchet: the counts in `src/styles/design-guard.baseline.json` are ceilings, a file may only go down, and no file may start. After a migration lowers a count, run `node tools/design/guard-baseline.mjs` to lower the ceiling.

Today's baseline (597 hex colours, 640 off-scale text sizes, 6 arbitrary colours; **literal radii: 0**).

## Where tokens live

| Concern | Source of truth | Used as |
|---|---|---|
| Radius | `@theme` block in `src/styles.css` | `rounded-lg`, `var(--radius-lg)`, roles `rounded-control` / `rounded-surface` / `rounded-pill` |
| Colour seeds, light and dark | `src/themes/presets.ts` (the `vanta` theme) | `--dt-*` then Tailwind `bg-background`, `text-foreground`, `--ui-*` |
| Icons | Tabler (`@tabler/icons-react`) | `@/lib/icons`, or `<Codicon name>` (adapter, `components/ui/codicon-map.ts`) |
| Type, spacing, motion, z-index | `src/styles.css` and `src/styles/vanta.css` | Stage 2 |

## Radius ramp

2 / 4 / 6 / 8 / 10 / 12 px, and every larger rounded rectangle is 12. Roles: **control** 6 (buttons, fields, menu rows), **surface** 12 (composer, dialogs, popovers, cards, bubbles), **pill** (chips, badges, avatars, switches). `50%` stays for circles. A new radius is added to the ramp, never typed.

## Token namespaces (to collapse in Stage 2)

Twelve namespaces define colours and sizes today. The plan is aliases first, then deletion:

| Namespace | Defined | Becomes |
|---|---|---|
| `--theme-*` | 52 | the seed layer (theme presets feed it) |
| `--dt-*` | 41 | the Tailwind semantic layer (`--color-*`) |
| `--ui-*` | 87 | alias of `--dt-*` and `--color-*`, then removed |
| `--vp-*` (Vanta wireframe) | 34 | alias of the same, then removed with `vp-*` classes |
| `--vs-*`, `--bb-*`, `--vs-*`, `--arc-*`, `--composer-*` | 31 / 28 / 18 / 32 | component tokens that reference semantic ones only |

`--vp-radius-*` and `--vs-radius-*` are already aliases of the radius ramp.

## Primitives

Radix is the foundation (`components/ui`, 94 files, 343 importers). `vp-*` (2,294 lines) and `vc-*` (556 lines) are replaced by pieces built on it in Stage 2, then deleted. Company forms already use the Select from that set (`VcSelect`).

## Icons

One set: Tabler. The Codicon font is gone; `Codicon` keeps its API and draws Tabler. An unmapped name renders a dot and tags itself with `data-icon-unmapped`; a test fails if any mapped name is the dot.
