# CLAUDE.md — desktop-app

Vite app mounted by the desktop server when `desktop-app/dist/index.html` exists.

## Commands

```bash
cd vanta-ts
npm run desktop:dev
npm run desktop:build
```

## Boundary

The app calls the existing `/api/*` desktop endpoints. Do not import Vanta runtime modules into browser code. Approval-required actions still need the server-side pending approval flow.

## File Map

- `src/App.tsx` — shell composition only.
- `src/state.ts` / `src/api.ts` — browser state hooks and fetch helper.
- `src/chat.tsx` — session sidebar, chat thread, composer.
- `src/rail.tsx` — preview/files/terminal right rail.
- `src/overlays.tsx` — command palette, model picker, approval modal.
