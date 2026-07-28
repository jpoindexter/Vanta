# AGENTS.md — vanta-ts/desktop-app

React/Vite renderer for the local Vanta desktop command center.

- Keep this app as UI only. Agent execution, safety, sessions, tools, and approvals stay behind `src/desktop/server.ts` APIs.
- Match Vanta's operator/dossier aesthetic: dense, calm, dark, inspection-first, no marketing hero.
- Build with `npm run desktop:build` from `vanta-ts/`; output stays in `desktop-app/dist/` and is served by the desktop server when present.
- Keep `src/App.tsx` as the shell/composition layer. Put API calls in `src/api.ts`, state hooks in `src/state.ts`, chat/sidebar/composer in `src/chat.tsx`, rail panels in `src/rail.tsx`, and overlays/permission dialogs in `src/overlays.tsx`.
- The composer access picker mirrors the shared operating modes: Manual, Accept edits, Plan, Auto, plus an explicit Full access escape hatch. Keep the mode descriptions truthful about the kernel and approval boundary.
