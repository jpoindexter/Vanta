# CLAUDE.md — desktop interface

First slice of the Vanta desktop experience: session sidebar, central chat, right preview/files/terminal rail, command palette, and command-center overlay.

## Run

```bash
cd vanta-ts
npm run vanta -- desktop        # opens http://127.0.0.1:7790
npm run vanta -- desktop 7791   # custom port
```

## Shape

- `server.ts` starts a localhost HTTP server with:
  - `GET /` static command-center UI
  - `GET /api/status` kernel/model/tool/goal snapshot
  - `GET /api/sessions` saved Vanta sessions
  - `GET /api/tools` tool catalog for the right rail
  - `POST /api/chat` persistent in-process Vanta conversation
- `page.ts` is dependency-free static HTML/CSS/JS using the Vanta dossier/operator visual language.
- This is not packaged Electron/Tauri yet. It is the seed surface; native shell, streaming, true session resume/sidebar selection, file preview/PTY, and approval prompts are next.

## Safety

The desktop chat uses the same `createConversation` path as the CLI. For now `requestApproval` returns `false`, so approval-required actions are denied rather than silently executed. Add an explicit approval UI before allowing `ask` actions.

See `native-shell.md` for the packaging path and honest shipped/not-shipped boundary.
