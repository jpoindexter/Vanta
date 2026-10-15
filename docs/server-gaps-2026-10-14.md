# Server and bridge gaps behind inert controls, 2026-10-14

Branch `claude/desktop-server-gaps-20261014`. Every row below was exercised against the real app (Electron shell, real Vanta
server and kernel, sandboxed home, hidden window) with `desktop-next/tools/server-gaps-proof.mjs`, unless it says
"code-path".

## 1. Session folder and project lanes (F-048, F-049)

- `Session` gains an optional `cwd`: the folder the session was started in (`sessions/session-schema.ts`). New chats, forks
  and branches record or inherit it. A later save never moves it; a session saved before this had none adopts the folder of
  its next save.
- `GET /api/sessions` rows carry `cwd`; the gateway `session.list` carries it too.
- The sidebar draws lanes from `projects.tree` and `projects.project_sessions`, which the renderer asked the gateway for and
  Vanta did not answer. They are now mapped (`src/api/vanta/handlers-project-tree.ts`, `project-tree.ts`): a session belongs
  to the project whose folder is the longest prefix of its folder; a folder no project covers gets an automatic project; a
  session with no folder goes to Home.
- Sessions saved before this change have no folder, so they sit under Home until they are used again. Nothing is guessed.

## 2. Bots roster (F-070, F-071)

`profiles.list` is mapped from `GET /api/profiles` (`handlers-profiles.ts`). Rows carry name, display name, path, model,
provider and the sticky default. `ui_meta` is empty: Vanta profiles keep no bot title, colour or avatar, so the renderer keeps
those locally. `profiles.configure` and `profiles.set_asset` are still not served.

## 3. Config facade (Settings pages)

Server: `GET|POST /api/config`, `GET /api/config/schema`, `GET /api/config/defaults`, `GET /api/env`
(`vanta-ts/src/desktop/config-*.ts`, `desktop-prefs.ts`). Renderer: `PUT /api/config` becomes a flat `set`
(`shim-config.ts`); `/api/model/*` maps onto status, models and `POST /api/model` (`shim-model.ts`). Helpers that called the
bridge directly now go through the shim with `rawApi` (`client.ts`).

Served (each is applied, not stored and forgotten):

| Key | Page | Backed by | Applies |
|---|---|---|---|
| `agent.reasoning_effort` | Model | `/api/model-settings` effort, saved as `VANTA_EFFORT_LEVEL` | next turn; only the levels the model takes are options |
| `agent.service_tier` | Model | `/api/model-settings` speed, `VANTA_SERVICE_TIER` | next turn; only when the model has a fast mode |
| `approvals.mode` | Safety | access mode (`manual` = Ask each time, `smart` = Accept edits) | at once, with the audit event |
| `timezone` | Chat | `desktop-settings.json`, sets `TZ` on the server | at once and at every start; shell tools and dates follow it |
| `display.show_reasoning` | Chat | `desktop-settings.json` | the renderer reads it on load |
| `stt.enabled` | Voice | `desktop-settings.json` | the renderer reads it on load |
| `voice.max_recording_seconds` | Voice | `desktop-settings.json` | the renderer reads it on load |

Not served, so no dead control appears (reason in brackets):

- `display.personality` (Vanta has output styles but nothing reads one when a desktop chat builds its prompt; wiring it
  changes agent behaviour and is a separate decision).
- `model_context_length`, `fallback_providers`, `auxiliary.*`, `moa.*`, `agent.image_input_mode`,
  `agent.max_turns`, `agent.api_max_retries`, `agent.tool_use_enforcement` (no Vanta equivalent).
- `terminal.*`, `desktop.repo_scan_*`, `code_execution.mode`, `file_read_max_chars` (the working folder is the project the
  app was opened on, chosen in the shell, not in config).
- `approvals.timeout`, `approvals.mcp_reload_confirm`, `command_allowlist`, `security.*`, `checkpoints.*` (Vanta's rules live
  in the kernel and `.vanta/settings.local.json`, edited through the Permission chip and approval cards).
- `browser.*` (Vanta brokers logins; there is no real-profile mode).
- `memory.*`, `context.*`, `compression.*` (no matching switches).
- `tts.*`, `stt.provider` and the per-provider speech keys, `voice.voice_chat_mode`, `voice.auto_tts` (dictation is local
  and fixed; no TTS service is served).
- `toolsets`, `delegation.*`, `tool_output.*`, `updates.*` (toolsets are on Skills & tools; the rest has no equivalent).
- Provider keys: `GET /api/env` lists which keys are set (never a value). `PUT`, `DELETE` and reveal are refused with a
  pointer to the setup flow; keys stay on `/api/setup`.

Page by page (opened in the real app; "empty by design" shows the page's own "Nothing to configure" state):

| Page | Result |
|---|---|
| Model > Main model | works: provider, model, Apply (global default), Reasoning default |
| Model > Fallback models | empty by design |
| Model > Auxiliary models | partly: loads, but the page lists Hermes helper tasks Vanta does not have; Set/Change are refused with a reason. Renderer should hide it (PA/W2) |
| Model > Mixture of Agents | fails to load ("Could not load models"). Vanta has no MoA; renderer should hide it (PA/W2) |
| Chat > Behavior | works: Timezone, Reasoning Blocks |
| Chat > Attachments | works (device-local size cap) |
| Workspace (3 pages) | empty by design |
| Safety > Approvals | works: Approval Mode |
| Safety > Privacy, Checkpoints | empty by design |
| Browser (2 pages) | empty by design |
| Memory & Context (2 pages) | empty by design |
| Voice > Voice conversation, Speech to text | works: Max Recording Length, Speech To Text |
| Voice > Text to speech | empty by design |
| Advanced > Desktop & startup | works (device-local switches) |
| Advanced > Agent limits, Tool access, Terminal backend, Subagents, Output limits | empty by design |
| Providers > Accounts | loads the provider list; key entry writes are refused here (setup flow) |
| Tools & Keys > Tools | loads; "nothing configured in this category" (no tool keys are served) |
| Appearance, Notifications, Keyboard Shortcuts, Archive, Plugins, About | unchanged, already worked |

For PA/W2 (renderer, not touched here): the Approval Mode select still lists "Off" from a fixed list; choosing it is refused
with "approvals.mode must be one of manual, smart" in the autosave toast. Filter `ENUM_OPTIONS['approvals.mode']` to the
schema's options. The reasoning menu lists every Hermes level (Minimal ... Ultra) for a model that takes fewer; filter it by
the model's effort options.

## 4. Reasoning pill (F-122)

The pill did not fail silently in this build (the toast "Model option update failed" appears), but it offered levels the model
did not take and showed a pill for models with no levels. Fixed in the mapping layer:

- `model.options` and `GET /api/model/options` mark the current model `reasoning` and `fast` from the server catalog, so the
  pill is hidden when there are no levels (F-122a).
- `config.set reasoning` and `config.set fast` check the catalog first and answer with the levels the model takes
  ("\"ultra\" is not available for this model. Choose one of: low, medium, high, xhigh, max."), and the pill rolls back
  (F-122c). `config.set fast` was not served before.
- Renderer follow-up: filter the menu rows by the model's levels (file: `src/app/chat/composer/` menu content,
  `src/app/shell/model-catalog-menu.tsx`).

## 5. Images while a turn runs (F-115)

`POST /api/chat/queue` takes optional `images[]` under the chat rules (PNG, JPEG, TIFF; 4 images, 10 MB each, 20 MB total).
An image-only message queues "Describe the attached image.". Images live in `<home>/desktop-turn-queues/images/<id>.json`
(not in the queue document), are sent when the queued turn is claimed, and are removed when it completes or is cancelled. A
screen-capture receipt is not carried (a queued image may be sent after its freshness window). `GET /api/chat/queue` items
show `imageCount`.

## 6. Browser pane (F-105..F-108, F-192)

Enabled, with the guard in `electron/vanta/webview-guard.ts`:

- only the main window sets `webviewTag`; every attach passes `will-attach-webview`;
- preload and `preloadURL` stripped, `nodeIntegration` off (also in subframes and workers), `contextIsolation` and `sandbox`
  on, `webSecurity` on, `webviewTag` off for the guest;
- partition forced to `vanta-preview-guest` (no `persist:`: nothing is written to disk), whatever the renderer asks for;
- an attach for anything but `http(s)` or an empty guest is cancelled;
- the guest session denies every permission request, permission check and device request, cancels downloads, and cancels
  any request that is not http, https, ws, wss, data or blob (so `file:` and `ftp:` never load);
- guests cannot navigate or redirect to a non-web address; `window.open` is denied;
- a real click on a `target=_blank` link (or `window.open` right after one) opens in the system browser through the shell's
  external-link opener, at most once a second. A page cannot open links with no click. Electron refuses a webview popup
  before any handler runs and the guest has no preload, so a small script injected at `dom-ready` turns the click into a
  navigation to a private scheme that `will-navigate` cancels and relays.
- the guest never sees the bridge or the boundary token: it has no preload, and the probe page reports
  `hermesDesktop`, `vantaDesktop`, `require` and `process` all `undefined`.

Known edges: the address bar still accepts `file://` and `about:blank` (renderer rule). A typed `file://` address loads
nothing: the request is cancelled in the guest session. The injected relay script runs in the guest's own page, with no
privileges; a page can overwrite `window.open`/click handling, which only disables its own relay.
