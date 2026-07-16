# Schema Transition Timeline

Status: shipped 2026-07-17

## Outcome

Schema task runs can now persist typed transition events through Vanta's existing kernel audit writer. The kernel remains the owner of append-only storage, keyed hashes, and the tail-truncation anchor; Schema owns the inner event contract and replay behavior.

`runRecordedTaskStep` executes the shared `TaskEnvironment` runner and records either:

- a `task_transition` with the before state, action, prediction, observed result, after state, terminal reason, verifier result, model identity, approval posture, and correlation IDs; or
- a `task_marker` with an explicit `reset` or `skipped` outcome and reason.

Transition outcomes distinguish `observed`, `partial`, and `terminal`. Predictions and actual observations remain separate fields.

## Restart And Integrity

`TaskTransitionTimeline` reconstructs the next sequence number from prior kernel `events.jsonl` content, so a restarted process appends after the last durable record. `replayTaskTimeline` ignores unrelated kernel events and returns Schema records in append order.

`verifyAndReplayTaskTimeline` refuses to replay until the owning kernel reports its audit chain intact. This keeps cryptographic verification in the Rust boundary that owns the secret audit key instead of duplicating weaker verification in TypeScript.

Before persistence, nested secret-bearing fields and credential-shaped string values are redacted. The kernel logger applies its own structural redaction again at the final emit boundary.

## Verification

Executed:

```text
npm test -- --run src/schema/task-environment.test.ts src/schema/task-environment-boundary.test.ts src/schema/timeline.test.ts
3 files, 12 tests passed

npm run typecheck
passed

cargo test audit::tests
5 tests passed
```

The Rust checks prove intact-chain verification plus detection of edited lines, deleted lines, and tail truncation. The Schema checks prove task-run recording, ordered restart replay, explicit reset/skipped/partial/terminal outcomes, prediction-versus-observation separation, recursive secret redaction, and replay refusal after a failed kernel verification.

## Boundary

This slice records and replays task reality. It does not yet infer entities, variables, or executable task rules from those observations; those remain in the state-grounding and executable-model roadmap cards.
