# Hermes Recon 04 — Startup Banner & Live Inventory

Maps the Hermes startup screen (ASCII hero/logo, version line, Available Tools,
MCP Servers, Available Skills, counts, "N commits behind") to its source code,
then notes the Vanta-port path.

Reference (READ-ONLY): `/Users/jasonpoindexter/Documents/GitHub/_active/hermes-reference`

Primary sources:
- `hermes_cli/banner.py` — **the whole banner is built here** (`build_welcome_banner`).
- `tools/mcp_tool.py::get_mcp_status` — MCP server status rows.
- `tools/skills_tool.py::_find_all_skills` / `_get_category_from_path` — skill list + categories.
- `model_tools.py::get_toolset_for_tool` / `check_tool_availability` — tool→toolset map, availability.
- `cli.py:3147` — the "Unknown toolsets" warning (printed separately, *before* the panel).
- `ui-tui/src/banner.ts` + `gatewayTypes.ts` — the **TUI gateway** front-end. Note: the
  rich/Python banner above is the *CLI* banner. The TS side has its own gradient-colored
  ASCII (`LOGO_ART` / `CADUCEUS_ART`) and a `GatewaySkin` ({banner_hero, banner_logo,
  branding, colors}) used when a skin overrides the art. Both render the same logical
  screen; the Python `build_welcome_banner` is the canonical data path the screenshot shows.

---

## 1. Banner layout (literal regions)

```
                                                          ← console.print() blank line
██╗  ██╗███████╗██████╗ ...  █████╗  ██████╗ ...          ┐
██║  ██║██╔════╝██╔══██╗...  ██╔══██╗██╔════╝ ...         │ HERMES_AGENT_LOGO (banner.py:63)
███████║█████╗  ██████╔╝...  ███████║██║  ███╗...         │ gold→bronze gradient, 6 rows
... (6 rows) ...                                          │ ONLY printed if term_width >= 95
╚═╝  ╚═╝╚══════╝╚═╝  ...      ╚═╝  ╚═╝ ╚═════╝ ...         ┘ (banner.py:743)

┌─ Hermes Agent v0.15.1 (2026.5.29) · upstream Ad16a24b ──────────────────┐  ← Panel title
│                                                                          │     = format_banner_version_label()
│   ⠀⠀⢀⣠⣴⣾⣿⣿⣇⠸⣿⣿⠇⣸⣿⣿⣷⣦⣄⡀⠀     Available Tools                          │
│   ⠀⢀⣠⣴⣶⠿⠋⣩⡿⣿⡿⠻...  (caduceus    browser: browser_back, browser_click,│  ┐ LEFT col   = caduceus art +
│   ...HERMES_CADUCEUS, 15 rows)...     computer_use, execute_code, ...     │  │ model/ctx/cwd/session
│                                       cronjob: cronjob                    │  │
│   claude-sonnet-4 · 200K context      delegate_task: delegate_task       │  │ RIGHT col  = inventory
│        · Nous Research                discord: discord                   │  │ (right_lines[])
│   /Users/.../cwd                      ... (8 toolsets max, sorted) ...    │  │
│   Session: abc123                     (and N more toolsets...)            │  │
│                                                                          │  │
│                                       MCP Servers                         │  │ ← only if mcp_status non-empty
│                                       notebookim (stdio) — failed          │  │   red name + "— failed"
│                                       mobbin (stdio) — failed              │  │   OR: name (transport) — N tool(s)
│                                       refero (stdio) — failed              │  │
│                                                                          │  │
│                                       Available Skills                    │  │
│                                       apple-notes: ...   (category: names)│  │ ← per-category row,
│                                       claude-code: ...                    │  │   8 names then "+N more"
│                                       codex: ...                          │  │
│                                       ... (sorted by category) ...        │  │
│                                                                          │  │
│                                       Runtime: codex app-server  (opt)    │  │ ← only if codex runtime
│                                       Profile: <name>            (opt)    │  │ ← only if profile != default
│                                       84 tools · 102 skills · 3 MCP servers · /help for commands
│                                       ⚠ 4 commits behind — run hermes update to update │ ← only if behind != 0
│                                       ⚠ pip install not officially supported (opt)     │
└──────────────────────────────────────────────────────────────────────────┘
```

Plus, printed to console **before** the panel (not inside it), from `cli.py:3147`:
```
Warning: Unknown toolsets: mcp-codegraph        ← [bold red], only if invalid toolset names passed
```

`build_welcome_banner` ends with: blank line → logo (if wide enough) → blank → the
`Panel(layout_table, title=version_label, border_style=bronze)`. The two-column body is
a `rich.table.Table.grid` (left = centered caduceus+meta, right = left-justified inventory).
"Welcome to Hermes Agent! Type your message or /help…" in the screenshot is the gateway/CLI
prompt emitted separately (skin_engine / cli.py), not by `build_welcome_banner`.

---

## 2. Data sources per region

| Region | Source | Computation / coloring |
|---|---|---|
| **Logo ASCII** | `HERMES_AGENT_LOGO` const (banner.py:63) | Static. Rich markup gold gradient `#FFD700→#FFBF00→#CD7F32`. Only printed when `shutil.get_terminal_size().columns >= 95`. Skin override: `_bskin.banner_logo`. |
| **Caduceus ASCII** | `HERMES_CADUCEUS` const (banner.py:70) | Static, 15 rows, gold→bronze. Skin override: `_bskin.banner_hero`. (TS twin: `CADUCEUS_ART`+`CADUC_GRADIENT` in `ui-tui/src/banner.ts`.) |
| **Version title** | `format_banner_version_label()` (banner.py:404) | `Hermes Agent v{VERSION} ({RELEASE_DATE})` from `hermes_cli.__version__`/`__release_date__`, then `· upstream {sha}` from `get_git_banner_state()`. If local is ahead: `· local {sha} (+N carried commits)`. Title links to release URL if `get_latest_release_tag()` resolves. Color `banner_title` (#FFD700). |
| **model · ctx · cwd · session** | fn args `model`, `context_length`, `cwd`, `session_id` | model truncated >28 chars, `.gguf` stripped; ctx via `_format_context_length` (128000→"128K", 1048576→"1M"). |
| **Available Tools** | fn arg `tools` (list of `{function:{name}}`) + `get_toolset_for_tool` | Each tool → toolset via `get_toolset_for_tool(name) or "other"`, name normalized by `_display_toolset_name` (strips `_tools` suffix). Grouped into `toolsets_dict`. Sorted, **first 8 toolsets** shown; rest → "(and N more toolsets...)". Per row truncated to ~45 chars → "...". |
| Tool **coloring** | `check_tool_availability(quiet=True)` → `unavailable_toolsets`, cross-ref `TOOLSET_REQUIREMENTS` | name in `disabled_tools` → **red**; name in `lazy_tools` (toolset has a `check_fn`, e.g. honcho/homeassistant — not yet initialized) → **yellow**; else `banner_text` (#FFF8DC). |
| **MCP Servers** | `tools.mcp_tool.get_mcp_status()` | Returns `[{name, transport, tools, connected}]` for every *configured* server (`_load_mcp_config`), connected or not. transport = "stdio" unless cfg has `url`. Section omitted entirely if list empty. |
| MCP **coloring** | inline (banner.py:623) | connected → `name (transport) — N tool(s)` in dim/text; not connected → **red** `name (transport) — failed`. |
| **Available Skills** | `get_available_skills()` → `tools.skills_tool._find_all_skills()` | Returns skills already platform-gated + disabled-filtered; grouped into `{category: [names]}` by `banner.py`. |
| Skill **coloring/grouping** | see §3 | category label dim, names text. |
| **Counts footer** | computed inline (banner.py:655) | `len(tools)` tools · `sum(len) of skills` · `mcp_connected` (count of connected only) MCP servers · "/help for commands". (Screenshot "84 Tools · 102 skills · 3 MCP servers" = these three.) |
| **Runtime / Profile lines** | `codex_runtime_switch.get_current_runtime`, `profiles.get_active_profile_name` | Optional; shown only when codex runtime active / profile ≠ "default". |
| **N commits behind** | `get_update_result(timeout=0.5)` ← prefetched `check_for_updates()` | Background daemon thread (`prefetch_update_check`). `behind > 0` → `⚠ {N} commit(s) behind — run {recommended_update_command()} to update` (**bold yellow**). `behind == -1` (UPDATE_AVAILABLE_NO_COUNT, nix builds) → `⚠ update available`. `0`/`None` → nothing. Cached 6h in `$HERMES_HOME/.update_check`, invalidated on rev/version change. |
| **Unknown toolsets warning** | `cli.py:3147` | Printed **outside** the panel, before it. `invalid = [t for t in toolsets if not validate_toolset(t) and t not in mcp_names]`. Bold red. |

### How "commits behind" is computed (`check_for_updates`, banner.py:213)
1. If `HERMES_REVISION` env set (nix) → `_check_via_rev`: `git ls-remote` upstream main, compare → `0` or `-1`.
2. Else if local `.git` exists (`Path(__file__).parent.parent` or `$HERMES_HOME/hermes-agent`) → `_check_via_local_git`: `git fetch` then `git rev-list --count HEAD..origin/main` → exact integer.
3. Else → `check_via_pypi`: compare `VERSION` to PyPI latest → `0`/`1`.

`upstream sha` in the title is independent: `get_git_banner_state` runs `git rev-parse --short=8 origin/main` (+ HEAD, + `rev-list --count origin/main..HEAD` for "ahead"). Docker fallback: baked `build_info.get_build_sha()`.

---

## 3. Skill categorization & coloring

- **Source of categories:** `_get_category_from_path(skill_path)` (skills_tool.py:447). A skill at
  `~/.hermes/skills/<category>/<skill>/SKILL.md` → category = `<category>` (the first path part when
  `len(parts) >= 3` relative to a skills dir). Skills not nested under a category folder → category `None`
  → bucketed as `"general"` in `get_available_skills()` (banner.py:107).
- **Grouping:** `get_available_skills()` returns `{category: [name, ...]}`. Banner iterates
  `sorted(skills_by_category.keys())`; within each, `sorted(skill_names)`; **first 8** names then
  `+{N} more`; whole row truncated to 50 chars → "...".
- **Coloring (banner.py:650):** there is **no per-category color palette**. Every row is
  `[dim {banner_dim}]{category}:[/] [{banner_text}]{names}[/]` — category label in dim bronze (#B8860B),
  names in cream (#FFF8DC). The screenshot's "color-coded categorized list" is this two-tone (dim label /
  bright names) repeated per category, *not* a distinct hue per category. (Tools, by contrast, *do* get
  semantic red/yellow status colors — skills do not.)

---

## 4. Vanta-port note

Vanta banner regions vs. existing calls (`vanta-ts/src`):

| Banner region | Vanta feed | Status |
|---|---|---|
| Available Tools (names) | `setup.registry.schemas()` → `ToolSchema[]` (each has `.name`). `ToolRegistry.list()`/`schemas()` in `tools/registry.ts`. | **Available.** Flat list of names. |
| Tool→toolset grouping | — | **Missing.** Vanta has no toolset concept or `get_toolset_for_tool`. Tools are a flat registry. Either skip grouping or add a `toolset?` field to `Tool`/`ToolSchema`. |
| Tool availability coloring (red/yellow) | — | **Missing.** No `check_tool_availability` / lazy-init / disabled-tool notion. |
| Tool count | `setup.registry.schemas().length` | **Available.** |
| MCP Servers status rows | `mountMcpServers()` → `MountResult { servers: string[]; toolCount }` (`mcp/mount.ts`). Config via `readMcpConfig`. | **Partial.** `MountResult.servers` lists only *succeeded* servers; `toolCount` is a total, not per-server. **Missing:** failed-server rows, transport, per-server tool counts, connected flag. To match Hermes need an Vanta equivalent of `get_mcp_status()` returning `{name, transport, tools, connected}` per *configured* server (mount.ts currently only logs failures via the `log` callback, doesn't return them). |
| MCP count (footer) | `MountResult.servers.length` (connected) | **Available** (connected count). |
| Available Skills (names) | `listSkills(env)` (`skills/store.ts`) → `Skill[]` | **Available** for names + total. `status.ts::gatherStatus` already calls `listSkills(env).then(s => s.length)` for `store.skills`. |
| Skill **categories** | — | **Missing.** Vanta `SkillMeta` (skills/types.ts) has `name/description/created/updated/tags[]` — **no `category`**, and the skills store is flat (no `<category>/<skill>/` nesting like Hermes). To group, either derive from `tags[]` or add path-based categorization. As-is, all skills are effectively one bucket. |
| Skill count | `listSkills(env).length` | **Available.** |
| Version title (`vX.Y.Z (date)`) | — | **Missing.** Only `vanta-ts/package.json` `version: "0.1.0"`; no `__release_date__`, no banner const. |
| `· upstream <sha>` / `local` / `+N carried` | — | **Missing.** No `get_git_banner_state` equivalent (no git rev-parse plumbing). |
| **N commits behind** | — | **Missing entirely.** No `check_for_updates`, no PyPI/ls-remote/rev-list logic, no `.update_check` cache, no `prefetch_update_check` thread. |
| ASCII hero/logo | partial — `formatStatus` uses `⚕ Vanta Status` glyph only | **Missing.** No multi-row ASCII logo/caduceus, no skin/`GatewaySkin` equivalent, no gradient coloring. |
| "Unknown toolsets" warning | — | **Missing** (no toolset validation; ties to the missing toolset concept). |

**Summary of Vanta gaps to build a Hermes-style banner:** (1) toolset grouping + per-tool
availability/coloring; (2) richer MCP status (failed rows, transport, per-server counts, connected flag —
extend `MountResult` or add `getMcpStatus()`); (3) skill categories (add field or path nesting); (4) the
**entire** version / upstream-sha / commits-behind subsystem (version const + release date + git/PyPI
update check); (5) the ASCII art + skin layer. Vanta's `gatherStatus()`/`formatStatus()` (status.ts) is the
closest existing surface and already wires `listSkills` and provider/context-window — it's the natural host
to extend, but it currently renders a `✓/✗` health box, not the inventory banner.

---

### Source line references
- `hermes_cli/banner.py`: logo `:63`, caduceus `:70`, `get_available_skills :92`, `check_for_updates :213`,
  `get_git_banner_state :302`, `format_banner_version_label :404`, `build_welcome_banner :478`,
  tools section `:554`, MCP section `:613`, skills section `:636`, counts `:655`, update line `:684`.
- `tools/mcp_tool.py::get_mcp_status :3651`.
- `tools/skills_tool.py::_get_category_from_path :447`, `_find_all_skills :550`.
- `model_tools.py::get_toolset_for_tool :1050`, `check_tool_availability :1065`.
- `cli.py` unknown-toolsets warning `:3147`.
- `ui-tui/src/banner.ts` (TS gateway art), `ui-tui/src/gatewayTypes.ts::GatewaySkin :3`.
- Vanta: `vanta-ts/src/status.ts`, `tools/registry.ts`, `skills/store.ts`+`skills/types.ts`, `mcp/mount.ts`.
