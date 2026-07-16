# Schema Executable Task Model

Status: shipped 2026-07-17

## Outcome

Vanta can install an executable theory of a task as an immutable, operator-inspectable artifact. Each task workspace contains version directories with:

- `manifest.json` for model version, grounded representation version, source hash, creation time, and immutable source-transition lineage;
- `model.js` for the deterministic `step(input)` transition and `isGoal(state)` predicate;
- `types.d.ts` generated from the grounded state's entity IDs, counter keys, and representation version;
- an atomically replaced `active.json` pointer selecting the current operator-visible version.

Installation compiles the source without executing it in the host, then runs it only through `executeTaskModel`. A model is persisted only after the sandbox returns deterministic output and the prediction validates as a `GroundedState` with the active representation version.

## Inspection And Revision

`inspectActiveTaskModel` returns the active manifest, source, and generated types. Inspection recomputes the source hash and refuses a modified artifact. `diffTaskModelVersions` reports source changes, changed source lines, generated-type changes, and newly referenced transitions while prior version files remain intact.

The manifest must include the transition that produced the grounded state. This prevents a model from claiming lineage to unrelated observations.

## Typed Failures

Installation returns typed errors for invalid manifests, invalid JavaScript source, semantic failures, sandbox failures, and version conflicts. Compile or validation failures do not create an active pointer or partial version.

## Executed Proof

Executed from `vanta-ts/` on macOS:

```text
npm test -- --run src/schema/task-model.test.ts
1 file, 9 tests passed

npm test -- --run src/schema
6 files, 36 tests passed

npm run typecheck
passed
```

The fixtures prove state prediction, terminal goal evaluation, generated types, active inspection, immutable version history, model and lineage diffs, compile failure, missing-predicate failure, malformed-state refusal, version conflict, source-tamper refusal, safe task IDs, and grounded-transition lineage.

## Boundary

This slice installs and executes one candidate model against a declared fixture. It does not certify the model against every historical transition. Full-history replay and mismatch reporting belong to `SCHEMA-COMPLETE-HISTORY-BACKTEST`.
