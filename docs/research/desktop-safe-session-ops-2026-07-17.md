# Desktop safe session operations

**Roadmap:** `DESKTOP-SAFE-SESSION-OPS`
**Implemented:** 2026-07-17

## Outcome

Desktop session operations now fail safely in the session rail. Rename remains inline. Archive and restore expose pending state, success or error feedback, and an Undo action. Delete moves sessions into a durable Trash without losing transcript, model, or project metadata; Trash can restore a session or explicitly delete it forever.

The same contract applies to multi-select. Shift-click selects a range, **All visible** selects the current rail view, and bulk Archive or Move to Trash has one operation receipt plus Undo. Permanent deletion is available only from Trash and retains a confirmation step.

Session action menus expose menu semantics, move focus with Arrow Up/Down/Home/End, close on Escape with focus returned to the trigger, and dismiss when the operator clicks outside. A pending row is disabled until its request resolves; failures leave the row recoverable and show an alert in place.

## Executed proof

Executed:

```bash
npm run typecheck
npm run desktop:renderer:typecheck
npx vitest run desktop-app/src --maxWorkers=1
npx vitest run src/desktop/sessions-api.test.ts src/sessions/store.test.ts --maxWorkers=1
npm run desktop:sessions:smoke
```

Observed:

- core and renderer TypeScript checks passed;
- 12 renderer test files and 36 tests passed;
- session persistence and desktop API tests passed 18 tests;
- the production renderer built successfully;
- Electron proved inline rename, keyboard traversal, Escape focus return, and outside-click dismissal;
- a delayed failing archive request exposed pending state, restored the row, and displayed the server error;
- Electron proved archive Undo, Trash restore, and confirmed permanent delete;
- Electron proved Shift-click range selection, All visible, bulk archive Undo, bulk Trash Undo, and bulk permanent delete;
- Vanta's size gate reports no new violations in the session store, safe-operation component, conversation mutation path, or shared session types.

The Electron fixture uses an isolated temporary `VANTA_HOME` and user-data directory. It executes the real renderer, local API, filesystem session store, and Electron host while leaving operator sessions untouched.
