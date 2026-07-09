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
- `approval.ts` adapts pending approvals into typed permission request payloads and resolves allow/always/deny/never decisions.
- `page.ts` is only the small fallback page shown when the React app has not been built.
- `desktop-app/electron/main.mjs` owns the native window/server lifecycle. `tray.mjs` keeps Vanta present after the window closes and provides status, Quick Ask, approval access, and mobile pairing.

## Safety

The desktop and companion chats use the same `createConversation` path as the CLI. `requestApproval` blocks on a real web approval: an `ask`-tier action stalls until the UI POSTs a decision, so `ask` actions prompt rather than auto-deny. Kernel `block` stays immovable. Companion tokens are stored hashed under `VANTA_HOME`; the six-character pairing code expires after ten minutes and is single-use.

See `native-shell.md` for the packaging path and honest shipped/not-shipped boundary.
