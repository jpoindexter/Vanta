# Schema Counterexample Recovery

Status: shipped 2026-07-17

## Outcome

The controlled commit path now treats recorded reality as authoritative. After every committed kernel action, Vanta compares the model's predicted state and terminal result with the observed transition. The first mismatch returns `prediction_mismatch`, preserves the completed transition receipts, and prevents every later queued action from reaching the kernel.

`openCounterexampleEpisode` persists the failed plan, model version, pointed mismatch path, predicted and observed values, completed transitions, and remaining action queue under the Vanta data directory. The episode exposes one classified safe next action instead of silently retrying.

Recovery can revise either the grounded-state interpretation or the transition model. Both paths install a new immutable model version, rerun the complete revised history through the strict sandbox, and permit resume only when the episode is recertified, the model version is newer than the failed version, and the live history hash matches the certification.

## Operator Surfaces

- `/schema-recovery` prints the latest episode classification, mismatch, remaining queue, and safe next action.
- The shared desktop receipt represents the failure as `model_mismatch` with predicted and observed values.
- The desktop Work recovery component renders the counterexample and routes the operator to revision or checkpoint recovery.

The desktop proof covers the shared receipt-to-component behavior. It does not establish a packaged Electron run or a production desktop Schema execution adapter.

## Executed Proof

Executed from `vanta-ts/` on macOS:

```text
npm test -- --run src/schema src/repl/schema-recovery-cmd.test.ts desktop-app/src/chat.test.tsx
11 files, 57 tests passed

npm run typecheck
passed

npm run desktop:renderer:typecheck
passed

git diff --check
passed
```

The fixtures prove first-mismatch queue cancellation, durable episode persistence, CLI classification, desktop recovery rendering, model-rule revision, grounded-state revision, full-history recertification, old-model refusal, and new-certified-model resume.
