# Hermes Desktop -> Vanta Desktop feature matrix (2026-10-13)

Read-only review. Nothing changed except this file.

Path keys:
- `H:` = `<repo>/desktop-next/apps/desktop/src` (NOTICE.md says the copy is Hermes 6e7b83a2f1, the same commit as ~/.hermes, so I did not diff them).
- `R:` = Vanta renderer, `.../Vanta-desktop-agent-rebuild-20261013/vanta-ts/desktop-app/src`.
- `S:` = Vanta server, `.../vanta-ts/src/desktop`.
- `E:` = Vanta Electron, `.../vanta-ts/desktop-app/electron`.

## 0. Findings that drive everything

1. **Transport mismatch (largest risk).**
   - Hermes chat runs over WebSocket JSON-RPC (`HermesGateway`, `/api/ws`). The contract is `apps/shared/src/gateway-contract.openrpc.json`: 259 RPC methods, about 60 event types, plus server-to-client requests (`approval`, `clarify`, `vault.*`, `preview.act`, `terminal.read`, ...).
   - REST is a second channel: about 110 `/api/*` paths. It goes through the bridge call `window.hermesDesktop.api(req)` (main-process proxy, 51 call sites), not a direct `fetch`.
   - Vanta is HTTP with a single SSE stream. `POST /api/chat`, `GET /api/events` (SSE), and about 45 GET/POST routes (S: `server.ts` lines 50-131). `desktopBoundaryDecision` (`server.ts:181`) returns 405 for any method other than GET or POST on `/api/*` when a boundary token is set. It requires header `x-vanta-desktop-boundary`, or `?boundary=` on the SSE URL.
   - Consequence: Hermes REST calls that use PUT/PATCH/DELETE (about 40 of the paths) must be remapped to POST or the server must relax the rule. The `hermesDesktop.api` proxy in Electron main is the natural place to inject the token and remap.
2. **Vanta SSE is lossy for a Hermes-grade transcript.**
   - `DesktopEvent` is `{label, ok?, kind?: tool_start|tool_end|note|summary, name?, detail?, delta?, turnStarted?}` (S: `handler-state.ts`, `term/event-format.ts`).
   - There are no tool-call ids, args or results, no reasoning, and no `message.complete` payload. Approvals are not pushed on SSE: the renderer polls `GET /api/approval` (R: `state.ts:78`).
   - The Hermes transcript expects `message.start/delta/complete`, `tool.start/generating/complete` (with ids), `thinking.delta`, `status.update`, `session.info`.
   - Fix: add typed SSE events to S behind the same boundary and keep the label events for the old renderer. This is a server change.
3. **Vanta server is single-active-session.**
   - `DesktopState.sessionId` is a singleton. `/api/chat` returns 409 "a turn is already running".
   - Hermes assumes concurrent runtime sessions (tiles, background sessions, `session.active_list`).
   - Slice 1 must be one live session at a time. Tiles and multi-window need per-session server state first.
4. **Vanta trust model vs Hermes raw power.** Hermes ships `fs.writeTextFile`, `trashPath`, `renamePath`, a node-pty `terminal`, a `git` worktree add/remove bridge, the preview `webview` plus agent-driven `preview.act`, and `/api/fs/write-text`. Under STRATEGY these are effects and must pass the kernel and approval gate. Ship read-only variants first.
5. **Strategy conflict to check.** STRATEGY says avoid forced streaming and auto-scroll, and preserve reading position. Hermes has `scroll-to-bottom-button.tsx`, `store/thread-scroll.ts` and `lib/chat-messages` streaming. I did not inspect whether it force-follows. Verify in slice 1.
6. **Hermes main-process weight is mostly irrelevant.** About 400 files in `electron/`: Python backend bootstrap, pool, SSH, cloud OAuth, WSL, Hyprland, MSIX, updater. Vanta's `E:main.mjs` is 281 lines and spawns Vanta's own server. Do not port Hermes main. Keep Vanta main and implement a bridge facade (section 3).
7. **WorkItem lifecycle.** STRATEGY: `draft, queued, running, waiting, needs human, stopped, failed, unverified, verified`. I found no `/api/workitems` in `S:`. The nearest are `/api/runs`, `/api/workflow-runs`, `/api/continuity`, `/api/chat/queue` (`QueuedTurn.status = queued|starting|failed`). The dashboard needs a projection, which is a gap. I did not query roadmap.json for the card.
8. `dev:mock` (`node ../../tests-js/scripts/mock-server.ts`) is a Hermes-repo script. `tools/launch-mock.mjs` exists in desktop-next. I did not read either. They may help build a Vanta mock.

## 1. Feature matrix

Verdicts: ADOPT-NOW, ADOPT-LATER, ADAPT, SKIP. "Vanta eq." says exists / partial / missing. Endpoints: Hermes `rpc:` = gateway RPC, `rest:` = REST. "Vanta route" is the equivalent or `none`.

### A. Chat and agent loop

| Hermes feature | Where (H:) | What it does | Vanta eq. today | Backend (Hermes -> Vanta route) | Verdict / reason |
|---|---|---|---|---|---|
| Transcript + streaming render | `app/chat/session-view.tsx`, `components/assistant-ui/thread/*`, `lib/chat-messages/*` | Markdown, streamed deltas, tool rows, interim sealing, windowed list | partial: R `chat-thread.tsx`, `message-bubble.tsx`, `message-markdown.tsx` | rpc `prompt.submit`, `session.history`, events `message.*`, `tool.*` -> `POST /api/chat`, SSE `/api/events`, `POST /api/sessions/open` (returns messages) | ADOPT-NOW: far richer; needs typed SSE events |
| Tool rows / activity | `components/assistant-ui/tool/*`, `store/tool-activity.ts`, `tool-view.ts` | Per-tool cards, args/result, generating state | partial: SSE labels only (R `chat-run-feedback.tsx`) | events `tool.start/generating/complete` -> label events (no ids/args) | ADAPT: map labels or add ids server-side |
| Composer (rich editor, @path, /slash, paste collapse, history, drafts) | `app/chat/composer/*` (~40 files) | Input, completions, pills, undo history | partial: R `composer.tsx`, `use-conversation-draft.ts`, `session-drafts.ts` | rpc `complete.path`, `complete.slash`, `commands.catalog`, `paste.collapse` -> `GET /api/files`, `POST /api/sessions/draft`; slash catalog: none | ADAPT: static slash catalog, @path via /api/files |
| Attachments / drag-drop / image | `composer/attachments.tsx`, `hooks/use-file-drop-zone.ts`, `lib/attachment-upload-policy.ts` | Images, files, PDFs, drops | exists: R `use-composer-attachments.ts`, `desktop-attachments.ts`; preload `resolveDroppedFiles`/`pickAttachments` | rpc `image.attach(_bytes)`, `file.attach`, `pdf.attach` -> `POST /api/chat {images[], files[]}` | ADAPT: attach is request-body in Vanta, not RPC |
| Message queue | `composer/queue-panel.tsx`, `store/composer-queue.ts` | Queue while agent busy | exists: R `chat-first-queue.tsx`, `queued-turns.tsx`; S `turn-queue.ts` (persisted, `next`/`steer`) | client-side + rpc `session.steer/redirect` -> `GET/POST /api/chat/queue` | ADAPT: server queue is authoritative |
| Steer / redirect / btw / background prompt | rpc only; `use-prompt-actions` | Mid-turn correction, side questions | partial: queue `intent:"steer"` | rpc `session.steer`, `session.redirect`, `prompt.btw`, `prompt.background` -> `POST /api/chat/queue` | ADAPT: steer only; btw/background later |
| Stop / interrupt | `use-prompt-actions` | Stop turn | exists: S `handleStopChat` | rpc `session.interrupt` -> `POST /api/chat/stop` | ADOPT-NOW: direct map |
| Approval card | `store/prompts.ts`, `components/prompt-overlays.tsx` | Command approval; once/session/always/deny | exists: R `approval-decision-controls.tsx`, `approval-summary.ts`; S `approval.ts` (allow/always/deny/never, `fresh`, `canRemember`, one pending) | server-request `approval`, rpc `approval.pending/respond` -> `GET/POST /api/approval` (polled) | ADAPT: keep Vanta semantics; add SSE push |
| Access / approval mode menu | `shell/approval-mode-menu.tsx`, `store/approval-mode.ts` | Pick permission mode | exists: R `access-mode-picker.tsx`, `full-access-warning.tsx` | rest config -> `GET/POST /api/access-mode` (ask/approve/plan/auto/full) | ADAPT: Vanta's 5 modes |
| Clarify tool prompts | `components/assistant-ui/clarify`, `store/clarify.ts` | Agent asks 1-5 questions | missing | server-request `clarify` -> none | ADOPT-LATER: maps to WorkItem "needs human" |
| Sudo / secret / vault prompts | `store/prompts.ts` (Sudo/Secret/Vault) | Password/secret prompts | missing (credentials brokered) | `vault.*`, `display.install.sudo` -> none | SKIP: conflicts with brokered-credential rule |
| Model picker + menu | `app/model-picker-overlay.tsx`, `components/model-picker.tsx`, `shell/model-*.tsx` | Provider/model choice, favorites, visibility | exists: R `model-picker.tsx`, `model-picker-catalog.tsx` | rpc `model.options`; rest `/api/model/options`, `/api/model/set` -> `GET /api/models`, `/api/models/{provider}`, `POST /api/model` | ADAPT: data adapter |
| Reasoning effort / speed | `composer/reasoning-pill.tsx`, `shell/reasoning-menu-panel.tsx` | Effort control | partial: S `modelSettings` (`effortLevel`, speed) | rpc `config.set` -> `POST /api/model-settings` | ADAPT |
| Thinking / reasoning display | `store/reasoning-disclosure.ts`, events `thinking.delta`, `reasoning.*` | Collapsible reasoning | missing (no event) | events -> none | ADOPT-LATER: needs server event; keep collapsed |
| Context usage / compaction | `shell/context-usage-panel.tsx`, `store/compaction.ts` | Token/ctx breakdown, /compress | missing (R `runtime-strip.tsx` partial, not inspected) | rpc `session.usage`, `session.compress`, `session.context_breakdown` -> none | ADOPT-LATER |
| Rewind / branch / undo | `use-prompt-actions` (`restoreToMessage`), rpc `session.branch*`, `session.undo` | Restore checkpoint, fork | missing | rpc -> none | ADOPT-LATER: recovery fits trust model |
| Todos | `store/todos.ts`, event `todo.updated` | Agent todo list | missing | event -> none | ADOPT-LATER: project onto WorkItem |
| Slash commands | `lib/desktop-slash-commands.ts`, `desktop-slash-registry.json` | /commands | partial: R `composer.tsx:159` `/` opens palette | rpc `slash.exec`, `command.dispatch` -> none | ADAPT: Vanta command list |

### B. Sessions, projects, layout

| Hermes feature | Where | What | Vanta eq. | Backend | Verdict / reason |
|---|---|---|---|---|---|
| Session sidebar (list, search, pin, archive, rename, delete, bulk, unread) | `app/chat/sidebar/*` (~40 files), `store/sidebar-*.ts` | Session navigation | exists: R `session-sidebar.tsx`, `session-pinning.ts`, `chat-first-session-manager.tsx` | rest `/api/sessions`, `/api/sessions/search`, `PATCH/DELETE /api/sessions/{id}`; rpc `session.list/delete/archive` -> `GET /api/sessions`, `POST /api/sessions/{new,open,rename,archive,delete,bulk,pin,reorder-pins}`; search: none | ADOPT-NOW: UI wins; search missing |
| Fleet / gateway-group / profile / connection switchers | `chat/sidebar/{fleet-*,gateway-group*,profile-*,connection-*,local-device-switch}` | Multi-backend/profile nav | missing (not needed) | many | SKIP: one operator, one backend |
| Projects (folders, worktrees, PR tags) | `chat/sidebar/projects`, `store/projects.ts`, rpc `projects.*` | Project grouping | partial: R `chat-first-projects.ts`, `chat-first-project-dialog.tsx`; E `project-switch.mjs`, `project-root.mjs` | rpc `projects.*` -> preload `pickProjectFolder`/`switchProjectForNewTask` (no HTTP route) | ADAPT: one project owns cwd; no worktrees |
| Session tiles / split / tabs / multi-window | `chat/session-tile.tsx`, `route-tile.tsx`, `components/pane-shell/tree/*` | Concurrent sessions in panes | missing (S singleton) | rpc `session.active_list`, `session.activate` -> none | ADOPT-LATER: needs per-session server state |
| Session titles | `session-draft-title.tsx`, rpc `session.title` | Auto/manual titles | exists: R `chat-live-title.ts`, `POST /api/sessions/rename` | -> `/api/sessions/rename` | ADAPT |
| Pane shell (zones, presets, edit mode, tab hints) | `components/pane-shell/*` (34 files) | Dockable workbench | partial: R `chat-first-layout.tsx` (inspector toggle, 5 context tabs) | local | ADOPT-NOW: needed for workbench panes |
| Session import (Claude/Codex) | `app/session-import/*` | Import foreign sessions | missing | rpc `session.foreign.*` -> none | SKIP: not core |

### C. Shell and chrome

| Hermes feature | Where | What | Vanta eq. | Backend | Verdict / reason |
|---|---|---|---|---|---|
| App shell: titlebar, statusbar, sidebar toggles, notices | `app/shell/*`, `app/index.tsx` | Chrome | exists: R `chat-first-shell.tsx`, `chat-titlebar.tsx` | local + `/api/status` | ADOPT-NOW: base for Codex-style redesign |
| Command palette | `app/command-palette/*` | Cmd-K | exists: R `chat-first-command-palette.tsx` | rest `/api/config`, `/api/profiles/sessions` | ADAPT: merge Vanta actions |
| Keybinds + settings UI | `lib/keybinds/*`, `store/keybinds.ts`, `settings/keybind-settings.tsx` | Data-driven rebindable shortcuts | partial: R `global-shortcuts.ts` (7 actions) | local | ADOPT-NOW: seed Vanta's 7 as defaults |
| Themes / appearance | `themes/*`, `settings/appearance-*` | Skins, accent, chat font | partial: R `desktop-theme.ts` (54 lines) | rest backend-sync | ADAPT: Vanta tokens only; drop marketplace |
| i18n | `i18n/*` (ar, de, fr, ... catalogs) | Localised strings | missing in R | local | ADOPT-NOW: keep infra; ship `en`, prune locales |
| Onboarding / setup | `components/onboarding*`, `store/onboarding*` | Provider key, first chat | partial: R provider-auth-recovery; S `POST /api/setup` | rpc `onboarding.*`; rest `/api/model/options`, `PUT /api/env` -> `/api/setup`, `/api/models/{p}` | ADAPT |
| Boot failure / connecting overlays | `components/boot-failure-*`, `gateway-connecting-overlay.tsx` | Startup errors | partial: R `connection-recovery.ts` | bridge boot* | ADAPT: Vanta server-start errors |
| In-app + native notifications | `store/notifications.ts`, `native-notifications.ts`; bridge `notify` | Toasts, OS notifications | missing (no `Notification` in E main) | none | ADOPT-LATER: needed for background WorkItems |
| Find in page | `components/find-bar.tsx`; bridge `findInPage` | Cmd-F | missing | none | ADOPT-LATER |
| Tray / minimize-to-tray | `settings/minimize-to-tray-setting.tsx` | Tray | exists: E `tray.mjs` | bridge | ADAPT |
| Quick entry (global hotkey window) | `app/quick-entry/*`; bridge `quickEntry` | Send to agent from anywhere | missing (no `globalShortcut` in E main) | none | ADOPT-LATER: matches "one operator everywhere"; route to `/api/chat/queue` |
| HUD overlay | `app/hud/*`, `electron/hud-*` (~25 files) | Floating transcript+composer | partial: E `avatar.*`, `vanta-avatar.mjs` | rpc | ADAPT: reuse avatar window, not Hermes HUD |
| Wake indicator | `app/wake-indicator/*`, rpc `wake.*` | Wake-word state | exists: S `wake-api.ts` (`GET/POST /api/wake`) | rpc `wake.status/start/stop` -> `/api/wake` | ADAPT |
| Pet overlay / pet generate / pet components | `app/pet-*`, `components/pet/*`, `store/pet*` | Mascot | missing | rpc `pet.*` (20) | SKIP: Hermes-specific |
| Window controls, zoom, translucency, haptics | bridge `windowControls`, `zoom`, `setTranslucency` | Window polish | partial: E main | bridge | ADOPT-NOW: windowControls+zoom only |
| Tips / tours / vibe-hearts / reactions | `components/tips`, `store/tours.ts`, `reactions*` | Coaching | missing | event `tip.show` | SKIP: Hermes-specific |

### D. Workbench (right rail)

| Hermes feature | Where | What | Vanta eq. | Backend | Verdict / reason |
|---|---|---|---|---|---|
| File tree | `app/right-sidebar/files/*`; bridge `readDir`, `watchDirectory` | Project tree, DnD | partial: S `GET /api/files` (flat, depth 3, 400 cap); R contextTab "files" | rpc `projects.tree`; rest `/api/profiles/projects/tree`, `/api/fs/*` -> `GET /api/files`, `/api/file-preview` | ADAPT: read-only tree via confined `readDir` |
| File preview / reader | `chat/right-rail/preview-file.tsx`, `preview-reader.ts` | Open file | exists: S `handleFilePreview`; R `chat-first-preview.tsx` | rest `/api/fs/read-data-url` -> `GET /api/file-preview?path=` | ADAPT |
| Review / diff / git | `app/right-sidebar/review/*`; bridge `git.*`; rest `/api/git/*` | Changed files, diff, ship bar, PRs | partial: R contextTab "review" (reviewCount) | bridge `git.repoStatus/fileDiff` -> none (git not in S) | ADAPT: read-only first; no worktree add/remove |
| Terminal | `app/right-sidebar/terminal/*` (18); bridge `terminal.*` (node-pty); event `agent.terminal.output` | Interactive pty + agent terminal tabs | partial: S `POST /api/terminal` (single command through `runDesktopTerminal`, gated) | bridge pty -> `/api/terminal` | ADAPT: agent-output tab first; pty only through gate |
| Preview browser pane (webview, console, annotate, agent drive) | `chat/right-rail/preview-*` (30); bridge `watchPreviewFile`, `capturePreview` | Dev-server preview + annotate | missing | server-requests `preview.act/read` | ADOPT-LATER: high risk |
| Code / JSON editor, file write | `components/chat/code-editor.tsx`, `json-document-editor.tsx`; bridge `writeTextFile` | Edit files | missing (writes must be gated) | rest `/api/fs/write-text` -> none | ADOPT-LATER: only via effect gate |
| Artifacts page | `app/artifacts/*` | List agent outputs | partial: R `canvas.tsx`, `chat-first-documents.tsx` | rest sessions/messages -> `GET /api/artifacts`, `/api/canvas` | ADAPT |
| Agents / subagent tree | `app/agents/index.tsx`, `store/subagents.ts`, events `subagent.*` | Live delegation tree | partial: R `run-library.tsx`, `workflow-runs.tsx`, `task-dossier.tsx` | events -> `GET/POST /api/runs`, `/api/workflow-runs` | ADAPT: core of agent dashboard |

### E. Dashboard, automation, capabilities, settings

| Hermes feature | Where | What | Vanta eq. | Backend | Verdict / reason |
|---|---|---|---|---|---|
| Command center (status, logs, sessions admin, doctor, backup, update) | `app/command-center/*` | Ops dashboard | partial: R `operator-views.tsx`, `continuity-view.tsx` | rest `/api/status`, `/api/logs`, `/api/ops/*`, `/api/curator` -> `GET /api/status`, `/api/release-proofs`, `/api/runs`, `/api/continuity`; logs/ops: none | ADAPT: keep layout, swap panels |
| Usage analytics | cmd-center, `/api/analytics/usage`, rpc `insights.get` | Tokens/cost by day/model | missing | -> none | ADOPT-LATER |
| Cron / schedules | `app/cron/*` | CRUD, pause/resume/trigger, blueprints | partial: S `GET /api/schedules` (read-only `loadCron`) | rest `/api/cron/jobs*` (CRUD + `/pause`, `/resume`, `/trigger`, `/runs`), `/api/cron/blueprints` -> read only | ADAPT: add write routes in S |
| Messaging platforms | `app/messaging/*` | Telegram etc. setup, allowlist | partial: S `GET/POST /api/messaging`, `/api/setup/messaging/telegram` | rest `/api/messaging/platforms*`, `/api/messaging/telegram/onboarding/*` -> same | ADAPT |
| Pairing | rest `/api/pairing*` | Approve users | partial: S `/api/companion/*` | -> companion routes | ADAPT-later |
| Webhooks | `app/webhooks/*` | Webhook routes | missing | rest `/api/webhooks*` -> none | ADOPT-LATER |
| MCP servers | `app/capabilities/mcp/*` | Add/test/logs/catalog | exists: R `mcp-connectors-view.tsx`; S `/api/connect/mcp` | rest `/api/mcp/*` -> `/api/connect/mcp` | ADAPT |
| Connectors | `app/capabilities/connectors/*` (45) | Integration directory | exists: R `integration-catalog-view.tsx`; S `/api/connect/integrations`, `/api/connect/google`, `/api/connect/test` | rpc `connectors.*` -> same | ADAPT: trim hosted/Nous parts |
| Skills | `app/capabilities/skills/*`; rest `/api/skills*` | List/toggle/hub install | partial: S `GET /api/capabilities` (skill kind via `operator-data.ts`) | -> read only | ADAPT: read-only; skip hub |
| Toolsets | `app/capabilities/toolsets/*` | Enable/configure tools | partial: S `GET /api/tools` | rest `/api/tools/toolsets*` -> `GET /api/tools` | ADAPT: read-only |
| Settings container + schema forms | `app/settings/*` (99) | Config UI over `/api/config/schema` | partial: R `settings-dialog.tsx`, `quiet-settings` | rest `/api/config*`, `/api/env` -> none | ADAPT: keep container, write Vanta panes |
| Providers / keys / custom endpoints / OAuth | `settings/providers-settings.tsx`, `keys-settings.tsx`, `custom-endpoints-settings.tsx` | Credentials | partial: S `provider-auth-store.ts`, `/api/models/{p}` | rest `/api/providers/*`, `/api/env` -> `/api/setup`, `/api/models/{p}` | ADAPT: never display secrets |
| Local models | `settings/local-models-*`, `/api/local-models/*` | Download/run local models | exists: R `model-downloads.tsx`; S `/api/runtime/downloads`, `/api/runtime/profiles` | -> same | ADAPT |
| Voice (dictation, TTS, live, stop word) | `lib/voice-*.ts`, `store/voice-*.ts`, `settings/voice-provider-fields.tsx` | Voice I/O | partial: R `voice-session.ts`, `voice-dictation.ts`, `voice-button.tsx`; S `GET /api/voice`, `POST /api/voice/transcribe` | rest `/api/audio/*` -> two Vanta routes | ADAPT: dictation first |
| Memory settings | `settings/memory/*`, `/api/memory*` | Memory providers | partial: S `/api/continuity` | -> continuity | ADAPT-later |
| Profiles (agent homes, soul) | `app/profiles/*` | Multi-agent homes | not equivalent (R `runtime-profiles.tsx` is model runtimes) | rest `/api/profiles*` | SKIP: one operator |
| Learning / starmap | `app/learning`, `app/starmap` (16), `/api/learning/*` | Memory graph viz | missing | rest -> none | SKIP: Hermes-specific |
| Updates | `updates-overlay.tsx`, `electron/updater/*`, `update-feed.cjs` | Auto-update | not inspected (Vanta release path) | bridge `updates.*` | ADAPT-later: stub no-op in slice 1 |
| Connections / SSH / cloud / pool / billing / free-tier | `settings/connections-registry.tsx`, `settings/billing/*`, `components/remote-setup`, `free-tier` | Remote backends, Nous account | missing | rpc `billing.*`, `free_tier.*` | SKIP: Nous-specific |
| Plugin runtime / kanban / radio / bots | `contrib/*`, `plugins/*`, `sdk/*`, `app/contrib` | Extension host | missing | rest `/api/plugins/*` | SKIP: platform-thinking |
| Share diagnostics | `send-diagnostics-dialog.tsx`, `/api/ops/debug-share` | Upload debug bundle | missing | -> none | SKIP: destination not inspected |

### F. Vanta-only features the base lacks (do not lose)

Look capture (`R:look-capture-button.tsx`, `S:look-capture-api.ts`, `POST /api/look`), Companion (`R:companion*.ts*`, `/api/companion/*`), Canvas (`R:canvas.tsx`), Task dossier, Continuity view, Workflow-run ledger, Full-access warning, Runtime strip, Sound/completion settings, Project-switch handoff (`E:project-switch.mjs`), Surface mode (`E:desktop-surface.mjs`), Release proofs (`/api/release-proofs`), Public API (`src/public-api`, not inspected). These need ports into the new shell.

## 2. Slice order (max 6)

**Slice 1: Chat on Vanta (adapter + shell).**
- Outcome: launch new renderer; choose or create a session; send; streamed text and tool rows; stop; approval card with Vanta's four decisions; queue next/steer; model, effort and access mode; attachments; project picker; one live session.
- Keep from Hermes: `app/shell/*`, `app/chat/{session-view,composer,sidebar (minus fleet/profile/connection)}`, `components/assistant-ui/{thread,tool}`, `components/pane-shell/*`, `components/ui/*`, `lib/chat-messages/*`, `lib/chat-runtime.ts`, `store/{session*,composer*,prompts,notifications}`, `lib/keybinds/*`, `i18n` (en), `themes` (tokens).
- New code: `src/api/vanta-gateway.ts` implementing the `JsonRpcGatewayClient` surface (`request`, `onEvent`, `onRequest`, `onState`, `connect`) with a dispatch table for about 18 methods: `session.create/resume/list/history/close/delete/archive/interrupt/title`, `prompt.submit`, `approval.pending/respond`, `config.get/set`, `model.options`, `commands.catalog`, `complete.path`, `image.attach`, `file.attach`. The other 240 methods return a typed `unsupported` error.
- Endpoints that must exist: `GET /api/status`, `GET /api/sessions`, `POST /api/sessions/{new,open,rename,archive,delete,bulk,pin}`, `POST /api/chat`, `GET /api/events`, `POST /api/chat/stop`, `GET/POST /api/chat/queue`, `GET/POST /api/approval`, `GET /api/models`, `POST /api/model`, `POST /api/model-settings`, `GET/POST /api/access-mode`, `GET/POST /api/setup`, `GET /api/files`. All of these exist today.
- Server work: add typed SSE events (`tool.start{id,name,args}`, `tool.complete{id,ok,summary}`, `approval.request`, `turn.complete{reply}`); add a `sessionId` field to `/api/chat`.
- Risk: HIGH.
  - Lossy events: Vanta SSE has labels only today.
  - Singleton server state.
  - A 405 on PUT/PATCH/DELETE.
  - The `hermesDesktop` bridge must be complete enough not to throw (section 3).
  - I did not read the `/api/chat` response body or the `/api/sessions` list shape.

**Slice 2: Workbench panes (read-only).**
- Outcome: right rail with Files, Review (changed files and diff), Activity (agent terminal and run events), Canvas and Artifacts, file preview.
- Keep: `app/right-sidebar/{files,review}`, `terminal/agent-terminal-stream.ts`, `components/chat/{diff-lines,shiki-*,terminal-output}`, `chat/right-rail/preview-file.tsx`.
- Endpoints: `GET /api/files`, `/api/file-preview`, `/api/file-context`, `/api/artifacts`, `/api/canvas`, `/api/runs`. Bridge: `readDir`, `gitRoot`, `git.repoStatus`, `git.fileDiff`, `revealPath`, `openDir`, all root-confined and read-only.
- Server work: file tree depth and paging (today flat, capped at 400).
- Risk: medium. Bridge confinement and symlink escapes. No write or editor.

**Slice 3: Agent dashboard (WorkItem and runs).**
- Outcome: one screen of everything the operator is doing: WorkItems by the nine states, runs, workflow runs, queue, wake state, continuity, release proofs. Open a run into its session.
- Keep: `app/agents` and `store/subagents.ts` (tree shell), `app/command-center` (layout), `components/chat/status-*`, `overlays/*`.
- Endpoints: `/api/runs`, `/api/workflow-runs`, `/api/continuity`, `/api/chat/queue`, `/api/wake`, `/api/status`, `/api/release-proofs`.
- Server work: a WorkItem projection endpoint (none found), plus an SSE `workitem.changed` event.
- Risk: medium-high. The product contract is unclear until the endpoint exists.

**Slice 4: Capabilities, messaging, settings, onboarding.**
- Outcome: MCP and connectors, tools and skills (read-only), Telegram setup, model and provider auth, local models, voice dictation, setup flow.
- Keep: `settings` container and subpage nav, `capabilities/{mcp,connectors}` UI, `messaging/*`, `onboarding*`.
- Endpoints: `/api/connect/{mcp,integrations,google,test}`, `/api/tools`, `/api/capabilities`, `/api/messaging`, `/api/setup/messaging/telegram`, `/api/runtime*`, `/api/models/{p}`, `/api/voice*`.
- Server work: none if panes are rewritten against Vanta routes. A config-schema endpoint would only be needed to keep Hermes' generic forms; do not add it.
- Risk: medium. The settings tree is 99 files; budget for rewriting panes rather than adapting them.

**Slice 5: Schedules and monitoring.**
- Outcome: create, pause, resume, run now and delete scheduled jobs; blueprints; run history; Webhooks and pairing if time allows.
- Keep: `app/cron/*`, `cron-actions.ts`, `blueprints.tsx`.
- Endpoints needed (Vanta has `GET /api/schedules` only): `POST /api/schedules/{create,update,pause,resume,trigger,delete}` over `src/schedule/cron.ts`; `GET /api/schedules/{id}/runs`.
- Risk: low-medium. Server writes need the effect gate and receipts.

**Slice 6: Native extras and concurrency.**
- Outcome: native notifications, find-in-page, quick entry, session tiles and multi-window, gated interactive terminal, preview browser, rewind/branch, usage analytics, thinking display.
- Prerequisites: per-session server state (removes the singleton); an approvals queue instead of one pending approval.
- Risk: high. Each item has its own trust-model review.

## 3. Bridge methods (`window.hermesDesktop.*`)

**Size of the problem.**
- Hermes preload (`electron/preload.ts`, 715 lines) exposes about 190 top-level members, with sub-objects: `git` (10), `terminal` (9), `quickEntry` (10), `hud` (15), `petOverlay` (10), `connections` (11), `updates` (6), `themes` (2), `settings` (3), `profile` (6), `cloud` (5), and others.
- Preload makes synchronous IPC calls at load: `hermes:translucency:support`, `hermes:hud:windowing`, `hermes:feature-flags`, `hermes:skin:local` (lines 14-24). Main must answer them or preload must drop them.
- The renderer references about 150 distinct members (rg count). The boot-critical subset is **not inspected**. Derive it by loading the renderer against a stub that logs every missing member.

**Vanta preload (`E:preload.cjs`, 28 lines).** Exposes `window.vantaDesktop` with 12 members: `boundaryToken`, `readClipboard`, `resolveDroppedFiles`, `pickAttachments`, `pickProjectFolder`, `switchProjectForNewTask`, `readPendingProjectTask`, `acknowledgePendingProjectTask`, `readSurfaceMode`, `setSurfaceMode`, `reportSurfacePhase`, `onSurfaceMode`. Main registers 13 `vanta:*` IPC handlers, including 3 for avatar.

**Overlap.**

| Vanta member | Hermes counterpart |
|---|---|
| `readClipboard` | `readClipboard` |
| `resolveDroppedFiles` | `getPathForFile` |
| `pickAttachments` | `selectPaths` |
| `pickProjectFolder` | `settings.pickDefaultProjectDir` / `selectPaths(dir)` |
| `boundaryToken` | injected by main inside `api()` (renderer never sees the token) |

No Hermes counterpart for `switchProjectForNewTask`, the pending-project-task pair, or the surface-mode trio. Keep them under `vantaDesktop` and expose both namespaces.

**Slice 1 (must exist and work).**
- `api(request)`: proxy to the Vanta server. Inject `x-vanta-desktop-boundary`. Remap PUT/PATCH/DELETE to POST. Return `{ok,status,data}` in the shape the renderer unwraps (`unwrapExpectedNotFound`). Also provide a stream/SSE URL with `?boundary=`.
- `getConnection` / `getConnectionFor`: return one local connection `{baseUrl, token, wsUrl, mode:'local', source:'local', logs:[], isFullscreen, nativeOverlayWidth}`.
- `getGatewayWsUrl` / `getGatewayWsUrlFor`: unused if `VantaGateway` replaces the WS client; return a sentinel.
- `getBootProgress`, `onBootProgress`, `getBootstrapState`, `onBootstrapEvent`: report ready. `onBackendExit`.
- `openExternal`, `readClipboard`, `writeClipboard`, `selectPaths`, `getPathForFile`, `readFileDataUrl`, `readFileDataUrlForAttach`, `dataUrlReadMax`, `saveClipboardImage`, `savePastedText`.
- Window: `windowControls`, `onWindowStateChanged`, `setTitleBarTheme`, `setNativeTheme`, `zoom`, `getVersion`, `getMachineProfile`.
- Diagnostics: `logLine`, `reportRendererError`, `revealLogs`, `getRecentLogs`.
- `settings.*` (default project dir), `profile.*` and `connections.*` as single-entry stubs, `setActiveWork`, `sanitizeWorkspaceCwd`, `revealPath`, `openDir`, `onPowerResume`, `requestMicrophoneAccess` (E has `microphone-permissions.mjs` but no bridge).
- Pane-driven reads for slice 2: `readDir`, `gitRoot`, `git.repoStatus`, `git.fileDiff`.

**Stub rule.** Every other member must still exist as a function that rejects with `{code:'unsupported'}`. `contextBridge` cannot expose a Proxy, so list them explicitly or the renderer throws on `undefined()`.

**Later.**
- Native: `notify`, `onNotificationAction/Activate`, `findInPage` family, `quickEntry`, `minimizeToTray`, `wakeIndicator`, `openWindow`, `openSessionWindow`, `windowRelay`, `contextMenu*`, `saveImageFromUrl`, `saveGatewayFile`.
- Panes: `watchPreviewFile`, `watchDirectory`, `terminal.*` (gated), `git.review/branch*` (read-only), `writeTextFile`/`renamePath`/`trashPath` (only through the effect gate).
- `updates.*`, `themes.*`, `hud`/`hudModifier` (adapt to avatar).

**Skip.** `petOverlay`, `cloud`, `oauth*ConnectionConfig`, `connections.*` beyond one local entry, SSH (`sshConfigHosts`, `sshResolveHost`), `getPoolLimits`/`setPoolLimits`/`touchBackend`/`recycleBackend`/`repairBootstrap`/`resetBootstrap`/`cancelBootstrap`/`uninstall`, `freeTierChallenge`, `mcpOauth`, `installDesktopPlugin`/`removeDesktopPlugin`/`probePluginRepo`/`reconcileDesktopPlugins`, `claimAmbientCue`, `chatOnboarding`, `desktopMetrics`, `screenshot` (Vanta has its own look capture).

## 4. Not inspected / uncertain

- Hermes internals of `assistant-ui/thread`, `pane-shell`, and `thread-scroll` (auto-follow behaviour vs STRATEGY).
- Hermes `electron/main` and `entry.ts` (only file names and preload read). Hermes test/e2e suites. Locale count (ar, de, fr seen).
- `/api/chat` response body, `/api/sessions` list shape, Vanta `settings-dialog.tsx` contents, Vanta updater and release pipeline, Vanta `src/public-api`.
- `roadmap.json` (not queried; no `/api/workitems` found by grep of `S:` only).
- The `plugins/*` and `contrib` extension host (judged SKIP from structure only).
- Whether any Hermes REST path I attributed to a feature is also used elsewhere (mapping derived by script from `src/api/*.ts` name matches).
- License: keep `LICENSE-HERMES-MIT` and `NOTICE.md` with the copied code.
