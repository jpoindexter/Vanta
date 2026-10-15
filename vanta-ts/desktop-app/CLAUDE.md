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

The project access picker exposes Manual, Accept edits, Plan, Auto, and Full access. The server owns their enforcement; the renderer only persists selection and explains the boundary.

## File Map

- `src/App.tsx` — shell composition only.
- `src/state.ts` / `src/api.ts` — browser state hooks and fetch helper.
- `src/chat.tsx` — session sidebar, chat thread, composer.
- `src/rail.tsx` — preview/files/terminal right rail.
- `src/overlays.tsx` — command palette, model picker, typed approval modal with allow/always/deny/never.
- `electron/preload.cjs` + `electron/dropped-paths.mjs` — context-isolated native attachment bridge, deterministic file/folder expansion, and top-level grouping metadata for compact composer rendering.

## Attachments

The composer accepts Finder file and folder drops and a native file/folder picker. Electron converts native `File` objects to paths in preload, then the main-process resolver expands folders, skips symlinks and private/noise paths, caps a selection at 50 files, and returns project paths relative to the current root. It also returns one top-level display item per accepted drop: folders appear as a single icon-only chip with an accessible name and count, while their filtered child files remain nested for submission. External paths remain explicit and still pass through Vanta's normal kernel and readable-zone checks when used.
