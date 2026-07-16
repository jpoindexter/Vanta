# Schema Controlled Commit Gate

Status: shipped 2026-07-17

## Outcome

`commitActions` is the only Schema API that receives a real kernel executor. All other Schema operations remain side-effect free. The legacy `runTaskStep` path now refuses environments classified as reversible or external with `controlled_commit_required`; it remains available for in-memory fixtures and deliberation with `sideEffect: none`.

Before one action reaches the kernel, the gate requires:

- a live in-process certification produced by `runBacktest`, not a structurally forged report;
- matching active model version and an unchanged timeline hash;
- an action accepted by the environment's legal-action schema;
- valid grounded before state and observation;
- a deterministic expected state and goal from the strict model sandbox;
- an explicit low, medium, or high risk assessment;
- an approval-policy decision;
- an atomically claimed deterministic idempotency key.

The kernel request carries the environment, legal action, model version, expected transition, approval, risk, and idempotency key. The resulting transition receipt stores expected state and goal separately from actual observation and after state, along with verification and correlation metadata.

## Failure Behavior

Illegal actions fail before model preview or approval. Denied approvals, duplicate keys, forged certification, stale history, invalid state, invalid observations, and model failures all stop before kernel execution. A claimed key is not released after dispatch because an interrupted kernel result is ambiguous and retrying could duplicate the side effect.

`MemoryIdempotencyClaims` is the deterministic test/reference implementation. Production callers must inject a durable claim store or rely on the kernel's durable idempotency boundary while preserving the same key.

## Executed Proof

Executed from `vanta-ts/` on macOS:

```text
npm test -- --run src/schema/controlled-commit.test.ts
1 file, 5 tests passed

npm test -- --run src/schema
8 files, 47 tests passed

npm run typecheck
passed
```

The fixtures prove the complete kernel request contract, approval ordering, duplicate refusal, illegal-action refusal, denied approval, forged and stale certification refusal, receipt separation, and direct side-effect bypass prevention.

## Boundary

This gate records whether actual state matched prediction but does not yet own mismatch recovery. Stopping a multi-action queue, preserving the counterexample, revising state or model, recertifying, and resuming belong to `SCHEMA-COUNTEREXAMPLE-REVISION`.
