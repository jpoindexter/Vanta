# Schema v1 release gate

Date: 2026-07-17

Roadmap card: `SCHEMA-V1-RELEASE-GATE`

## Outcome

Schema v1 passed an integrated local release proof across one real repository task and one real browser task. Each task produced an append-only hash-chained timeline, grounded state, immutable executable model, complete-history certification, simulated plan, restart-restored workspace, controlled commit, and replayable receipts.

The repository recovery proof injected an unexpected action ahead of a valid queued action. Vanta executed and retained only the mismatching action, opened a counterexample, installed a revised immutable model, reran complete-history certification, and resumed the remaining action only after the new model passed.

## Executed proof

```bash
npm run schema:v1:proof
npm run desktop:schema-trace:smoke
npm run typecheck
npm run desktop:renderer:typecheck
npm run vanta -- lint \
  src/schema/release-proof-audit.ts \
  src/schema/release-proof-drivers.ts \
  src/schema/release-proof-task.ts \
  src/schema/release-proof-task-pipeline.ts \
  src/schema/release-proof-recovery.ts \
  src/schema/release-proof.ts \
  scripts/schema-v1-release-proof.ts
npm test
```

Observed integrated receipt:

- Repository task: certified, planned, restart-restored, committed, replayed; two timeline records, one controlled action, five sandbox receipts.
- Browser task: certified, planned, restart-restored, committed, replayed; two timeline records, one controlled action, five sandbox receipts.
- Recovery: stopped after the first mismatch, retained one queued action, recertified model version 2, and resumed successfully.
- Matched evaluation: generic and full-schema success rates both 100%; average real actions fell from 1.33 to 1.00; release evidence was reviewable.
- Desktop trace: match, mismatch, simulated-versus-real distinction, stop reason, model diff, backtest, recertification gate, resume, and compact 760-pixel layout all passed.
- Maintainability: all seven new source/script files passed Vanta's file, function, parameter, and complexity limits.
- Regression: 1,411 test files passed; 13,368 tests passed and three were intentionally skipped.

The final integrated evidence was persisted under `.vanta/release-proofs/schema-v1-lpO51r/`, including task timelines, model versions, workspace snapshots, counterexample, frozen evaluation report, and release receipt.

## Boundary

This proves deterministic local repository and system-Chrome tasks through the real Schema contracts. The matched evaluation uses controlled local fixtures; it establishes non-regression and fewer recovery actions for this release harness, not superiority across live paid providers, arbitrary websites, or unseen production workloads.

## Claim ledger

- Executed: real file mutation, real headless Chrome interaction, append-only replay, restart restoration, mismatch containment, model revision, complete-history recertification, controlled resume, desktop trace smoke, typechecks, size gate, and full test suite.
- Code-path only: behavior under third-party browser changes and external provider responses.
- Not established: universal task-model transfer, live-provider quality gains, or remote production reliability.
