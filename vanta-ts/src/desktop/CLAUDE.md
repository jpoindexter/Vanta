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
- `approval.request` is pushed the moment the agent blocks on a human decision; polling `GET /api/approval` still returns the identical payload. `approval.resolved` is pushed when `POST /api/approval` claims the request, before the agent is released, so it precedes any follow-on tool event. Aborting its request signal also resolves the exact pending card and settles denial; a claimed save retains that lifetime until publication. Unique IDs prevent a delayed decision from claiming a newer card. Poll `GET /api/approval` to reconcile missed frames.
- `turn.complete` is pushed once per `POST /api/chat`, after the session is persisted and just before the HTTP response is written (queued follow-ups that run inside the same request do not emit their own). `stoppedReason` is the agent's reason (`done`, `interrupted`, `blocked`, `max_iterations`, ...) or `failed` / `provider_auth` on the failure paths. The POST response stays authoritative, so renderers must treat both as idempotent.
- Parallel chats: each client id owns its own state and SSE channel; send a distinct `x-session-id` per chat. Events are never delivered across ids. The body `sessionId` on `POST /api/chat` must equal that state's open session or the server answers 409.
- `usage` is pushed after every settled instruction (a queued follow-up that runs inside the same request pushes its own), just before `turn.complete`. `inputTokens`/`outputTokens` are that instruction's provider-reported totals; `reported:false` means the provider gave none and both are zero (not measured). `contextTokens` is an estimate of what the conversation now occupies (about four characters per token over text, tool-call arguments and tool results; image bytes excluded), `contextWindow` is the model's window. It is a typed-only frame like `turn.complete`, so legacy renderers ignore it, and the public API and companion streams never receive it.
- Typed pushes are best-effort: a failed or invalid typed event is dropped and never breaks a turn.

## Company API (DN-18)

Additive routes for the Company screen. Same boundary as every `/api/*` route: `x-vanta-desktop-boundary` token required (403 without), GET and POST only (405 otherwise). Every GET response is Zod-validated server-side (`company-schemas.ts`, `company-finance-schemas.ts`); every POST body is a strict Zod schema (`company-write-schemas.ts`), so a bad or unknown field answers `400 {"error":"field: problem"}`. Absent stores give valid empty payloads, never a 500.

Model. A *ticket* (`<project>/.vanta/tickets.json`) and its *task* (`~/.vanta/team-tasks.jsonl`) share an id. Assigning a ticket creates the task. A task made on the CLI shows as a ticket with `source: "team-task"`. Ticket status is derived: `open | assigned | in_progress | blocked | in_review | done | closed`. Worker status: `idle | working | waiting | failed | paused` (`paused` is stored on the roster row; `failed` = blocked with a failed latest run).

### Reads (GET)

| Route | Returns |
|---|---|
| `/api/company` | `workers[]` (role, runtime `{kind, adapter, model}`, reportsTo, directReports, department, status, currentTicketId, queuedTicketIds, lastHeartbeat, costUsd, costBasis, budgetUsd), `orgChart` tree, `departments`, `totals`, `pending` counts |
| `/api/tickets?worker=&status=&project=&limit=` | `tickets[]` summaries, `total`, `filters` |
| `/api/tickets/:id` | summary plus `thread` (comments with author, answers, review and revision events), `blockers`, `runs` (history with usage, cost, costBasis), `workProducts` (provenance), `ancestry` (parent tickets, goal, project), `reviewStages`, `outcome` |
| `/api/budgets` | `limits[]` (scope, kind, thresholds, status, hardStop), `workers[]` (estimated and reported USD, run counts incl. notReported), `departments[]`, `days[]`, `totals`, `costBases` |
| `/api/activity?limit=&cursor=&kind=&worker=&ticket=&source=company\|kernel\|all` | newest first; `nextCursor` is opaque, pass it back unchanged (a foreign cursor is 400) |
| `/api/okrs` | objectives with progress and the key result furthest from target |
| `/api/work-products?ticket=&worker=&department=&approval=approved\|pending&kind=` | artifacts (redacted, capped at 16 KB with `truncated`), `pending` count |
| `/api/heartbeats` | pipeline `runs[]` and derived per-worker heartbeats. Routine and cron rows stay on `/api/schedules` |
| `/api/company/runtimes` | worker runtimes this machine can run, for the hire dialog: `runtimes[]` of `{runtimeId, displayName, adapter, installed, command, version, auth, selfApproving, reason?}`. `adapter` is the value to hire with (`cli:claude-code`, ...) or `null` for the Vanta loop (which takes a provider id). `auth` comes from the CLI's own status command exit code only (`authenticated`, `unauthenticated`, `unknown`, `not-applicable`). Served outside the company lock because it probes the CLIs |

`costBasis`: `estimated` (tokens times the pricing table), `reported` (the runtime returned dollars), `not-reported` (no figure; adds nothing to USD totals). `goal` ancestry text needs a live session kernel; otherwise `resolved:false`.

### Writes (POST, all under `/api/company/`)

| Route | Body | Notes |
|---|---|---|
| `workers/hire` | `role, adapter, budgetUsd?, title?, managerId?, departmentId?, requestId?` | **Needs fresh owner approval** (see below). Idempotent by `requestId`. A `budgetUsd` also creates the `agent:<id>` budget scope. `adapter` is a provider id (the Vanta loop on that backend) or `cli:<runtime id>` (`cli:claude-code`, `cli:codex`, `cli:hermes`, or a CLI declared in `agents.json`); a malformed `cli:` value answers 400 before any approval is asked |
| `workers/pause` / `workers/resume` | `workerId, reason?` / `workerId` | Idempotent. Pause **aborts the in-flight run** (its AbortController) and stops new starts; resume starts the worker's next queued ticket |
| `tickets/create` | `title, description?, goalId?, parentId?, projectId?, labels?, expectedOutput?, requireReview?=true, requestId?` | `expectedOutput` sets the enforced-outcome contract; `requireReview` adds an `owner-review` stage |
| `tickets/assign` | `ticketId, workerId, start?=true` | Creates the task; starts the run unless the worker is paused, busy, or over budget (then `run.started:false` with `reason`; the ticket is queued) |
| `tickets/comment` | `ticketId, text, requestId?` | Idempotent by `requestId` |
| `tickets/close` | `ticketId, resolution?=done\|wontfix, noArtifactReason?` | Goes through `advanceTask`: an open review stage or missing artifact answers 409 with the engine's message. `noArtifactReason` is the engine's explicit forced close for the outcome gate only |
| `tickets/answer` | `ticketId, answer` | Only for a blocked ticket (409 otherwise); records the answer and restarts the worker with it |
| `work-products/approve` | `workProductId` | Approves the artifact and the ticket's `owner-review` stage; closes the ticket when nothing else blocks it. Idempotent |
| `work-products/revise` | `workProductId, reason` | Rejects the stage, logs the revision and re-runs the producing task; the re-run updates the same work product. 409 if the ticket is already done |
| `budgets/raise` | `scope, limitUsd` | **Needs fresh owner approval.** Never lowers (a lower or equal limit is a no-op). Journaled in the company activity log with before and after; not written to config-revisions (that file is `.env` history) |
| `okrs/create` | `title, departmentId?, keyResults?[{name, target, current?=0}]` | Writes `~/.vanta/okrs.json`. Unknown `departmentId` answers 400. A repeated title gets its own id (`grow-2`). Journaled as `okr.created` |
| `okrs/progress` | `objectiveId, name, current, target?` | Sets one key result's current value; `target` is required only to add a key result that does not exist yet (400 otherwise). 404 for an unknown objective. Journaled as `okr.progress` |
| `tick` | `{}` | One `COFOUNDER-CADENCE-LOOP` beat; dispatch also starts the worker run. `warnings[]` explains an empty tick (no departments, no visible kernel goals) |

Replies are `{ changed, ... }` plus the updated object. Errors are `{ "error": "..." }` with 400 (invalid), 403 (declined), 404 (unknown id), 409 (state conflict, pending approval, gate refusal), 503 (no worker runtime).

Approval. Hire and budget raise use the same flow as tools: the POST blocks while the owner decides. The renderer gets `approval.request` on SSE (or `GET /api/approval`) and answers with `POST /api/approval`. The approval is fresh: `canRemember:false`, no saved "always" rule. Only one approval can be pending per session; a second answers 409. A decline answers 403 and changes nothing.

Runtime. Runs go through a `WorkerRuntime` port (`company-ports.ts`); `ports.runtime(state, worker)` picks the runtime from the worker's hire-time `adapter` (`company-run-select.ts`). A provider id runs the Vanta native loop (`company-native-runtime.ts`: honours the adapter and model, cannot spawn `delegate`/`team`, every tool call kernel-gated and on the desktop approval flow). `cli:<id>` runs an external CLI worker from the registry in `src/worker-runtimes/` (Claude Code, Codex, Hermes, custom `agents.json` CLIs; see `docs/worker-runtimes-2026-10-13.md`). One run per worker at a time; the rest queue FIFO. A run closes its ticket only through the engine's outcome and review gates, so a ticket with a review stage waits in `in_review` until the owner approves.

External CLI workers. Starting one shows an approval card (tool name `call_agent`, so "Always" is the existing project-scoped rule): the exact action names the CLI, the working directory, the ticket, the access level and a prompt preview with its sha256. A self-approving CLI (Hermes, undeclared custom CLIs) gets a warning, and "Always" is withheld. The kernel assesses the launch first and a block never reaches the card; a saved Never rule refuses; an unreachable kernel refuses. The card queues behind any other open approval (one per session) and is withdrawn if the worker is paused first. While running, tool and message events appear in the activity feed as `run.progress` (thinned to one per second, 60 per run) and over SSE as `activity.appended`. On finish the run record carries tokens and cost when the CLI reported them: `costBasis: "reported"` with a dollar figure (Claude Code's `total_cost_usd`, a client-side figure), or `not-reported` with `costUsd: null` (Codex reports tokens only). Nothing is ever recorded as 0 for "not reported". A failed or stopped run keeps whatever it spent. The result becomes up to two work products (`report` from the final message, `code` with the changed files and diff stat); each carries `provenance.runtimeId` and `provenance.runId`. Spend left on the worker's `agent:` and `dept:` budgets is passed to Claude Code as `--max-budget-usd` (a mid-run hard stop); other CLIs cannot be capped mid-run, so their spend is recorded when they finish and a tripped scope blocks the next start. `vanta heartbeat`, `vanta company tick` and `team run` skip paused workers; heartbeat and tick start queued tickets of CLI workers through this same engine, but with no card to show they launch only when the owner already saved an Always rule for `call_agent` in the project.

Concurrency. A per-home mutex (`company-lock.ts`) serialises company reads, writes and run completions; it is never held while waiting for an approval or a worker.

### Company events (SSE)

Added to `TypedDesktopEvent` (same typed-only frame rule as above). Unlike chat events, company events are **broadcast to every connected client**, so the Company screen updates from any window. `approval.request` stays per-client (it goes to the session that made the request).

```ts
| { type: "ticket.updated"; ticket: TicketSummary }                 // same shape as GET /api/tickets items
| { type: "worker.status"; workerId: string; status: "idle"|"working"|"waiting"|"failed"|"paused";
    currentTicketId: string | null; lastHeartbeat: string | null; costUsd: number }
| { type: "budget.alert"; scope: string; level: "warning" | "exceeded"; spentUsd: number; limitUsd: number }
| { type: "activity.appended"; entry: ActivityEntry }               // same shape as GET /api/activity entries
```

Events are hints: payloads match what GET returns, so a missed frame is repaired by the next read. `budget.alert` fires when a run moves a scope from a lower to a higher status (active to warning, warning to exceeded), not on every spend.

Audit. Every write appends to `~/.vanta/company-activity.jsonl` and, when a session kernel is already live, mirrors a `company_action` event into the kernel `events.jsonl`. Run history is `~/.vanta/company-runs.jsonl`.

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
