# Desktop pinned task order receipt

Date: 2026-07-17
Roadmap card: `DESKTOP-PINNED-TASK-ORDER`

## Shipped behavior

- Session menus expose Pin, Unpin, Move up, and Move down as ordinary pointer and keyboard actions.
- Pinned sessions render once in a dedicated project-rail group and no longer compete with Project or Recent placement.
- Pin state and order live in the canonical session record, not renderer-local storage, so they survive renderer and Electron process restarts.
- Reorder requests carry the complete active pinned identity list and reject stale or partial orders instead of silently dropping tasks.
- Archiving preserves pin identity and position; undo restores the same placement. Moving a session to Trash clears pin state, so a restored trashed task returns unpinned.
- Pin, unpin, and reorder operations expose pending state, success/undo feedback, and actionable errors through the existing session notice channel.
- The compact thread drawer exposes the same labeled menu actions and keyboard focus behavior as the desktop rail.

## Executed verification

```text
npx vitest run src/sessions/store.test.ts src/desktop/sessions-api.test.ts desktop-app/src/session-pinning.test.ts
npm run typecheck
npm run desktop:renderer:typecheck
npm run desktop:sessions:smoke
npm run desktop:flow:proof:source
npm test
npm run desktop:flow:proof
```

The focused contract passed 22 tests. The complete suite passed 1,390 files and 13,298 tests with 3 skipped. The dedicated Electron receipt returned pointer pinning, keyboard reorder, process-restart persistence, archive restoration, trash reset, optimistic error, menu focus, and compact drawer checks as true.

The final flow receipt returned `ok: true` for source and locally signed packaged targets. Both targets exercised the session proof alongside cold start, useful work, failed-run recovery, attachments, outputs, permissions, MCP setup, and responsive layouts at 1440x960, 1024x640, and 760x700.
