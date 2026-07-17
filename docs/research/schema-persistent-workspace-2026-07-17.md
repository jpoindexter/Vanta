# Schema Persistent Workspace

Status: shipped 2026-07-17

## Outcome

Schema working state now survives context compaction and process restart as typed artifacts rather than transcript memory. `saveSchemaWorkspace` writes a content-addressed immutable snapshot containing the exact certified timeline, optional simulated plan, concise notes, remaining search budgets, next safe action, active model version, and content hashes for referenced hypothesis ledgers. The active pointer advances atomically only after the snapshot is complete.

`restoreSchemaWorkspace` verifies the pointer and manifest content hash, exact timeline hash, active immutable model version, hypothesis ledger ownership and hashes, and plan/model/history consistency. It then reruns the complete-history backtest to mint a fresh in-process certification; the serialized `certifiedAtSave` field is informational and never trusted as current authority.

Successful restore returns the active model, fresh certification, unresolved hypotheses, last committed transition, remaining budgets, next safe action, concise notes, and optional plan. Missing, changed, or semantically stale artifacts return a typed recoverable diagnostic with `repair_workspace_and_recertify` as the safe route.

The snapshot schema has no transcript field. Exploratory chatter can be discarded before a new process reconstructs the working state.

## Executed Proof

Executed from `vanta-ts/` on macOS:

```text
npm test -- --run src/schema/workspace.test.ts --maxWorkers=1
1 file, 3 tests passed

npm test -- --run src/roadmap src/schema --maxWorkers=1
26 files, 225 tests passed

npm run typecheck
passed

git diff --check
passed
```

The fixtures prove restart reconstruction after discarding raw chat, fresh certification authority, model and plan restoration, unresolved-hypothesis recovery, last-transition recovery, budget and next-action recovery, immutable timeline tamper detection, manifest content addressing, and semantic recertification failure diagnostics.

## Boundary

This module is the durable Schema substrate used by a Schema-mode runner or compaction hook. It does not claim that every existing non-Schema Vanta session has been migrated to this workspace format.
