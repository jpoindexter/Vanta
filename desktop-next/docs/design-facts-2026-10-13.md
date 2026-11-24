# Design facts: Codex (in ChatGPT.app) and Claude.app, 2026-10-13

Method: asar listed and CSS read in memory only (@electron/asar `extractFile`), tokenized, aggregated. Nothing unpacked or saved. Only names, numbers and counts are reported. Counts are declarations in CSS files, not DOM usage.
Tags: [measured] = read from a CSS file in the bundle. [inferred] = my deduction.

---------------------------------------------------------------------------
## A. Codex (inside ChatGPT.app)

### (a) Version
- ChatGPT.app CFBundleShortVersionString 26.1007.30912, build 20156 [measured]. Inner package name `openai-codex-electron`, version 26.1007.30912 [measured].

### (h) Local vs remote
- Renderer is LOCAL: `webview/index.html` + 317 CSS files (~2.69 MB) in the asar [measured]. Remote content (chatgpt.com pages) not assessed; local CSS for `chatgpt-conversation-*` exists too [measured].

### Styling tech (one line)
- Tailwind v4 utilities (`@layer theme/components`, `@property`, `--spacing`, `--color-*`, `--text-*`) + CSS variable theming via `light-dark()` compiled by lightningcss (`--lightningcss-light/dark` toggles) + `[data-theme=light|dark]` + hashed CSS-module classes (`_root_xttas_11`). No CSS-in-JS dependency listed in package.json [measured]; @-rule counts: @layer 316, @media 435, @container 218, @supports 473, @property 268.

### (b) Color tokens (light / dark). Gray ramp is inverted per mode.
Neutral ramp (`--gray-N`, light -> dark) [measured]:
- gray-0 #fff -> #0d0d0d | gray-25 #fcfcfc -> #101010 | gray-50 #f9f9f9 -> #131313 | gray-75 #f3f3f3 -> #161616
- gray-100 #ededed -> #181818 | gray-150 #dfdfdf -> #1c1c1c | gray-200 #cdcdcd -> #212121 | gray-300 #afafaf -> #303030
- gray-400 #8f8f8f -> #414141 | gray-500 #5d5d5d (fixed) | gray-700 #303030 -> #afafaf | gray-900 #181818 -> #ededed | gray-1000 #0d0d0d -> #fff
- Fixed (non-inverting) `--gray-fixed-*`: 0 #fff, 50 #f9f9f9, 100 #ededed, 150 #dfdfdf, 300 #afafaf, 500 #5d5d5d, 750 #282828, 800 #212121, 900 #181818, 1000 #0d0d0d
Semantic tokens, top by usage (name: light / dark) [measured]:
1. --color-text / --text-primary: #0d0d0d / #fff
2. --color-text-secondary: #5d5d5d / #cdcdcd
3. --color-text-tertiary: #8f8f8f / #afafaf
4. --color-surface: #fff / #212121
5. --color-surface-secondary: #e8e8e8 / #303030 (alt def: gray-50 / gray-100)
6. --color-surface-tertiary: #f3f3f3 / #414141 (alt: gray-75 / gray-50)
7. --color-surface-elevated: gray-0 / gray-300 (#fff / #303030)
8. --color-surface-elevated-secondary: gray-50 / gray-400 (#f9f9f9 / #414141)
9. --color-border / --border-default: #0000001a / #ffffff26
10. --color-border-light: #0000000d / #ffffff0d
11. --color-border-heavy: #00000026 / #ffffff33
12. --color-border-subtle: alpha-05 / alpha-06 (alpha-base = #0d0d0d light, #fff dark)
13. --color-border-strong: alpha-15 / alpha-20
14. --color-ring (focus): blue-500 #2c67c5 / blue-400 #3a83f7
15. --color-background-primary-solid (primary button): #0d0d0d / #f9f9f9 (hover #333 / #ededed)
16. --color-text-primary-solid / --color-text-inverse: #fff / #0d0d0d
17. --color-background-primary-ghost-hover: #0000000d / #ffffff1a
18. --color-background-primary-soft: gray-100 / gray-300 (#ededed / #303030)
19. --color-background-secondary-soft-alpha: alpha-08 / alpha-12
20. --color-text-info: #3a83f7 / #63a8f8
21. --color-text-danger: red-700 / red-500 (#e02e2a dark)
22. --color-text-success: green-700 / green-400 (#04b84c dark); --color-text-warning: orange-700 / orange-500 (#e25507)
23. --color-text-disabled: gray-400 / gray-500
24. --color-chart-blue, --color-codex-description (tooltip text) exist, unresolved
Codex-shell-specific layer `--app-color-*` (themeable; falls back to these) [measured]:
25. --app-color-text-foreground: #1a1c1f / #dfdfdf (gray-fixed-150)
26. --app-color-background-surface (main surface): #fff / #181818
27. --app-color-background-surface-under (behind rounded main surface): #f9f9f9 / #000
28. --app-color-background-application-menu: #f9f9f9 / #212121
29. --app-color-background-editor-opaque: #ededed / #212121
30. --app-color-background-elevated-primary: #fff / #212121 (opaque variant dark #282828)
31. --app-color-background-button-primary: foreground colour / #0d0d0d... (light = text-foreground #1a1c1f; dark = gray-fixed-1000)
32. --app-color-text-accent: blue-300 #339cff; --app-color-background-accent: #e5f3ff / #00284d
33. --app-color-background-status-success: green-500 #00a240 / green-400 #04b84c; error bg: red-50 / red-900; warning bg orange-50 / orange-900
34. --app-color-border-heavy: foreground @12% (color-mix oklab) in light; white in dark
35. --color-token-* aliases (315 names) map VS Code-style tokens (`--vscode-*`) onto the above; `--color-token-border-default` = foreground @8%; `--color-token-border-light` = @5% [measured]
Accent palette: blue-400 #3a83f7, blue-500 #2c67c5, blue-300 #339cff, red-500 #e02e2a, green-500 #00a240, orange-500 #e25507 [measured]
- [inferred] Palette is strictly neutral gray + one blue accent; primary button is near-black in light and near-white in dark (inverted), not coloured.

### (c) Typography
- UI font: `--font-sans-default` = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; mono = `ui-monospace, "SFMono-Regular", "SF Mono", menlo, consolas, "Liberation Mono", monospace`; user-overridable via `--font-ui-family`, `--font-code-family`, `--codex-content-font-family` [measured]. VS Code extension window type uses `--vscode-font-family`.
- @font-face families shipped: OpenAI Sans (x3), OpenAI Serif (x1), Carlito (x2), KaTeX_* [measured]. OpenAI Sans appears in 2 font-family stacks (one = `OpenAI Sans,Arial,sans-serif`); not the default shell font [measured/inferred].
- Shell text scale (`:root`, app-shared) [measured]: xs 11px, sm 12px, base 14px, lg 16px, xl 28px, 2xl 36px, 3xl 48px. Components scoped `._surface_` and `._root_` (ChatGPT-style surfaces) reset to xs 12 / sm 14 / base 16 / lg 18 / xl 20 / 2xl 24.
- rem-based pair scale `--font-text-*`: xs .75rem (12px) / lh 1rem or 1.125rem; sm .875rem (14px) / lh 1.25rem; md 1rem. Headings: xs 1rem/1.5rem semibold, sm 1.125rem, md 1.25rem, lg 1.5rem, xl 2rem [measured].
- font-size declaration counts: 14px 46, 12px 36, 16px 28, 1em 22, 13px 17, 15px 16, .75rem 14, 10px 9, 20px 7, 11px 7.
- line-height counts: 20px 40, 1 37, 1.5 20, 18px 17, 16px 17, spacing*5 (20px) 17, 24px 12, 28px 10.
- font-weight: 400 (--font-weight-normal), 500 medium, 600 semibold, 700 bold; declarations: semibold token 52, 600 39, 500 39, 400 38, medium token 38+31. Variable-weight variants 510 / 590 / 650 appear in a few spots [measured].
- letter-spacing: tracking-tight -.025em, normal 0, wide .025em; many components set 0em [measured].

### (d) Border radius
- Token ramp (x `--corner-radius-scale`, default 1): 2xs 2px, xs 4px, sm 6px, md 8px, lg 10px, xl 12px, 2xl 16px, 3xl 20px, 4xl 24px, full 9999px [measured]. `--ds-radius-panel` 24px. Main-surface clip radius = xl (12px). Toolbar buttons use lg (10px).
- Declaration counts: 999px 61, --radius-full 55, inherit 41, 9999px 30, 50% 36, 0 33, --radius-md 26, 8px 16, --radius-lg 13, 6px 12, 2px 12, 24px 11, 12px 11, --composer-border-radius 11.

### (e) Shadows (values only)
- `--shadow-sm` 0 1px 2px -1px #00000014
- `--shadow-md` 0 2px 4px -1px #00000014
- `--shadow-lg` 0 4px 8px -2px #0000001a
- `--shadow-xl` 0 8px 16px -4px #0000001f
- `--shadow-xl-spread` 0 0 0 .5px <border colour>, then shadow-xl
- elevation geometry 100/200/300/400: 0 1px 2px -1px / 0 2px 4px -1px / 0 4px 8px -2px / 0 8px 16px -4px; alpha light .08 / .08 / .10 / .12; alpha dark .20 / .20 / .36 / .30 (colour rgb 0 0 0)
- Hairline: `--shadow-hairline` 0 0 0 .5px #0000001a; `--hairline` 1px, .5px on >=1.5x screens; `--border-width-hairline` .5px
- Focus ring: 0 0 0 2px var(--color-ring). Popover (menus): 0 8px 16px #00000052, inset 0 0 1px #fff3, 0 0 1px #0000009e.
- [inferred] Shadows are very light; separation relies on 0.5px hairline borders and background steps.

### (f) Spacing
- Base unit `--spacing` 4px (.25rem) [measured]; Tailwind multiples used 2261 times.
- gap counts: 8px 58, 4px 42, 6px 26, spacing*3 (12px) 24, 2px 21, spacing*2 (8px) 21+15, 12px 20, spacing*1.5 (6px) 13.
- padding counts: 24px 15, 4px 10, 0 8px 7, 0 12px 6, 12px 6, 8px 6, spacing*3 6, spacing*2 / spacing*3 5. Menu padding via `--menu-item-padding`, row padding-x `--padding-row-x` = 8px.
- margin: overwhelmingly 0 / 0 auto; markdown uses em margins (.5em, 1em).

### (g) Layout dimensions [measured unless noted]
- Sidebar width: clamp(240px, `--codex-sidebar-preferred-width` default 275px, min(520px, 100vw - 320px)). Sidebar nav row height 36px (spacing*9); nav header 52px (spacing*13); sidebar icon button 24px; row padding-x 8px.
- Titlebar height: `--height-titlebar` 44px (spacing*11), or `max(44px, env(titlebar-area-height))`. Toolbar height 46px (`--height-toolbar`); toolbar-sm 36px; pane toolbar 40px.
- Content (thread) max-width: `--thread-content-max-width` 40rem = 640px (can be `none`). Thread gutter clamp(12px, 3cqi, 24px). Thread top inset = toolbar + 32px.
- Composer: radius 22px (spacing*5.5) for `--composer-radius` / single-line token (single-line variant computed = button height / 2 + 8px); min-height 44px (spacing*11) in default layout, 40px (spacing*10) multiline; editor line-height 20px (24px alt); max-height min(25dvh, ...); button heights 32px / 36px (spacing*8/9), small 20px; control sizes xs 26px, sm 28px, md 32px; surface bg = surface-elevated-secondary (or transparent), shadow via `--elevation-composer` (unresolved); attachment inset 8px.
- Main surface: rounded top corners 12px over `surface-under`; panels 24px radius (`--ds-radius-panel`); floating panel inset 6px.
- Right panel width: NOT found in CSS (set in JS) [measured absence]. Menu row height 40px (spacing*10), command menu list max-height 300–440px, settings row 64px, dialog radius 24px band.
- Window zoom: `--codex-window-zoom` used in 53 places (UI zoom feature).

---------------------------------------------------------------------------
## B. Claude.app

### (a) Version
- CFBundleShortVersionString / CFBundleVersion 2.31226.1; package `@ant/desktop` 2.31226.1 [measured].

### (h) Local vs remote (stated plainly)
- Local renderer is a THIN SHELL. `main_window` ships only 15 CSS files total (~296 KB across all windows: main, about, buddy, find-in-page, quick, etc.) and the main-window page JS is ~11 KB [measured]. index.html contains only a boot placeholder (sidebar skeleton + 48px drag strip) [measured].
- The chat UI itself is almost certainly remote claude.ai loaded into a WebContentsView (12 WebContentsView refs, 63 loadURL refs, hosts claude.ai / preview.claude.ai / assets.claude.ai in main JS) [inferred]. Therefore sidebar width, composer shape, thread max-width, font sizes of the real chat UI are NOT measurable from local files. I stop that section here rather than guess.
- What IS local: the token set below (identical naming to claude.ai tokens), the boot placeholder, and secondary windows.

### (b) Color tokens (local CSS; HSL triples converted to hex by me). light / dark [measured]
- --bg-000 #ffffff / #30302e | --bg-100 #faf9f5 / #262624 | --bg-200 #f5f4ed / #1f1e1d | --bg-300 #f0eee6 / #141413 | --bg-400,500 #e8e6dc / #000000
- --text-000 #141413 / #faf9f5 | --text-100 #141413 / #faf9f5 | --text-200,300 #3d3d3a / #c2c0b6 | --text-400,500 #73726c / #9c9a92
- --border-100..400 #1f1e1d / #dedcd1 (used with alpha in practice [inferred])
- --brand-000/100 #c6613f; --accent-brand / brand-200 #d97757 (same both modes); `--clay` #d97757, `--clay-hover` #c86848, `--cream` #f4f3ee, `--ink` #2d2d2d, `--ink-dim` #6b6862, `--line` #2d2d2d1a
- --accent-000 #1b67b2 / #74abe2; --accent-100/200 #2c84db; --accent-900 #d3e5f8 / #1c3f62 (blue = links/selection)
- --accent-pro-000 #433872 / #9b87f5 (purple = Pro)
- --danger-100/200 #b53333 / #dd5353; --success-100/200 #2f7613 / #459315; --oncolor-100 #fff
- Window backgrounds: `--claude-background-color` #fcfcfb light / #151515 dark; foreground black / white; `--claude-text-500` dark #a6a39b. Boot sidebar = #f9f9f7 mixed 50% into #fcfcfb light; #151515 mixed 80% into black dark; seam rgba(11,11,11,.10) / rgba(255,255,255,.10); row rgba(11,11,11,.05) / rgba(255,255,255,.075).
- Tailwind-derived defaults also present: gray-500 #6b7280, blue-600 #2563eb (generic).
- [inferred] Warm paper palette (yellow-tinted off-whites, near-black #141413) with one clay-orange brand accent; dark mode is warm charcoal, not blue-black.

### (c) Typography
- Families (@font-face, 17 rules) [measured]: `anthropic-sans` (x10), `anthropic-serif` (x10), `Anthropicons-Variable` (icon font). Stack: `"anthropic-sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", ...`; serif: `"anthropic-serif", ui-serif, Georgia, "Times New Roman"...`; mono `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`.
- Variable weight axis 300–800 declared (16 rules) [measured]. Weights used: 300 800 (variable), 600, 700, bolder.
- Scale tokens (Tailwind defaults): xs .75rem / 1rem, sm .875rem / 1.25rem, lg 1.125rem / 1.75rem, xl 1.25rem / 1.75rem, 2xl 1.5rem / 2rem; leading-relaxed 1.625; tracking-wider .05em. `--cds-*` design-system size tokens (body/caption/footnote/title) are referenced but not defined locally (remote) [measured].
- Local declaration counts (small sample, shell windows only): font-size 10px 6, 11px 2, 12px 2, 18px 2.

### (d) Radius
- --radius-md .375rem (6px), --radius-lg .5rem (8px); declarations: 0 x7, .25rem x4, 2px x4, 6px x4, 50% x2, 16px, 10px, 7px, 3px. `--radius-card` = `--cds-radius` + 4px (cds-radius undefined locally).

### (e) Shadows
- Mostly Tailwind ring/shadow composition vars (33 declarations). Literal values: `0 6px 20px #e8652a38, 0 2px 4px #0000001f, inset 0 1px #fff3` (orange-glow button); `inset 0 1px 2px #00000080`; `inset 0 -2px 3px #0000004d, inset 0 1px #ffffff26, 0 1px #0000001a`; focus `0 0 0 2px Highlight` fallback.
- Named: --shadow-popover, --shadow-panel, --shadow-panel-lg = double ring (inner + outer hairline) + soft drop (values defined remotely).

### (f) Spacing
- `--spacing` .25rem (4px), used 91 times. gap: 8px x3, spacing*{.5,1,1.5,2,4,5}. padding: 0 x15, `0 13px` x3, `10px 12px`, `.5rem .75rem`, spacing*{2,3,3.5}.

### (g) Layout dimensions
- Only: drag strip / titlebar region 48px (scaled by `--boot-placeholder-scale`) [measured]; boot sidebar width is set at runtime from JS (value not in CSS) [measured absence]; max-w utilities 240px / 400px / 28rem (generic). No composer, thread, or right-panel numbers locally. Everything else: not determinable (remote).

---------------------------------------------------------------------------
## C. What this implies for Vanta (my INFERENCE, not measured)
1. Palette: go neutral-gray ramp, inverted per mode, with ONE accent. Use Codex's ramp (#0d0d0d..#fff, #181818 main surface dark, #000 under-surface) as the structural model; borrow Claude's warm off-whites only if Vanta wants a warmer identity (it is a different mood, do not mix).
2. Pick one accent and keep it for focus ring, links and selection; keep primary button as inverted near-black/near-white (Codex) rather than a coloured fill.
3. Separation by 0.5px hairline borders (alpha 8-15% of foreground) plus 3-4 surface steps; shadows only on popovers/menus (0 8px 16px -4px, alpha .12 light / .30 dark).
4. Type: 14px body / 20px line-height, 12px secondary / 16px, 11px micro, 16px section heading (600), 18-24px page headings; weights 400/500/600 only; system sans (-apple-system) + SF Mono. A branded sans is optional; both apps ship their own, but Codex's shell ships system fonts.
5. Spacing: 4px base; dominant gaps 4/6/8/12, row padding-x 8px, panel padding 12-24px.
6. Radius ramp 4/6/8/10/12/16/20/24 + pill; controls 8-10px, panels 16-24px, main surface top corners 12px, buttons pill or 10px.
7. Sidebar: default ~275px, resizable 240-520px; nav rows 36px tall; header band 52px; titlebar 44-46px; toolbar 46px.
8. Thread: centered column max 640px (40rem) with 12-24px fluid gutter; right/diff panel width is JS-driven in Codex, so choose Vanta's own (e.g. 360-480px) without claiming parity.
9. Composer: rounded rectangle radius 22px, min-height 44px (single line), 20px editor line-height, 32-36px controls inside, elevated-secondary surface with hairline, expands up to ~25dvh.
10. Do NOT try to match Claude's chat UI: it is remote and unmeasurable here; match only its token mood (warm neutrals, clay accent) if wanted.
