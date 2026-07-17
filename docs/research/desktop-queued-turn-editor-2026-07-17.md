# Desktop queued-turn editor proof

Date: 2026-07-17

Roadmap card: `DESKTOP-QUEUED-TURN-EDITOR`

## Outcome

Vanta Desktop now keeps pending instructions in a durable project-scoped queue instead of one volatile in-memory slot. Work shows a compact queued count and opens an accessible drawer where the operator can edit, reorder, prioritize as the next steer, or cancel each pending turn.

Every item preserves its session, project root, runtime controller, model, and access mode. Queue state is written atomically under `VANTA_HOME`, survives Desktop restart, and recovers a `starting` claim when its owning runtime process is no longer alive.

Starting items are read-only. Edit, reorder, steer, and cancel requests carry the item revision; a race against a just-starting item returns HTTP 409 with the current queue snapshot. A queued turn that throws or returns a non-success stop reason is released back to the queue instead of being lost.

## Executed proof

```bash
npx vitest run src/desktop/chat-concurrency.test.ts src/desktop/turn-queue.test.ts desktop-app/src/queued-turns.test.tsx
npm run desktop:renderer:typecheck
npm run typecheck
npm run desktop:queue:smoke
node scripts/desktop-flow-proof-suite.mjs
npm test -- --run
git diff --check
```

The focused queue run passed 17 tests. The final repository run passed 1,394 test files with 13,315 tests passed and 3 skipped.

Both source Electron and the signed packaged `Vanta.app` emitted the same queue receipt:

```json
{
  "ok": true,
  "enqueue": true,
  "edit": true,
  "reorder": true,
  "steer": true,
  "cancel": true,
  "startingRace": true,
  "reconnect": true,
  "relaunch": true,
  "compact": "760x700",
  "persistedScope": ["controller", "model", "approval"]
}
```

The complete desktop matrix also passed shell, recovery, 500-turn navigation, attachments, session operations, Outputs, and Connect for source and packaged targets. A post-suite status scan found zero kernel endpoints owned by temporary desktop fixture roots.

## Boundary

The Electron queue smoke exercises the visible UI against deterministic HTTP fixtures. Durable JSON persistence, revision conflicts, dead-process recovery, and failed-turn release are proven in the queue and desktop-handler tests.

`Steer` prioritizes that pending instruction as the next turn after the active turn reaches a boundary. It does not claim provider-level mid-token steering of a response already being generated.
