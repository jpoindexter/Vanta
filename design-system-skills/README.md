# Vanta Design System Skills

A complete, modern design knowledge base — **17 reference-grade skills** spanning atomic
design and standard design-system practice through to UX heuristics and the cognitive laws
behind them. Built for **any screen**: web, iOS/Android app, macOS/Windows desktop, mobile,
tablet, TV, watch, foldable.

Each skill is a self-contained `SKILL.md` (Vanta skill format — frontmatter +
deep body), depth over fluff: real numbers, copy-pasteable CSS/tokens/HTML, comparison
tables, do/don't, common mistakes, cross-device notes. Modern (2024–2026): OKLCH, container
queries, fluid `clamp()` type, variable fonts, W3C DTCG tokens, Material 3, Apple HIG,
WCAG 2.2, view transitions.

## View it

Open **`index.html`** in any browser (self-contained, works from `file://` — no server
needed). Sidebar grouped by Foundations / Structure / Interaction & device / UX principles;
filter box; collapsible cards.

## The skills

**Foundations** — `design-tokens` · `typography-system` · `color-and-elevation` ·
`grid-and-spacing` · `iconography-and-imagery`
**Structure** — `atomic-design` · `layout-and-composition` · `components-and-states` ·
`design-system-governance`
**Interaction & device** — `interaction-and-motion` · `forms-and-data-entry` ·
`responsive-and-multi-device` · `platform-conventions`
**UX principles** — `usability-heuristics` (Nielsen, Norman, Shneiderman, Rams) ·
`laws-of-ux-and-psychology` (Fitts, Hick, Miller, Jakob, Doherty, Peak-End…) ·
`ux-writing-and-content` · `accessibility-and-inclusive-design`

## Install as skills

These are standard `SKILL.md` files. Copy/symlink a skill dir
into `~/.claude/skills/`. To bundle into Vanta, drop a dir into `vanta-ts/skills-library/`
(auto-installed next session). Each `name:` matches its folder.

## Regenerate the viewer

After adding or editing a skill, rebuild `index.html`:

```bash
python3 scripts/build-design-skills-index.py   # needs `mistune`
```
