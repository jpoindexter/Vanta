# CLAUDE.md — desktop interface

Localhost host for the Vanta desktop experience. The browser renderer is the Vite app in `vanta-ts/desktop-app/`; this folder owns the server/API boundary.

## Run

```bash
cd vanta-ts
npm run vanta -- desktop        # opens http://127.0.0.1:7790
npm run vanta -- desktop 7791   # custom port
npm run desktop:build           # rebuilds the React app served at /
```

## Shape

- `server.ts` starts a localhost HTTP server with:
  - `GET /` built React command-center UI from `desktop-app/dist/index.html` when present
  - `GET /assets/*` built Vite assets
  - `GET /api/status` kernel/model/tool/goal snapshot
  - `GET /api/sessions` saved Vanta sessions
  - `GET /api/tools` tool catalog for the right rail
  - `POST /api/chat` persistent in-process Vanta conversation
- `assets.ts` resolves built files safely under `desktop-app/dist` and falls back to `page.ts`.
- `page.ts` is only the small fallback page shown when the React app has not been built.
- This is not packaged Electron/Tauri yet. It is the seed surface; native shell and richer approval prompts are next.

## Safety

The desktop chat uses the same `createConversation` path as the CLI. For now `requestApproval` returns `false`, so approval-required actions are denied rather than silently executed. Add an explicit approval UI before allowing `ask` actions.

See `native-shell.md` for the packaging path and honest shipped/not-shipped boundary.
