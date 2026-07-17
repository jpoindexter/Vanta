# Schema Model Quality Ledger

Status: shipped 2026-07-17

## Outcome

Schema model trust and execution cost are now measurable per run. `finalizeSchemaRunQuality` creates a redacted scorecard and persists it before returning, making it the canonical Schema run-finalization boundary.

Each scorecard records model and representation provenance, timeline hash, exact/partial/skipped/untested/contradicted coverage, prediction-error counts by field and kind, model revisions, representation changes, probe cost, simulated sandbox and expansion cost, real committed and verified action efficiency, plan aborts, and later-stage transfer success.

Belief state is explicit:

- `exact` requires a live complete-history certification and complete exact coverage;
- `partial` records partial, skipped, or uncheckable evidence;
- `contradicted` records at least one prediction mismatch;
- `untested` covers remaining non-certified states.

Only `exact` can display `certified: true`. Predicted and observed values never enter the scorecard; mismatch paths and counts are retained without raw observations.

`/schema-quality` shows the latest scorecard, while `/schema-quality summary` aggregates durable runs. The typed quality receipt carries the same belief and certification state. Aggregation keeps simulated sandbox calls separate from real attempted, committed, and verified actions.

## Executed Proof

Executed from `vanta-ts/` on macOS:

```text
npm test -- --run src/schema/quality-ledger.test.ts src/repl/schema-quality-cmd.test.ts --maxWorkers=1
2 files, 4 tests passed

npm test -- --run src/roadmap src/schema src/repl/schema-quality-cmd.test.ts --maxWorkers=1
28 files, 229 tests passed

npm run typecheck
passed

git diff --check
passed
```

The fixtures prove redaction, provenance, all required cost/quality metrics, incomplete-certification refusal, partial and contradicted beliefs, canonical scorecard persistence, latest and aggregate CLI output, receipt parity, and simulated-versus-real action accounting across runs.
