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
- Typed pushes are best-effort: a failed or invalid typed event is dropped and never breaks a turn.

## Safety

The desktop and companion chats use the same `createConversation` path as the CLI. `requestApproval` blocks on a real web approval: an `ask`-tier action stalls until the UI POSTs a decision, so `ask` actions prompt rather than auto-deny. Kernel `block` stays immovable. Companion tokens are stored hashed under `VANTA_HOME`; the six-character pairing code expires after ten minutes and is single-use.

Desktop Work exposes a project-scoped access picker backed by `GET|POST /api/access-mode`. `Manual` uses the normal human approval path; `Accept edits` auto-confirms project file operations while shell/network/risky actions still ask; `Plan` injects the plan instruction and blocks non-read-only tools; `Auto` includes routine file edits plus the safe-action classifier after the kernel while consequential/unsafe actions still ask or block; `Full access` clears Ask prompts inside the project and tool-internal approval prompts, but never clears a kernel or explicit Block. The setting persists in `.vanta/settings.local.json`, and each change writes an activity event and kernel audit event.

See `native-shell.md` for the packaging path and honest shipped/not-shipped boundary.
