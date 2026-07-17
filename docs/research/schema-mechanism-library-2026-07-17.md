# Schema mechanism library

Date: 2026-07-17

Roadmap card: `SCHEMA-MECHANISM-LIBRARY`

## Outcome

Vanta now promotes a task rule into reusable Schema knowledge only when the source task model has a live complete-history certification, every supporting transition belongs to both the certified timeline and model lineage, at least one historical counterexample is retained, and every held-out task replay certifies exactly.

The accepted proposal is projected through the existing learned-skill safety gate before adoption. Accepted mechanisms are stored as immutable typed versions under `schema/mechanisms/<id>/versions`; an atomic active pointer selects the current version. A later certified proposal creates a new version with `supersedesVersion` instead of rewriting prior evidence.

## Transfer behavior

`retrieveMechanisms` returns relevant active mechanisms with their executable source, generated types, origin provenance, support, counterexamples, and held-out replay receipts. A failed transfer requires a pointed counterexample and creates a new scoped version that excludes only the incompatible task. The prior version and all evidence remain readable. Successful and failed transfer receipts remain append-only.

`mechanismLibraryStats` reports mechanism count, reuse attempts, successful reuse, regressions, reuse rate, and regression rate from those receipts.

## Executed proof

```bash
npx vitest run \
  src/schema/mechanism-library.test.ts \
  src/schema/backtest.test.ts \
  src/schema/task-model.test.ts \
  src/schema/counterexample.test.ts \
  src/schema/quality-ledger.test.ts \
  src/learning/eval-gate.test.ts \
  src/learning/loop.test.ts
npm run typecheck
npm test
git diff --check
```

Observed results:

- Mechanism acceptance, rejection, transfer scoping, retrieval, metrics, and immutable adaptation: 4/4 tests passed through the real macOS Schema sandbox.
- Adjacent Schema and self-learning contracts: 36/36 tests passed.
- Complete repository suite: 1,409 test files and 13,363 tests passed, with three intentional skips.
- Core TypeScript and diff checks passed.

## Boundary

Executed: certified source replay, held-out replay, self-learning gate adoption, immutable persistence, scoped failure revision, retrieval, and transfer metrics.

Not established: automatic discovery of mechanism candidates from arbitrary production transcripts, cross-machine synchronization, or transfer quality on external live services.
