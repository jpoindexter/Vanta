# Schema Model Planner

Status: shipped 2026-07-17

## Outcome

Vanta can now search a certified executable task model before spending real actions. `planCertifiedModel` refuses copied or stale certification, validates the initial GroundedState, and runs every hypothetical transition through the strict deterministic model sandbox.

The default strategy is bounded breadth-first search for small discrete state spaces. A typed strategy interface can select frontier nodes or order actions for domain-specific and heuristic search while preserving the same budgets. Stable state hashes prune repeats.

Every report records expanded states, distinct states, repeated states, sandbox calls, maximum depth reached, plan cost, terminal prediction, and a typed stop reason. Search halts cleanly at maximum expanded states, distinct states, depth, or cost; invalid model output and sandbox failures fail closed.

Successful output is a `SimulatedPlan` with no executor. `controlledRequestsForPlan` can translate its actions into typed requests, but the only real-world route remains `commitActions`, including legal-action validation, risk, approval, idempotency, kernel gating, and post-commit mismatch detection.

## Executed Proof

Executed from `vanta-ts/` on macOS:

```text
npm test -- --run src/schema/model-planner.test.ts --maxWorkers=1
1 file, 4 tests passed

npm test -- --run src/roadmap src/schema --maxWorkers=1
25 files, 222 tests passed

npm run typecheck
passed

git diff --check
passed
```

The fixtures prove a shortest two-step BFS plan, exact terminal prediction, search metrics, conversion to controlled-commit requests, forged and stale certification refusal before simulation, repeated-state pruning, distinct-state explosion refusal, expanded/depth/cost budget stops, and a custom domain strategy under the same limits.
