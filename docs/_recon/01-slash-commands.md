# Hermes Slash Command System — Recon

Reference: `~/Documents/GitHub/_active/hermes-reference` (READ-ONLY).
Purpose: map every Hermes slash command and what it DOES, so Vanta can re-implement
the useful subset in its **in-process** Ink TUI (no gateway protocol).

---

## 1. Architecture — two surfaces, one fallthrough

Hermes splits commands across two registries:

| Surface | File | Role |
|---|---|---|
| **Python `COMMAND_REGISTRY`** | `hermes_cli/commands.py` | Authoritative, single source of truth. ~75 `CommandDef` entries. Drives CLI help, gateway dispatch, Telegram/Slack command maps, autocomplete. |
| **TS `SLASH_COMMANDS`** | `ui-tui/src/app/slash/registry.ts` (+ `commands/{core,session,ops,setup,debug}.ts`) | Client-side interactive subset the TUI handles **without a backend round-trip** — anything that opens an overlay, mutates local transcript/UI state, or wants instant feedback. |

### Dispatch fallthrough (`ui-tui/src/app/createSlashHandler.ts`)

When the user types `/x`, the TUI resolves it in this order:

1. **Local TS registry** (`findSlashCommand`) — if found, run it in-process and stop. This is where all the interactive overlays live.
2. **Canon alias resolution** — `catalog.canon` (from `commands.catalog` RPC) maps aliases/prefixes → canonical names; unique prefix completes, ambiguous prefix prints `ambiguous command: …`.
3. **`slash.exec` RPC** — runs the command in a detached **slash-worker subprocess** on the gateway (`tui_gateway/slash_worker.py`); returns `{output, warning}` rendered inline (short) or in a pager `page()` (long, >180 chars or >2 lines).
4. **`command.dispatch` RPC fallback** (on `slash.exec` failure) — `tui_gateway/server.py @method("command.dispatch")` returns a **`CommandDispatchResponse`** the TUI acts on:

| `type` | Produced by (server.py) | TUI action |
|---|---|---|
| `exec` | quick_commands shell run / goal status etc. | print `output` inline |
| `alias` | `quick_commands` alias entry | re-dispatch `/target` |
| `skill` | `agent.skill_commands.build_skill_invocation_message` | print "⚡ loading skill: name", then **submit** `message` to the agent |
| `send` | `/queue`, `/retry`, `/goal`, `/steer` | submit `message` as a turn (optional `notice` line first) |
| `prefill` | `/undo` server path (~L6054) | drop `message` into the **composer** for the user to edit/resubmit (does NOT submit) |
| `plugin` | `hermes_cli.plugins` handler | print `output` inline |

### Vanta port — the spine

Vanta has **no gateway**. The port = collapse the fallthrough into in-process dispatch:
- Keep a single local command table (like the TS registry) — there is no step 3/4 round-trip.
- Every `ctx.gateway.rpc('session.*' | 'config.*' | …)` becomes a **direct call** into Vanta's sessions store (`~/.vanta/sessions`), provider abstraction, tool registry, or kernel.
- The `skill`/`send`/`prefill` distinction still matters: `send` = enqueue a real turn; `prefill` = populate the composer; `skill` = inject a skill-invocation prompt. Vanta's composer + turn loop already model these.
- Commands marked **gateway_only** below (messaging-platform plumbing) are **Vanta N/A** — skip them.

---

## 2. Interactive commands (overlays / pickers) — full interaction

These are the ones that matter most for the TUI port. All open via `patchOverlayState({...})` and are rendered by `ui-tui/src/components/appOverlays.tsx`.

### `/model`  (`change or show model`)
- **Category:** Configuration. **Args:** `[model] [--provider name] [--global] [--refresh]`.
- **DOES:** Bare `/model` → opens **multi-stage ModelPicker overlay** (`components/modelPicker.tsx`). With an arg → skips the overlay and directly `config.set key=model` (session-scoped), printing `model → <id>`.
- **UI surface — picker stages:**
  1. **Provider stage (1/2):** list of providers with auth glyph (`●` authed / `*` current / `○` needs auth) and model count. `↑/↓` select, **type-to-filter** (fuzzy on name+slug+models), `Enter` choose, `^g` toggle session-vs-global persist, `^d` disconnect an authed provider, `Esc` clears filter then backs out, `q` close.
  2. **Key stage** (only if provider is `api_key` + unauthenticated): inline masked API-key entry → `model.save_key` RPC (saves to `~/.hermes/.env`), `Enter` save / `^u` clear / `Esc` back.
  3. **Model stage (2/2):** filtered model list for the chosen provider; `Enter` switches.
  4. **Disconnect stage:** `y/Enter` confirm → `model.disconnect`, `n/Esc` cancel.
- **Selection emits:** `<model> --provider <slug>` + (` --global` if persistGlobal else the internal `TUI_SESSION_MODEL_FLAG`) back through the `/model` handler → `config.set`.
- **Backend:** `model.options` (list), `model.save_key`, `model.disconnect`, `config.set key=model`.
- **Vanta port:** Provider list comes from Vanta's **provider abstraction**; render the same 2-stage picker. Stage 1 lists configured providers (+auth state), stage 2 lists each provider's model IDs. Key entry writes to Vanta's env/credential store. Switch = update active model on the current session in `~/.vanta/sessions`. Drop the `--global` vs session flag down to "persist to config" vs "this session only".

### `/sessions`  (aliases `switch`, `session`, `resume`) — `browse, switch, or resume`
- **Category:** Session. **DOES:** Bare → opens **Sessions overlay** (`components/activeSessionSwitcher.tsx`). `/sessions new` → spins a new *live* session (keeps current running). `/sessions <id|title>` or `/resume <x>` → loads a cold session and **closes the current one** (guarded while a turn is in-flight).
- **UI surface:** Merged list ordered `[+ new][live…][history…]`. `↑/↓` move, `Enter` activate (live) or resume (history), `d`-then-`d` (two-press) to delete a history session (`session.delete`), `Esc/q` close. Live rows show status glyph (`✓`idle `▶`working `?`waiting `…`starting). Embeds the ModelPicker for per-session model on new.
- **Backend:** `session.active.list`, `session.list`, `session.activate`, `session.resume`, `session.close`, `session.delete`.
- **Vanta port:** Read `~/.vanta/sessions` for the list; "activate/resume" loads that session's transcript into the TUI; "new" creates a session row; delete removes the dir/row. Vanta likely runs one active session in-process — "live vs cold" can collapse to "currently loaded vs on disk" unless Vanta supports concurrent sessions.

### `/agents`  (alias `tasks`) — `spawn-tree dashboard`
- **Category:** Session. **DOES:** Bare → opens **AgentsOverlay** (`components/agentsOverlay.tsx`), a live audit of delegated subagents with kill/pause controls. Subcommands skip the overlay: `/agents pause|resume` → `delegation.pause`; `/agents status` → prints `delegation · active/paused · caps dN/M`.
- **UI surface (overlay keys):** `↑/↓` navigate tree, `</[ ` and `>/]` step through history snapshots, `p` pause/resume spawning, `x` kill selected node (`subagent.interrupt`), `X` kill subtree, `Esc/q` close, flash line shows action results.
- **Backend:** `delegation.status`, `delegation.pause`, `subagent.interrupt`, spawn-tree snapshot store.
- **Vanta port:** Maps to Vanta's **kernel** (goals/subagents). If Vanta doesn't do multi-level delegation yet, this is a future overlay — port the pause/kill/status semantics onto whatever Vanta's task/goal runner exposes. `/replay` + `/replay-diff` (below) read archived spawn trees from disk via the same overlay.

### `/skills`  — `browse, inspect, install skills`
- **Category:** Tools & Skills. **DOES:** Bare → opens **SkillsHub overlay** (`components/skillsHub.tsx`). Subcommands act inline via `skills.manage` RPC: `list`, `inspect <name>`, `search <q>`, `install <name|url>`, `browse [page]` (scans community sources, ~15s). Unknown subcommand → `slash.exec` worker.
- **UI surface (hub keys):** `↑/↓` select, `Enter` open/inspect, `1-9,0` quick-select, inspect view → `i` reinspect / `x` reinstall / `Enter/Esc` back / `q` close.
- **Backend:** `skills.manage {action}`, `skills.reload`, `commands.catalog` (refresh after reload).
- **Vanta port:** Wire to Vanta's **tool registry** / skill loader. Inline subcommands stay the same; the hub overlay is optional polish.

### `/setup`  — `run full setup wizard`
- **Category:** (TS-only). **DOES:** Suspends the Ink TUI (`withInkSuspended`), shells out to `hermes setup …` as an **external child process** (`runExternalSetup` in `app/setupHandoff.ts`), then on exit 0 checks `setup.status` and starts a fresh session. Not an overlay — a full-screen handoff to an external CLI.
- **Vanta port:** Vanta can run its own setup as an in-process wizard screen OR suspend Ink and run a setup subcommand. Simpler in-process: a dedicated setup overlay that writes provider creds to `~/.vanta` config, then `setup.status`-equivalent check.

### `/clear` + `/new`  (alias `reset` on the Python side) — `start a new session`
- One handler (`core.ts`); `cmd.startsWith('/new')` distinguishes (`/new [title]` can name the session). **DOES:** Ends the current conversation, clears transcript, forges a new session ID. Shows a **danger confirm overlay** (`patchOverlayState({confirm:{…}})`) unless `NO_CONFIRM_DESTRUCTIVE` env is set.
- **Vanta port:** New session row in `~/.vanta/sessions`, clear in-memory transcript, keep the confirm overlay (it's a destructive op).

---

## 3. Non-interactive client-side commands (TS local registry)

These run in-process in the TUI today; they're the natural Vanta in-process set. RPC calls listed = what becomes a direct Vanta call.

| Command | Aliases | Cat | DOES | Backend RPC → Vanta |
|---|---|---|---|---|
| `/redraw` | | Session | `forceRedraw(stdout)` — full UI repaint, recovers terminal drift. | none (pure Ink) → keep as-is |
| `/history` | | Session | Renders the TUI's **own** in-memory transcript (user+assistant) in a pager. `[N]` = char preview length. Note: deliberately does NOT call the worker `/history` (which only sees pre-process persisted turns). | none → read Vanta transcript |
| `/save` | | Session | Saves transcript to JSON. | `session.save` → write to `~/.vanta/sessions/<id>` |
| `/title` | | Session | Bare shows current title; arg sets it. | `session.title` → session store |
| `/status` | | Session | Live session info pager. | `session.status` |
| `/usage` | | Info | Token/cost/context table; updates UI usage state. | `session.usage` |
| `/undo` | | Session | `session.undo` then trims last exchange from visible transcript; prints `undid N messages`. **NB:** the *gateway* `/undo` returns `prefill` (composer-fill); the TUI's local handler overrides that with the undo-and-trim behavior. | `session.undo` → kernel/session truncate |
| `/retry` | | Session | `session.undo` (strip last exchange) **then re-send the last user message**. Not a plain resend. | `session.undo` + resend |
| `/branch` | `fork` | Session | Branches the session, then **closes the previous live session and switches to the branch** (you do NOT stay beside the original). Prints `branched → <title>`. | `session.branch` + `session.close` → clone session row in `~/.vanta/sessions`, switch active |
| `/compress` | | Session | Compresses transcript context; optional `focus topic`. Rewrites visible history from returned messages, updates usage. | `session.compress` → kernel summarizer |
| `/background` | `bg`, `btw` | Session | Launches a prompt as a background task; tracks `task_id`. | `prompt.background` → kernel async run |
| `/queue` | `q` | Session | Bare = count queued; arg = enqueue message for next turn (no interrupt). | local composer queue |
| `/steer` | | Session | Injects a message after the next tool call without interrupting; falls back to queue if agent idle. | `session.steer` |
| `/stop` | | Session | Kills running background processes; prints count. | `process.stop` → kernel |
| `/copy` | | Info | Copies selection or Nth/last assistant message to clipboard (native → OSC52 fallback). | none (clipboard libs) |
| `/paste` | | Info | Attaches clipboard image. | `image.attach` (clipboard path) |
| `/image` | | Info | Attaches a local image file for next prompt. | `image.attach` |
| `/model` | | Config | (interactive — §2) | |
| `/personality` | | Config | Sets session personality; may reset history. | `config.set key=personality` |
| `/reasoning` | | Config | Show/set reasoning effort (none…xhigh, show/hide); live-updates agent + thinking section. | `config.set key=reasoning` |
| `/fast` | | Config | Toggle fast/priority mode (normal/fast/status). | `config.set key=fast` |
| `/verbose` | | Config | Cycle tool-output verbosity. | `config.set key=verbose` |
| `/yolo` | | Config | Toggle per-session approval-skip. | `config.set key=yolo` → kernel approval gate |
| `/voice` | | Config | on/off/tts/status; renders configured record key. | `voice.toggle` |
| `/skin` | | Config | Show/change theme skin (fires `skin.changed`). | `config.set key=skin` |
| `/indicator` | | Config | Busy-indicator style (kaomoji/emoji/unicode/ascii); hot-swaps live. | `config.set key=indicator` |
| `/details` | `detail` | TUI | Global or per-section (thinking/tools/subagents/activity) detail visibility: hidden/collapsed/expanded/cycle/reset. | `config.set details_mode[.section]` |
| `/compact` | | TUI | Toggle compact transcript. | `config.set key=compact` |
| `/statusbar` | `sb` | Config | Status bar position on/off/top/bottom. | `config.set key=statusbar` |
| `/mouse` | `scroll` | TUI | Mouse tracking preset on/off/wheel/buttons/all. | `config.set key=mouse` |
| `/busy` | | Config | What Enter does while working: queue/steer/interrupt/status. | `config.set key=busy` |
| `/fortune` | | TUI | Local random/daily fortune. | none (local) |
| `/terminal-setup` | | TUI | Writes IDE terminal keybindings (vscode/cursor/windsurf/auto). | none (local file write) |
| `/logs` | | Session | Tail gateway log buffer in pager. | `gw.getLogTail` → Vanta log file |
| `/reload` | | Tools | Re-read `~/.hermes/.env` into running gateway. | `reload.env` → Vanta env reload |
| `/reload-mcp` | `reload_mcp` | Tools | Reload MCP servers (confirm gate; `now`/`always` skip; warns prompt-cache invalidation). | `reload.mcp` |
| `/reload-skills` | `reload_skills` | Tools | Re-scan installed skills + refresh command catalog. | `skills.reload` + `commands.catalog` |
| `/tools` | | Tools | `list` (worker) / `enable`/`disable <name…>` (built-in toolset or `mcp:tool`); change resets client history. | `tools.configure` → Vanta tool registry |
| `/browser` | | Tools | connect/disconnect/status CDP browser connection. | `browser.manage` |
| `/rollback` | | Session | list / `diff <hash>` / restore filesystem checkpoints. | `rollback.list/diff/restore` |
| `/replay` | | Session | Replay a completed spawn tree (`N`/`last`/`list`/`load <path>`) — opens AgentsOverlay at an index. | `spawn_tree.list/load` |
| `/replay-diff` | | Session | Diff two completed spawn trees by index — opens AgentsOverlay diff mode. | in-memory spawn history |
| `/help` | | Info | Renders catalog categories + TUI extras + hotkeys panel. | `commands.catalog` (cached) |
| `/quit` | `exit` | Exit | `session.die()` — exits TUI. | local |
| `/update` | | Info | Exits TUI with code 42 → Python wrapper execs `hermes update`. | local (Vanta: own updater) |
| `/heapdump` | | Debug | V8 heap snapshot + diagnostics. | none (local Node) |
| `/mem` | | Debug | Live heap/rss numbers panel. | none (local Node) |

---

## 4. Server-resolved / gateway-only commands (full registry tail)

These are in Python `COMMAND_REGISTRY` but have **no local TS handler** — they fall through to `slash.exec`/`command.dispatch`. Several are messaging-platform only.

| Command | Aliases | Cat | Flag | DOES | Vanta port |
|---|---|---|---|---|---|
| `/goal` | | Session | | Set/pause/resume/clear/status a standing goal worked across turns. Returns `exec`/`send`. | **Maps directly to Vanta kernel goals.** High value. |
| `/subgoal` | | Session | | Add/remove/clear criteria on the active goal. | Vanta kernel goals. |
| `/commands` | | Info | gateway_only | Paginated browse of all commands+skills. | N/A (TUI uses `/help`) |
| `/snapshot` | `snap` | Session | cli_only | Create/restore/prune config+state snapshots. | Vanta `~/.vanta` state snapshot |
| `/curator` | | Tools | | Background skill maintenance (status/run/pin/archive…). | Optional — Vanta skill maintenance |
| `/cron` | | Tools | cli_only | Manage scheduled tasks (list/add/edit/pause/run/remove). | Vanta scheduler (future) |
| `/kanban` | | Tools | | Multi-profile collaboration board. | N/A early — multi-agent feature |
| `/bundles` | | Tools | | List skill bundles (alias `/<name>` = multiple skills). | Vanta skill bundles (optional) |
| `/toolsets` | | Tools | cli_only | List available toolsets. | Vanta tool registry list |
| `/config` | | Config | cli_only | Show current configuration. | Read Vanta config |
| `/footer` | | Config | | Toggle gateway runtime-metadata footer. | optional |
| `/codex-runtime` | `codex_runtime` | Config | | Toggle codex app-server runtime for OpenAI models. | provider-specific; skip unless Vanta supports |
| `/gquota` | | Info | cli_only | Google Gemini quota usage. | provider-specific |
| `/insights` | | Info | | Usage insights/analytics over N days. | optional |
| `/profile` | | Info | | Show active profile + home dir. | Vanta profile/home |
| `/whoami` | | Info | | Show slash-command access level (admin/user). | N/A (single-user) |
| `/plugins` | | Tools | cli_only | List installed plugins. | N/A unless Vanta has plugins |
| `/debug` | | Info | | Upload debug report (system info + logs), get links. | optional local diag |
| `/handoff` | | Session | cli_only | **Transfers the CLI session to a messaging platform's home channel** (`cli.py:_handle_handoff_command`): validates platform + home channel, refuses mid-turn, writes `handoff_state='pending'` to `state.db`, block-polls ≤60s for `completed`/`failed`, on success prints a `/resume` hint and exits the CLI. | **Vanta N/A** — depends on gateway messaging platforms Vanta doesn't have. |
| `/start` | | Session | gateway_only | Acknowledge platform start pings. | **Vanta N/A** |
| `/topic` | | Session | gateway_only | Telegram DM topic sessions. | **Vanta N/A** |
| `/approve` `/deny` | | Session | gateway_only | Approve/deny a pending dangerous command (messaging). | Vanta handles approvals via kernel/overlay, not these |
| `/sethome` | `set-home` | Session | gateway_only | Mark this chat as the home channel. | **Vanta N/A** |
| `/restart` | | Session | gateway_only | Gracefully restart the gateway. | **Vanta N/A** |
| `/platforms` | `gateway` | Info | cli_only | Gateway/messaging platform status. | **Vanta N/A** |
| `/platform` | | Info | gateway_only | Pause/resume/list a failing platform. | **Vanta N/A** |

---

## 5. Vanta port — priority guide

**Tier 1 (core loop, port first):** `/new`+`/clear`, `/sessions`+`/resume`, `/model` picker, `/undo`, `/retry`, `/branch`, `/compress`, `/save`, `/title`, `/status`, `/usage`, `/help`, `/quit`, `/history`.

**Tier 2 (config/quality of life):** `/reasoning`, `/yolo`, `/details`, `/compact`, `/verbose`, `/tools`, `/skills`, `/stop`, `/queue`, `/steer`, `/background`, `/copy`, `/image`.

**Tier 3 (Vanta-distinctive, kernel-backed):** `/goal`, `/subgoal`, `/agents`, `/rollback`, `/snapshot` — these map onto Vanta's goal/approval kernel and `~/.vanta` state and are where Vanta can differentiate.

**Skip (gateway/messaging only):** `/handoff`, `/start`, `/topic`, `/approve`, `/deny`, `/sethome`, `/restart`, `/platforms`, `/platform`, `/commands`, `/kanban`.

**Key implementation note:** in Vanta there is no `slash.exec`/`command.dispatch` round-trip. Build ONE in-process command table (Hermes's TS `SLASH_COMMANDS` shape — `{name, aliases, help, run(arg, ctx)}`). Each `run` calls Vanta's sessions store / provider / tool registry / kernel directly. Preserve the `send` vs `prefill` vs `skill` distinction in `ctx` (enqueue-turn / fill-composer / inject-skill-prompt).
