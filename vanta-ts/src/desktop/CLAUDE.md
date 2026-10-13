# CLAUDE.md — desktop interface

Localhost host for the Vanta desktop experience. The browser renderer is the Vite app in `vanta-ts/desktop-app/`; this folder owns the server/API boundary.

## Run

```bash
cd vanta-ts
npm run vanta -- desktop        # opens http://127.0.0.1:7790
npm run vanta -- desktop 7791   # custom port
npm run vanta -- desktop --companion # token-paired LAN mobile surface
npm run desktop:build           # rebuilds the React app served at /
npm run desktop:native          # native Electron window + macOS tray presence
```

## Shape

- `server.ts` is the thin router only: `createDesktopServer`/`serveDesktop`, per-method `routeGet`/`routePost` dispatch. Handler bodies live in `handlers.ts`.
- `handlers.ts` owns every `/api/*` handler over a per-session `DesktopState` plus the `readJson`/`sendJson`/`eventLabel` helpers:
  - `GET /` + `GET /assets/*` built React command-center / Vite assets (via `assets.ts`)
  - `GET /api/events` live SSE event stream · `GET /api/status` kernel/model/tool/goal snapshot
  - `GET /api/sessions` + `POST /api/sessions/new`/`open` saved-session list / create / resume
  - `GET /api/tools` tool catalog · `GET /api/files` repo file list
  - `GET /api/models` + `POST /api/model` provider/model catalog + hot-swap (persists to `.env`)
  - `GET|POST /api/approval` pending-approval payload / allow|always|deny|never decision
  - `POST /api/terminal` kernel-gated `shell_cmd` run · `POST /api/chat` persistent in-process Vanta conversation
- `GET /companion` is the mobile status/chat/approval surface. Remote requests can reach only `/api/companion/{pair,status,chat,approval}` after one-time-code exchange for a hashed high-entropy bearer token; normal desktop APIs stay loopback-only.
- `session-state.ts` owns the per-session state map (parallel tabs don't clobber each other) + the SSE event channel; session id comes from `X-Session-Id` header or `?session=` query.
- `assets.ts` resolves built files safely under `desktop-app/dist` and falls back to `page.ts`.
- `approval.ts` adapts pending approvals into typed permission request payloads, resolves allow/always/deny/never decisions, and pushes `approval.request`.
- `typed-events.ts` is the Zod schema + redaction/cap builders for typed SSE events; `typed-emit.ts` mints tool ids and pushes typed frames.
- `page.ts` is only the small fallback page shown when the React app has not been built.
- `desktop-app/electron/main.mjs` owns the native window/server lifecycle. `tray.mjs` keeps Vanta present after the window closes and provides status, Quick Ask, approval access, and mobile pairing.

## Event contract (SSE, `GET /api/events`)

One stream per client id (`x-session-id` header or `?session=`). Each SSE `data:` line is one JSON `DesktopEvent`. Two parallel vocabularies share the stream; the renderer track codes against **`typed`**, the legacy renderer keeps reading `label`/`delta`/`turnStarted`.

```ts
// handler-state.ts
type DesktopEvent = EventLabel & {            // EventLabel: { label: string; ok?; kind?; name?; detail? }
  delta?: string;                              // legacy streamed text
  turnStarted?: { sessionId: string; requestId: string };  // legacy "admitted" ack
  typed?: TypedDesktopEvent;                   // NEW, additive
};

// typed-events.ts (Zod: TypedDesktopEventSchema)
type TypedDesktopEvent =
  | { type: "tool.start"; id: string; name: string; args: Record<string, unknown>; truncated: boolean }
  | { type: "tool.complete"; id: string; name: string; ok: boolean; output: string; truncated: boolean }
  | { type: "thinking"; text: string; truncated: boolean }
  | { type: "approval.request"; approval: ApprovalPayload }   // exactly what GET /api/approval returns
  | { type: "approval.resolved"; id: string }
  | { type: "usage"; sessionId: string; inputTokens: number; outputTokens: number; reported: boolean; contextTokens: number; contextWindow: number }
  | { type: "turn.complete"; sessionId: string; finalText: string;
      usage?: { inputTokens: number; outputTokens: number }; stoppedReason?: string };

type ApprovalPayload = { id: string; action: string; reason: string; toolName?: string; request: PermissionRequest };
```

Frame rule (one choice, backward compatible):

- Events that already had a label (`tool.start`, `tool.complete`) arrive as the **same frame**: the unchanged label event plus a `typed` field.
- Events with no label (`thinking`, `approval.request`, `approval.resolved`, `turn.complete`) arrive as a **typed-only frame**: `{ "label": "", "typed": {...} }`. The old renderer ignores it (`label` is empty, no `delta`/`turnStarted`).
- A renderer that wants typed events should handle `frame.typed` first and ignore `label` for those frames. `note` events and the other legacy label events have no typed form and are unchanged.
- The `events` array in the `POST /api/chat` response stays label-only (no `typed`).
- Typed-only frames go only to clients on the default encoder (`GET /api/events`). The public API (`/api/v1/events`, explicit frame builder) never receives them or the `typed` field, and the companion stream gets labelled frames with `typed` stripped (`legacyFrame`). Typed events are for the desktop renderer.

Semantics:

- `tool.start.id` is minted by the server as `tool-<n>` (monotonic per client state, so ids never repeat across turns). The agent's `tool_start`/`tool_end` carry no call id, so each `tool.complete` takes the **oldest open** id of the same tool name (FIFO per name). Assumption: same-name calls finish in start order. This holds for the sequential loop. It is **not guaranteed** when concurrency-safe read tools overlap (streaming prefetch, `VANTA_PARALLEL_TOOLS`): two overlapping same-name calls may have their outputs swapped. Start/complete counts stay balanced. A real fix needs a call id on `StreamEvent` (agent loop change, not done here). Open starts are dropped at each turn start. A `tool.complete` with no open start gets a fresh id; render it as its own step.
- `args` and `output` are redacted (secret-bearing keys such as `token`/`password`/`api_key`/`authorization` become `***`; vendor and structural secret values are masked via `redactForLog`). `args` is capped at 4 KB serialized (string values shrink first, then trailing keys drop), `output` at 8 KB, `thinking.text` at 8 KB. `truncated` is `true` whenever anything was cut. `finalText` is not capped or redacted (it is the same text the POST returns).
- `approval.request` is pushed the moment the agent blocks on a human decision; polling `GET /api/approval` still returns the identical payload. `approval.resolved` is pushed when `POST /api/approval` claims the request, before the agent is released, so it precedes any follow-on tool event. It is not pushed if a turn is aborted while an approval is pending (no code path clears it today); poll `GET /api/approval` to reconcile.
- `turn.complete` is pushed once per `POST /api/chat`, after the session is persisted and just before the HTTP response is written (queued follow-ups that run inside the same request do not emit their own). `stoppedReason` is the agent's reason (`done`, `interrupted`, `blocked`, `max_iterations`, ...) or `failed` / `provider_auth` on the failure paths. The POST response stays authoritative, so renderers must treat both as idempotent.
- Parallel chats: each client id owns its own state and SSE channel; send a distinct `x-session-id` per chat. Events are never delivered across ids. The body `sessionId` on `POST /api/chat` must equal that state's open session or the server answers 409.
- `usage` is pushed after every settled instruction (a queued follow-up that runs inside the same request pushes its own), just before `turn.complete`. `inputTokens`/`outputTokens` are that instruction's provider-reported totals; `reported:false` means the provider gave none and both are zero (not measured). `contextTokens` is an estimate of what the conversation now occupies (about four characters per token over text, tool-call arguments and tool results; image bytes excluded), `contextWindow` is the model's window. It is a typed-only frame like `turn.complete`, so legacy renderers ignore it, and the public API and companion streams never receive it.
- Typed pushes are best-effort: a failed or invalid typed event is dropped and never breaks a turn.

## Safety

The desktop and companion chats use the same `createConversation` path as the CLI. `requestApproval` blocks on a real web approval: an `ask`-tier action stalls until the UI POSTs a decision, so `ask` actions prompt rather than auto-deny. Kernel `block` stays immovable. Companion tokens are stored hashed under `VANTA_HOME`; the six-character pairing code expires after ten minutes and is single-use.

Desktop Work exposes a project-scoped access picker backed by `GET|POST /api/access-mode`. `Manual` uses the normal human approval path; `Accept edits` auto-confirms project file operations while shell/network/risky actions still ask; `Plan` injects the plan instruction and blocks non-read-only tools; `Auto` includes routine file edits plus the safe-action classifier after the kernel while consequential/unsafe actions still ask or block; `Full access` clears Ask prompts inside the project and tool-internal approval prompts, but never clears a kernel or explicit Block. The setting persists in `.vanta/settings.local.json`, and each change writes an activity event and kernel audit event.

See `native-shell.md` for the packaging path and honest shipped/not-shipped boundary.

## Hermes control routes (profiles, schedules, sessions, skills, tools, projects)

Served by `control-routes.ts` (one registration in `server-routes.ts`); handlers live in `*-api.ts`. All are GET or POST, JSON, Zod-validated (a bad body is `400 {error}` naming the field). Success bodies carry `ok: true`; failures are `{error}` with a plain-language reason. The renderer maps the Hermes REST/RPC calls onto these in `desktop-next/apps/desktop/src/api/vanta/shim-*.ts` and `handlers-*.ts`.

Approval-gated routes ask through the same card chat uses, one-time (`fresh`, never a saved rule), and refuse with `409` when no event stream is open for the caller (nobody could answer). Send them with the open chat's `x-session-id`.

| Route | Does | Approval |
|---|---|---|
| `GET /api/profiles` | `{profiles:[{id,name,home,isDefault,isImplicit,status,model,provider,skillCount,hasSoul,clonedFrom}]}`; `default` (the base home) is always first; exactly one is the sticky default | no |
| `POST /api/profiles/{create,clone,rename,delete,switch,set-default,export}` | `create {name,cloneFrom?,model?,provider?}`, `clone {source,name}`, `rename {name,newName}` (display name only, id and home stay), `delete {name}` (retires; the home stays on disk), `switch`/`set-default {name}` (writes the sticky default, `appliesOnRestart:true`; `default` clears it), `export {name}` (writes a validated distribution directory under `<home>/exports/<id>`, returns `path`,`files`) | no |
| `POST /api/profiles/import {source}` | installs a distribution (absolute directory or `https://` Git URL; nothing option-shaped); previews first, then installs and rolls back if the source commit changed after approval | yes: names profile, source, commit and files |
| `GET /api/profiles/soul?name=`, `POST /api/profiles/soul {name,content}` | `SOUL.md` of a profile (or the base home for `default`), 64 KB cap | no |
| `GET /api/schedules` | adds `lastRun {at,ok,summary}` to entries that have run | no |
| `POST /api/schedules/{create,update,pause,resume,delete}` | `create {cron\|when, instruction, mode?, script?, routine?}` (`when` is natural: "every 2 hours"), `update {id, cron\|when?, instruction?, script?}`, ids are `cron.tsv` entries; durable agent tasks answer `409` | script modes: create, change of script bytes, and resume. Approved bytes are bound with a new authority (`scriptAuthorityValid`) |
| `POST /api/schedules/trigger {id}` | runs now with the same runner as `vanta cron`, saves a `sched-<id>-<stamp>` session with the result, logs the run; an unauthorised script answers `409` | no (the effect gate still applies to scripts) |
| `GET /api/schedules/:id/runs?limit=` | `{runs:[{jobId,at,trigger,ok,summary,sessionId?}]}` from `<data>/cron-runs.jsonl`; `vanta cron` also appends scheduled fires | no |
| `GET /api/schedules/blueprints`, `POST /api/schedules/blueprints/instantiate {blueprint,values}` | schedule blueprints only (webhook ones stay in the CLI) | no |
| `GET /api/sessions` | rows gain `unread:true` when updated after their read watermark | no |
| `GET /api/sessions/search?q=&limit=` | `{results:[{sessionId,title,started,updated,role,snippet}]}`, case-insensitive over saved transcripts, trashed skipped | no |
| `POST /api/sessions/unread {id,unread}` or `{all:true}` | watermark in `<home>/session-read-state.json` (outside the sessions directory); no entry means read | no |
| `GET /api/sessions/export?id=&format=markdown\|json` | `{id,title,format,filename,mime,content}`, system prompts and image bytes left out | no |
| `POST /api/sessions/fork {id,count?}` | new session with the first `count` non-system messages (all when omitted), never ending on an unanswered tool call; title `<title> (branch)` | no |
| `GET /api/skills`, `POST /api/skills/toggle {name,enabled}` | `[{name,description,category,enabled,provenance,usage,tags}]`; off writes `skillOverrides[name].disabled` to user settings and drops the skill from the prompt index and `recall` | no |
| `POST /api/skills/install {slug}` | only from the registry in `VANTA_SKILL_REGISTRY` (`503` when unset); integrity-checked, installed and activated | yes: version, registry, sha, file count, risks |
| `GET /api/tools/toolsets`, `POST /api/tools/toolsets/:name {enabled}` | every registered tool as a one-tool toolset; off writes `blockedTools` in user settings and applies when the next session is prepared (`appliesNextSession:true`); a project-level block answers `409` | no |
| `GET /api/projects`, `POST /api/projects/{create,rename,delete,set-active}` | named projects in `<home>/projects.json` plus one derived from the working folder (id = its path, never stored); delete removes the record only; no colour or icon | no |

Not built: toolset key configuration, skill hub search/preview/scan (only registry install), per-session pin ordering (the renderer keeps it locally; `POST /api/sessions/reorder-pins` exists), update/diagnostic routes (left as "not configured").
