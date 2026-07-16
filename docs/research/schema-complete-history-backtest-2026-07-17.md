# Schema Complete-History Backtest

Status: shipped 2026-07-17

## Outcome

`runBacktest` replays every checkable recorded transition through an executable task-model artifact before the model can be treated as certified.

For each complete transition, the backtest:

- validates the recorded before and after snapshots as grounded states;
- refuses stale representation versions before model execution;
- executes `step` and `isGoal` through the strict model sandbox with the preceding timeline as declared context;
- compares the predicted state to recorded reality at the first differing field path;
- checks the goal predicate independently against the recorded terminal status;
- retains transition run ID, sequence, predicted value, observed value, and explanation in each mismatch.

Coverage reports include total records, transitions, checked transitions, exact matches, mismatched transitions, partial transitions, skipped markers, resets, and uncheckable transitions. Certification requires at least one transition and exact coverage of every transition. Partial, skipped, malformed, stale, execution-failed, state-mismatched, or terminal-mismatched history cannot certify.

## Counterexamples

The report exposes the first pointed counterexample as well as the complete mismatch list. A mutated fixture reports:

```text
run-backtest transition 1
$.counters.steps.value
predicted: 2
observed: 1
```

This is a concrete revision target rather than a generic failed-backtest flag.

## Executed Proof

Executed from `vanta-ts/` on macOS:

```text
npm test -- --run src/schema/backtest.test.ts
1 file, 6 tests passed

npm test -- --run src/schema
7 files, 42 tests passed

npm run typecheck
passed
```

The fixtures prove exact certification, mutation detection, stale-model refusal, independent terminal mismatch reporting, partial/skipped/reset coverage accounting, and malformed-state refusal.

## Boundary

Certification is evidence about recorded transitions, not permission to act. Real side effects remain blocked until `SCHEMA-CONTROLLED-COMMIT-GATE` verifies current certification, legal action, approval, idempotency, and kernel routing.
