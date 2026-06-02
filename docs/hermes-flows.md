# Hermes → Argo: Full Flow Map & Port Plan

Source-of-truth map of every Hermes interactive flow, what it does, and how it
ports to Argo's **in-process** architecture. Built from a 6-track recon of
`~/Documents/GitHub/_active/hermes-reference`. Detailed per-area docs live in
`docs/_hermes-recon/` (01 slash · 02 tui-components · 03 gateway · 04 banner ·
05 setup · 06 sessions).

---

## 0. The one architectural fact that governs everything

Hermes' TUI is a **thin client over a gateway**: the Ink/React UI (`ui-tui`)
talks JSON-RPC to a Python backend (`python -m tui_gateway.entry`) over stdio.
~70 RPC methods. **About half of that protocol is pure wire overhead** —
transport, multi-session multiplexing, config-as-RPC — that exists *only*
because the UI and the agent are separate processes.

Argo is **in-process**: the TUI imports `createConversation(...)` and the agent
loop runs in the same Node process, already emitting `onTextDelta` /
`onToolCall` / `onToolResult` callbacks. So:

| Hermes protocol bucket | Argo equivalent |
|---|---|
| `message.delta`, `tool.start`, `tool.complete`, `message.complete` | **Already have** — the streaming callbacks |
| Transport, `gateway.ready`, multi-session mux, config-as-RPC | **Skip** — overhead of the split |
| Slash system, interactive pickers, HITL prompts, interrupt/steer/bg, usage display, rollback, subagent tree | **The real backlog** — none of it needs a gateway |

**Conclusion: do not build a gateway.** Port the *flows* (overlays, pickers,
slash semantics, banner, status bar) onto Argo's existing in-process TUI. That
is the whole job.

---

## 1. Slash commands — the big gap

Hermes has ~75 backend commands; the TUI exposes an interactive subset. Argo's
current `/commands` are **read-only displays** — that's the core complaint.
`/model` should *change* the model, not print it.

Dispatch model (Hermes): local TS handler → canon alias → `slash.exec` →
`command.dispatch` returns a tagged union `exec | alias | skill | send |
prefill | plugin`. **Argo collapses this into one in-process table.**

### Interactive overlays (the ones that "do things")
| Command | What it does | UI |
|---|---|---|
| **`/model`** | 2-step picker: provider → model (+ inline API-key entry, disconnect). Type-to-filter, persist global/session. Switches the live provider. | Floating overlay wizard |
| **`/sessions`** (`/resume`, `switch`) | Lists live + history sessions; Enter activates/resumes; two-press `d` deletes; `+new` row. | Floating overlay |
| **`/skills`** | SkillsHub: browse → inspect → install. | Floating overlay |
| **`/agents`** (`tasks`, `/replay`) | Subagent spawn-tree dashboard; kill/pause/replay/diff. | Full-pane (replaces transcript) |
| **`/setup`** | Suspends Ink, shells to `hermes setup` CLI, re-checks, restarts. | Process suspend |
| **`/clear`, `/new`** | Danger-confirm overlay, then rotate to a fresh session id (old transcript kept on disk). | Confirm prompt |

### Session-lifecycle commands (semantics in 06)
- `reset` = alias of `new`; `fork` = alias of `branch`. Not distinct.
- `/branch` (`/fork`): copies session, sets `parent_session_id`, closes prior live one, switches in.
- `/undo`: soft-deletes last turn's rows (`active=0`), **prefills** the composer with your last message.
- `/retry`: truncates in-memory + auto-resends (DB rows stay active). ≠ undo.
- `/title`: sets session title. `/save`: JSON export to `sessions/saved/`. `/history`: pager of transcript.
- `/handoff`: **not** a continuation prompt — transfers session to a messaging platform, then exits. (Skip for Argo.)

### Turn lifecycle (06)
input → `_pending_input` queue → background `process_loop` → agent loop → tools
→ response → incremental persist. `busy_input_mode` governs Enter mid-run:
`/queue` (run after current), `/steer` (inject after next tool call), `/bg`
(separate thread), **Ctrl+C** interrupt. Argo already has graceful Ctrl+C
abort (E4); steer/bg/queue are new.

### Argo-distinctive (kernel-backed, Hermes has no equivalent)
`/goal`, `/subgoal`, `/rollback`, `/snapshot` — map onto Argo's goal/approval
kernel and `~/.argo` state. **These are Argo's differentiator; keep them.**

### Skip for Argo (gateway/platform-only)
`/handoff`, `/start`, `/topic`, `/approve`, `/deny`, `/sethome`, `/restart`,
`/platforms`, `/platform`, `/commands`, `/kanban`.

---

## 2. The screen — banner, status bar, composer (02, 04)

### Startup banner (`hermes_cli/banner.py` → SessionPanel)
Responsive ASCII logo (tiers by terminal width) + a round-bordered session card:
- Hero art column + `model · org · cwd · Session: <id>`
- Collapsible sections (`▸/▾`): **Available Tools** (open), **Available Skills**
  (counts), **System Prompt** (char count), **MCP Servers** (`name [transport]:
  N tools / failed`).
- Footer: `<N> tools · <N> skills · <N> MCP · /help for commands` + optional
  `▲ N commits behind — run hermes update`.

Data sources for Argo: `registry.schemas()` (tools), `listSkills()` (skills),
MCP mount config (servers), `status.ts` already wires tools+skills. **Missing in
Argo:** toolset grouping + availability coloring, per-server MCP status detail,
skill categories, and the entire version / upstream-sha / commits-behind
subsystem.

### Status bar (`StatusRule`) — literal layout
```
─ thinking… │ Hermes-3-405B │ 24k/128k │ [████░░░░] 32% │ 0:42 │ 3 sessions │ $0.0184  ─  ~/proj  main
```
Pinned (never drop): `face/status │ model │ context`. Tail segments added if they
fit, descending priority: context-bar → duration → compressions → voice →
session-count → background → cost. Right: cwd/branch.

### Composer
- Custom multiline TextInput (NOT `ink-text-input`), `❯` prompt (turns blue on
  `!` shell passthrough).
- **Slash/path autocomplete dropdown** — 16-row window, `↑↓` cycle, `Tab` accept;
  rows show `display` + muted `meta`. (Argo already ships a basic version of this
  as of the last slice.)
- `↑/↓` history recall when buffer empty. Bracketed paste, large-paste collapse,
  dropped-path attach, `$EDITOR` launch. (Paste/editor = post-v0.)

### Transcript
`ScrollBox` (forked-Ink) virtualized, sticky-to-bottom. Rows: user `❯`,
assistant `┊` (markdown), tool `⚡` (bordered preview), system `·`. Streaming
markdown re-tokenizes the tail. **Stock Ink has no ScrollBox — this is Argo's
single biggest UI gap** (decision: build/borrow a scroll component vs run inline
and let the terminal scroll).

---

## 3. Setup / onboarding (05)

- `hermes setup` → `run_setup_wizard`; Quick (OAuth portal) vs Full (BYO-keys:
  model/terminal/gateway/tools). Writes `~/.hermes/config.yaml` + `.env`.
- In-TUI `/setup` just **shells out** to that CLI (no conversational/skill-driven
  setup — that was a wrong hypothesis; the `setup-phase-gating` skill does not
  exist in the snapshot).
- 34 providers in `providers.py`; selection via `select_provider_and_model`;
  model manifests in `model_catalog.py`.
- **Argo already has** `argo setup` (wizard → `.env` via `upsertEnv`),
  `isConfigured()`, TTY-gating, `providers/catalog.ts`. **Worth porting:** device-
  code/OAuth login + a richer per-provider model picker. The shell-out `/setup`
  pattern is a clean match for Argo.

---

## 4. Port plan — phased, ship-first

Each phase is independently shippable and verifiable in a real terminal.

**P1 — Make slash real (mostly done).** ✅ Full slash set wired into the TUI +
`/` palette (last slice). Remaining: make displays interactive where it matters.

**P2 — `/model` picker.** The headline complaint. In-process: read
`providers/catalog.ts` for the provider/model list, render the 2-step wizard
overlay (port `modelPicker.tsx` UI, swap RPC for local data), on select rebuild
the provider and hot-swap it into the live conversation. Persist to `.env`
(global) or session-only.

**P3 — Banner / session card.** Port SessionPanel: hero + `registry.schemas()` /
`listSkills()` / MCP status / counts, collapsible sections. Skip commits-behind
(no upstream yet).

**P4 — Status bar parity.** Port `StatusRule` layout: model · context (token
count from provider) · duration · cost. Pure layout, local data.

**P5 — Sessions overlay + lifecycle.** Port the session switcher overlay over
`sessions/store.ts`. Add `/title`, `/save`, `/retry` (no schema change),
`/branch`+`/fork` (add `parentId`), `/undo` (soft-delete decision).

**P6 — HITL prompts in TUI.** Port approval/confirm/clarify as PromptZone
components (Argo already has inline y/n; upgrade to the 4-option `Allow once /
session / always / deny`).

**P7 — Transcript scrolling.** The hard one. Decide: custom ScrollBox vs inline
terminal scrollback. Defer until P2–P6 land.

**Defer / skip:** agents overlay, mouse select, OSC52, voice, platforms,
`/handoff`, alternate-screen drag-select — all forked-Ink or gateway/platform
dependent.

**Keep (Argo-only):** `/goal`, `/subgoal`, `/rollback`, `/snapshot` — the kernel
flows that make Argo more than a Hermes clone.

---

## 5. HTML model

`docs/hermes-model.html` — clickable mockup of the Argo target TUI (banner,
slash palette, `/model` picker, streaming turn, status bar, sessions overlay,
approval prompt). Open in a browser; use the tabs to step through each flow.
This is the visual spec to align on **before** building P2+.
