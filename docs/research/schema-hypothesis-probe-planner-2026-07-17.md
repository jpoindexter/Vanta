# Schema Hypothesis Probe Planner

Status: shipped 2026-07-17

## Outcome

Vanta can now preserve multiple plausible task explanations instead of collapsing ambiguity into one guessed mechanism. A versioned hypothesis ledger stores each explanation's prior weight, active or rejected state, planned predictions, supporting transition IDs, refuting transition IDs, probe results, and optional source counterexample.

`planDiscriminatingProbes` evaluates only candidates that predict an outcome for every active hypothesis and whose predictions actually differ. It computes weighted expected information gain, subtracts side-effect cost, risk, approval, external-action, and irreversibility penalties, sorts deterministically, and returns at most three probes. The planner does not execute actions; its typed action and risk output must still enter the real world through the controlled commit gate.

`adjudicateProbeResult` records observed evidence against the predictions. Matching evidence remains provisional support while contradictions reject the falsified explanation. An unavailable observation is explicitly `inconclusive` and adds no support or refutation.

Ledgers are atomically persisted under the Vanta data directory so predictions and evidence survive process boundaries.

## Executed Proof

Executed from `vanta-ts/` on macOS:

```text
npm test -- --run src/schema/hypothesis.test.ts
1 file, 3 tests passed

npm test -- --run src/schema/model-sandbox.test.ts
1 file, 9 tests passed

npm test -- --run src/roadmap src/schema --maxWorkers=1
24 files, 218 tests passed

npm run typecheck
passed

git diff --check
passed
```

The fixtures prove a reversible low-risk probe ranks above a high-risk external action for two equally plausible hypotheses, non-discriminating candidates are excluded, output is capped at three, predictions survive persistence, contradictory evidence rejects one hypothesis, supporting evidence remains provisional, and missing evidence confirms nothing.

## Test Boundary

A parallel all-Schema run produced one transient timeout/failure in the deterministic sandbox fixture while all denial and limit fixtures passed. The exact sandbox file then passed all nine tests in isolation. Final acceptance runs the Schema suite with one worker to avoid parallel Seatbelt resource contention; this card does not claim the existing parallel timing issue is resolved.
