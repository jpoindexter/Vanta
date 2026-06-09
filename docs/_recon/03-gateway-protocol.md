# Hermes Gateway Protocol

The wire contract between Hermes's TS Ink TUI (client) and its Python backend (server).

- **TS client:** `ui-tui/src/gatewayClient.ts` (`GatewayClient`), types in `ui-tui/src/gatewayTypes.ts`.
- **Python server:** `tui_gateway/server.py` (~7900 lines, `dispatch()` + `@method` registry), entrypoints `tui_gateway/entry.py` (stdio) and `tui_gateway/ws.py` (websocket), transport abstraction `tui_gateway/transport.py`.

This is **JSON-RPC 2.0** over a line-delimited byte stream. Requests carry `{id, jsonrpc:"2.0", method, params}`; responses carry `{id, result}` or `{id, error:{code,message}}`. Server-pushed events are JSON-RPC *notifications* `{jsonrpc:"2.0", method:"event", params:{type, payload, session_id}}` — no `id`, so the client routes them to the event bus instead of the pending-request map.

---

## 1. Transport

Two modes, selected at runtime by env var. Default is **spawn**.

### Spawn mode (default) — stdio JSON-RPC
- `GatewayClient.start()` → `startSpawnedGateway(root)`:
  - Resolves a Python interpreter (`HERMES_PYTHON`/`PYTHON`/`$VIRTUAL_ENV`/`.venv` probe, else `python3`).
  - `spawn(python, ['-m', 'tui_gateway.entry'], { cwd, env, stdio: ['pipe','pipe','pipe'] })`.
  - Sets `PYTHONPATH` to include the source root (entry.py re-asserts `HERMES_PYTHON_SRC_ROOT` at the front of `sys.path` to avoid CWD shadowing).
- **stdin** = requests (one JSON object per line, `\n`-terminated). `entry.py` loops `for raw in sys.stdin`.
- **stdout** = responses + events (one JSON object per line). Server reserves real stdout for JSON-RPC only and redirects Python `sys.stdout → sys.stderr` so stray library `print()` can't corrupt the protocol.
- **stderr** = freeform log lines; client wraps each in a `gateway.stderr` event and keeps a 200-line ring buffer for `/logs`.
- First thing the server writes after boot is the `gateway.ready` event (carries the skin). Client arms a 15s `STARTUP_TIMEOUT_MS` timer; if `ready` doesn't arrive it emits `gateway.start_timeout` with a stderr tail.

### Attach mode — WebSocket JSON-RPC
- Enabled when `HERMES_TUI_GATEWAY_URL` is set. `startAttachedGateway(url)` opens a `WebSocket`; same JSON-RPC frames, sent via `ws.send(JSON.stringify(...))`. Server side is `tui_gateway/ws.py` driving the same `dispatch()`.
- Frames may arrive as string or binary; client decodes via a hoisted `TextDecoder`.
- The env var is re-read on every `request()`; if it rotates, the client tears down and restarts the transport (so switching spawn→attach also kills the old Python child).

### Sidecar mirror (optional)
- `HERMES_TUI_SIDECAR_URL` → client opens a second, **outbound-only** WebSocket and mirrors every `event` frame to it (feeds a dashboard sidebar). Server side installs a `TeeTransport` (`entry.py::_install_sidecar_publisher`) so dispatcher emits hit stdio AND the back-WS. Best-effort; failures are swallowed.

### Request plumbing (client)
- Each request gets id `r{n}`, a `REQUEST_TIMEOUT_MS` (120s) timer, and an entry in a `pending` Map; `dispatch(frame)` resolves/rejects by `id`. Events are buffered in a 2000-entry ring until the app calls `drain()` (subscribes), then flushed in order. Transport exit rejects all pending and emits `exit`.

### Server dispatch model
- `dispatch(req, transport)` binds the transport on a `contextvar`, then: short handlers run **inline** and return a response dict; methods in `_LONG_HANDLERS` (`cli.exec`, `slash.exec`, `session.resume`, `session.branch`, `session.compress`, `skills.manage`, `browser.manage`, `shell.exec`) are submitted to a 4-worker `ThreadPoolExecutor` and write their own response when done (returns `None` inline). Handlers register via `@method("name")` into a `_methods` dict.

---

## 2. Message catalog

`session_id` is a param on nearly every session-scoped call; omitted below for brevity. Response shapes are the `gatewayTypes.ts` interfaces.

| Request | Purpose | Response shape | When the TUI sends it |
|---|---|---|---|
| `session.create` | Open a new agent session | `SessionCreateResponse` (`session_id`, `info`) | App boot / `/new` |
| `session.list` | List persisted sessions | `SessionListResponse` | `/resume` browser open |
| `session.most_recent` | Find newest session | `SessionMostRecentResponse` | Auto-resume on boot |
| `session.resume` *(long)* | Reload a saved session's transcript | `SessionResumeResponse` (`messages[]`) | `/resume` pick |
| `session.active_list` | Live in-process sessions | `SessionActiveListResponse` | Session switcher |
| `session.activate` | Switch to a live session, get inflight turn | `SessionActivateResponse` | Tab switch |
| `session.delete` | Delete a session | `SessionDeleteResponse` | `/resume` delete |
| `session.title` | Get/poll generated title | `SessionTitleResponse` | Title display |
| `session.usage` | Token/cost/context snapshot | `SessionUsageResponse` | Footer / `/cost` |
| `session.status` | Status line text | `SessionStatusResponse` | `/status` |
| `session.history` | Raw transcript | (messages) | History view |
| `session.undo` | Truncate last turn(s) | `SessionUndoResponse` | `/undo` |
| `session.compress` *(long)* | Compress context | `SessionCompressResponse` | `/compact` |
| `session.save` | Write session to file | `SessionSaveResponse` | `/save` |
| `session.close` | Close a live session | `SessionCloseResponse` | Tab close |
| `session.branch` *(long)* | Fork a session | `SessionBranchResponse` | `/branch` |
| `session.cwd.set` | Set session working dir | (info) | `/cwd` |
| `session.interrupt` | Cancel running turn + pending prompts | `SessionInterruptResponse` | Esc / Ctrl-C |
| `session.steer` | Queue mid-turn steer message | `SessionSteerResponse` (`queued`/`rejected`) | `/steer` while running |
| `prompt.submit` | **Submit a user turn (streams via events)** | `{status:"streaming"}` (see §3) | Enter in composer |
| `prompt.background` | Run a prompt as background task | `BackgroundStartResponse` (`task_id`) | `/bg` |
| `clarify.respond` | Answer a `clarify.request` | `ClarifyRespondResponse` | User answers clarify |
| `approval.respond` | Answer an `approval.request` | `ApprovalRespondResponse` | User approves tool |
| `sudo.respond` | Provide sudo password | `SudoRespondResponse` | User enters sudo |
| `secret.respond` | Provide a secret/env var | `SecretRespondResponse` | User enters secret |
| `commands.catalog` | Slash command metadata (categorized) | `CommandsCatalogResponse` | Boot (prime autocomplete) |
| `command.resolve` | Canonicalize a slash name | `{canonical,description,category}` | Alias resolution |
| `command.dispatch` | **Round-trip a slash command** | `CommandDispatchResponse` (§5) | Slash command entered |
| `complete.slash` | Slash autocomplete items | `CompletionResponse` | Typing `/...` |
| `complete.path` | Path autocomplete items | `CompletionResponse` | Typing a path |
| `slash.exec` *(long)* | Execute a slash command, capture output | `SlashExecResponse` (`output`) | Slash fall-through |
| `cli.exec` *(long)* | Run `hermes_cli.main` argv headless | (`output`) | `/hermes ...` |
| `config.get` / `config.set` | Read/write config keys | `ConfigGetValueResponse` / `ConfigSetResponse` | `/config`, settings |
| `config.show` | Full config dump | `ConfigFullResponse` | Settings view |
| `setup.status` / `setup.runtime_check` | Provider configured? runtime ok? | `SetupStatusResponse` | Boot gate |
| `model.options` | Provider/model picker data | `ModelOptionsResponse` | `/model` |
| `model.save_key` / `model.disconnect` | Manage provider keys | (value/status) | `/model` actions |
| `tools.list` / `tools.show` / `tools.configure` | Tool inventory + toggle | `ToolsConfigureResponse` | `/tools` |
| `toolsets.list` | Toolset inventory | (list) | `/tools` |
| `reload.mcp` / `reload.env` | Hot-reload MCP/env | `ReloadMcpResponse` / `ReloadEnvResponse` | `/reload-mcp` |
| `process.stop` | Kill background processes | `ProcessStopResponse` | `/kill` |
| `shell.exec` *(long)* | Run a shell command | `ShellExecResponse` (`code,stdout,stderr`) | `!cmd` |
| `clipboard.paste` | Resolve clipboard payload | `ClipboardPasteResponse` | Paste |
| `paste.collapse` | Collapse large paste | (collapse info) | Large paste |
| `image.attach` / `image.detach` | Attach/remove image to next turn | `ImageAttachResponse` | Image paste/drop |
| `input.detect_drop` | Classify a dropped path | `InputDetectDropResponse` | Terminal drop |
| `terminal.resize` | Report terminal cols/rows | `TerminalResizeResponse` | Resize |
| `voice.toggle` / `voice.record` / `voice.tts` | Voice control | `VoiceToggleResponse` / `VoiceRecordResponse` | Voice key |
| `delegation.status` / `delegation.pause` | Subagent fleet status / pause | `DelegationStatusResponse` / `DelegationPauseResponse` | `/agents` |
| `subagent.interrupt` | Kill one subagent | `SubagentInterruptResponse` | `/agents` action |
| `spawn_tree.save` / `spawn_tree.list` / `spawn_tree.load` | Persist/browse spawn trees | `SpawnTreeList*` / `SpawnTreeLoadResponse` | `/agents` history |
| `rollback.list` / `rollback.diff` / `rollback.restore` | Git checkpoint rollback | `RollbackListResponse` / `RollbackDiffResponse` / `RollbackRestoreResponse` | `/rollback` |
| `browser.manage` *(long)* | Browser tool connect/control | `BrowserManageResponse` | `/browser` |
| `skills.manage` *(long)* / `skills.reload` | Skill management | (status) | `/skills` |
| `agents.list` / `plugins.list` / `cron.manage` | Misc inventory/control | (lists/status) | Respective slash cmds |
| `insights.get` | Usage insights | (insights) | `/insights` |
| `preview.restart` | Restart preview server | (status) | `/preview` |

> **Typing caveat:** `prompt.submit` returns `{status:"streaming"}` on the wire, but the TS type `PromptSubmitResponse` declares `{ok?}`. The TUI ignores the response body and drives entirely off events — treat the declared response type as loose for this method.

---

## 3. Streaming event flow

A single user turn. `prompt.submit` returns *immediately* (`{status:"streaming"}`) and the real work flows back as `event` notifications. The agent loop's callbacks (`_agent_cbs`, wired into `agent.run_conversation`) are the bridge: Python callback → `_emit(type, sid, payload)` → JSON-RPC notification → client event bus → `createGatewayEventHandler.ts` → Ink render.

```
TUI                          GATEWAY (tui_gateway/server.py)         AGENT LOOP
 |                                |                                      |
 |-- prompt.submit ------------->|                                      |
 |                                |  mark session.running               |
 |                                |  _start_inflight_turn               |
 |<-- result {status:streaming} -|  (returns at once)                   |
 |                                |  thread: _wait_agent → _run_prompt_submit
 |                                |                                      |
 |<== event message.start ========|  _emit("message.start")             |
 |                                |  agent.run_conversation(stream_cb) ->|
 |                                |                                      |- reasoning
 |<== event reasoning.delta ======|  reasoning_callback                 |  (chain-of-thought)
 |<== event thinking.delta =======|  thinking_callback                  |
 |<== event tool.generating ======|  tool_gen_callback (name)           |- decides tool
 |<== event tool.start ===========|  tool_start_callback {tool_id,name,args_text}
 |<== event tool.progress ========|  tool_progress_callback (preview)   |- runs tool
 |     (clarify/approval/sudo/secret.request may interleave — see §HITL)|
 |<== event tool.complete ========|  tool_complete_callback {tool_id,result_text,inline_diff,duration_s,error}
 |<== event message.delta ========|  stream_callback(delta) {text,rendered}  |- assistant text
 |<== event message.delta ========|  ... (repeats per token chunk)      |
 |     (subagent.* events if the turn delegates — see §subagents)       |
 |<== event message.complete =====|  _emit final {text,rendered,usage,status,reasoning}
 |                                |  session.running = false            |
```

Key event payloads (`GatewayEvent` union in `gatewayTypes.ts`):
- **`message.start`** — turn begins (clears composer, shows spinner).
- **`message.delta`** `{text, rendered?}` — incremental assistant text. `rendered` is server-side markdown for the pager; `text` is raw.
- **`message.complete`** `{text, rendered?, usage?, reasoning?, warning?}` — authoritative final message + token/cost usage. `status` distinguishes `complete` / `interrupted` / `error`.
- **`tool.generating`** `{name}` — model is emitting tool args (pre-call hint).
- **`tool.start`** `{tool_id, name, args_text, context?, todos?}` — tool invocation begins.
- **`tool.progress`** `{name, preview}` — streaming tool output.
- **`tool.complete`** `{tool_id, name, result_text?, inline_diff?, summary?, duration_s?, error?, todos?}` — tool result, keyed back to `tool_id`.
- **`thinking.delta`** / **`reasoning.delta`** `{text, verbose?}` — model reasoning stream (reasoning gated on session verbose flag).
- **`status.update`** `{kind, text}` — activity-feed status lines (e.g. `kind:"process"` background notifications).
- **`error`** `{message}` — turn-level failure.

**Subagent events** (when a turn delegates): `subagent.spawn_requested` / `subagent.start` / `subagent.thinking` / `subagent.tool` / `subagent.progress` / `subagent.complete`, all carrying `SubagentEventPayload` (goal, depth, tokens, cost, tool counts, output_tail). Drive the `/agents` spawn-tree dashboard.

**HITL prompts** (mid-turn, blocking the agent thread via `_block()`): `clarify.request` `{question, choices, request_id}`, `approval.request` `{command, description}`, `sudo.request` `{request_id}`, `secret.request` `{env_var, prompt, request_id}`. The agent thread parks on a `threading.Event` until the matching `*.respond` RPC arrives (300s default timeout). `session.interrupt` releases only that session's pending prompts.

---

## 4. Completion flow (slash autocomplete)

1. User types `/` → TUI debounces and sends `complete.slash {text}`.
2. Server handler (`@method("complete.slash")`):
   - Guards `text.startswith("/")` (else empty items).
   - Builds a `SlashCommandCompleter` (from `hermes_cli.commands`) seeded with skill commands + skill bundles.
   - Runs `completer.get_completions(Document(text))`, capped at 30. Each item → `{text, display, meta}` (FormattedText flattened to plain strings — sending the raw tuple list breaks Ink column layout).
   - Appends TUI-only extras (`/compact`, `/details`, `/logs`, `/mouse`) if they prefix-match.
   - Special-cases `/details ...` subcommand completion.
3. Returns `CompletionResponse {items, replace_from}`. **`replace_from`** is the cursor index where the completion text should be spliced in: `text.rfind(" ")+1` when there's a space (completing an argument), else `1` for the top-level command (after the `/`).
4. `complete.path` is the analogous handler for filesystem paths (handles `~`, drive-letter→`/mnt/` normalization, `replace_from` at last space).

---

## 5. Command dispatch flow

Three RPCs cooperate; the round-trip is `commands.catalog` (once at boot) → `command.dispatch` (per command) → optional `slash.exec` fall-through.

### `commands.catalog` (prime the menu)
Returns `CommandsCatalogResponse`:
- `pairs: [name, description][]` — all visible commands (hides `_TUI_HIDDEN` and `gateway_only`).
- `categories: {name, pairs}[]` — grouped for the menu.
- `canon: {alias→canonical}` — alias resolution map.
- `sub: {cmd→subcommands[]}` — second-level completion.
- Merges in `quick_commands` (user-defined, "User commands" bucket) and skill commands (`skill_count`).
- `warning` surfaces discovery failures non-fatally.

### `command.dispatch` (execute one command)
`params {name, arg, session_id}` → resolves alias via `command.resolve`, then returns a **discriminated union** `CommandDispatchResponse` telling the TUI *how to act locally*:

| `type` | Meaning | TUI action |
|---|---|---|
| `exec` | Command ran server-side | Render `output` as a system line |
| `plugin` | Plugin handler ran | Render `output` |
| `alias` | Resolved to another command | Re-dispatch `target` |
| `skill` | Skill invocation built | Submit `message` as a prompt turn (named `name`) |
| `send` | Queue a prompt | Submit `message` (optional `notice` shown first) — used by `/queue`, `/retry`, `/steer` fallback, `/goal` |
| `prefill` | Edit-then-send | Put `message` into the composer (e.g. `/undo`) |

Quick-commands (`type:exec`/`alias`), plugins, and skills are handled here directly. `_pending_input` commands (`/queue`, `/retry`, `/steer`, `/goal`, `/undo`) — which in classic CLI push onto an input queue with no TUI-side reader — are intercepted and returned as structured `send`/`prefill`/`exec` payloads.

### `slash.exec` (fall-through)
For ordinary registry commands that just produce text output, the TUI calls `slash.exec {command}` (a *long* handler, runs in the pool via a `_SlashWorker` subprocess). Returns `SlashExecResponse {output, warning?}` which the TUI renders in the pager. The handler explicitly *rejects* skill / pending-input / snapshot-restore commands with a hint to use `command.dispatch` instead, keeping the two paths from colliding.

---

## Vanta-port note

Vanta is **in-process**: the TUI calls `createConversation()` directly with `onTextDelta` / `onToolCall` / `onToolResult` callbacks. There is no Python child, no JSON-RPC, no wire. Every protocol message falls into one of three buckets.

### Bucket 1 — Skip entirely (gateway-only overhead)
None of this is real functionality; it exists only because Hermes splits TUI from backend across a process boundary.
- **All transport machinery:** spawn/attach/sidecar, `gateway.ready`, `gateway.stderr`, `gateway.protocol_error`, `gateway.start_timeout`, the JSON-RPC `id` + pending-map + timeout plumbing, `terminal.resize`. Vanta's function-call boundary replaces all of it.
- **Session-as-remote-resource surface:** `session.create/list/resume/activate/delete/title/save/close/branch/most_recent/active_list/history/cwd.set`. Vanta has one in-process conversation; multi-session lifecycle over a wire is pure framing. (If Vanta ever wants persistence/resume, that's a *local DB* feature, not a protocol one.)
- **Config/model/tool plumbing as RPCs:** `config.get/set/show`, `setup.status/runtime_check`, `model.options/save_key/disconnect`, `tools.list/show/configure`, `toolsets.list`, `reload.mcp/env`, `plugins.list`, `agents.list`, `cron.manage`. Vanta reads/writes these in-process — no request/response.
- **Attachment/clipboard RPCs:** `clipboard.paste`, `paste.collapse`, `image.attach/detach`, `input.detect_drop` — Vanta can compute attachment metadata locally if needed; no round-trip.

### Bucket 2 — Already have in-process (the named callbacks)
These map 1:1 to Vanta's existing `createConversation` callbacks. Direct equivalents, no work:
- `message.delta` → **`onTextDelta`**
- `tool.start` → **`onToolCall`**
- `tool.complete` → **`onToolResult`**
- `message.complete` → turn-end callback (return value of the conversation turn)
- `thinking.delta` / `reasoning.delta` / `status.update` / `tool.generating` / `tool.progress` → additional optional callbacks Vanta can add to the same signature if it wants the richer activity feed. (Cheap — same in-process channel.)

### Bucket 3 — Genuine functionality Vanta lacks (build only if wanted)
This is the real payload — features Hermes has that Vanta would need to build *as in-process logic*, regardless of transport:
- **HITL blocking prompts:** clarify / approval / sudo / secret. These are agent-loop callbacks that *block waiting for user input*. Vanta needs an in-process equivalent: a callback that returns a Promise the UI resolves (no `request_id`/`_block` Event dance — just `await`).
- **Turn control:** `interrupt` (cancel an in-flight run — needs an `AbortController` through the agent loop) and `steer` (queue a mid-turn message).
- **Slash completion + command system:** `complete.slash`/`complete.path`, `commands.catalog`, `command.dispatch`'s `exec/alias/skill/send/prefill/plugin` dispatch, `slash.exec`. Real UX surface; Vanta would implement it as a local command registry + completer.
- **Subagent / delegation:** `subagent.*` events, `delegation.status/pause`, `subagent.interrupt`, `spawn_tree.*`. Only relevant if Vanta's agent delegates.
- **Accounting & context management:** `session.usage` (token/cost/context tracking), `session.compress` (auto-compaction). Genuine logic, not plumbing.
- **Rollback:** `rollback.list/diff/restore` (git checkpointing of agent file edits).
- **Background tasks:** `prompt.background` + the completion-queue poller that chains a follow-up turn.
- **Voice:** `voice.toggle/record/tts`.
- **Shell / CLI passthrough:** `shell.exec`, `cli.exec`, `browser.manage`, `skills.manage` — feature surfaces, in-process for Vanta.

**Bottom line:** roughly half the protocol (Buckets 1 + 2) is either wire overhead Vanta deletes or callbacks Vanta already has. Bucket 3 is the genuine feature backlog — and none of it requires a gateway; it's in-process logic Hermes happened to expose over RPC.
