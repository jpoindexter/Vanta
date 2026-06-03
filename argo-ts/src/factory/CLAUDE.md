# CLAUDE.md — argo-ts/src/factory/

Dark factory: the bounded autonomous loop that improves Argo's own codebase. One reviewable slice per cycle, kernel-enforced safety.

## Module map

| File | Responsibility |
|------|----------------|
| `types.ts` | `WorkItem`, `FactoryPlan`, `SliceArtifact`, `VerifyResult`, `CycleResult`, `FactoryConfig` |
| `triage.ts` | Reads vitest JSON + tsc stderr + ROADMAP + PARKED → `WorkItem \| null`. Pure parsers exported. |
| `planner.ts` | `buildPlan(item, root)` → `FactoryPlan`. Per-category agent instructions. Pure. |
| `executor.ts` | `execute(root, plan, budget)` → `SliceArtifact`. Runs agent + harvests touched files. |
| `verifier.ts` | `verify(root, artifact, preExisting)` → `VerifyResult`. All checks must pass. |
| `run.ts` | `runCycle(config, log)` → `CycleResult`. Orchestrates the full cycle. |

## Safety invariants (do not change without a kernel update)

- Files in this folder (`*.ts`) are kernel-protected. No autonomous write can touch them.
- `MANIFESTO.md` is kernel-protected. `AGENT-MANIFESTO.md` is writable.
- `verifier.ts:checkNoProtectedPaths` must mirror `src/safety.rs:is_protected_path` exactly.

## Entry points

- `argo improve` → `run.ts runCycle` (review mode — prints plan, exits)
- `argo factory approve` → `run.ts runCycle` (auto mode — executes plan)
- `argo factory status` → shows lockfile + last log entry
- gateway cron `__factory__` → gateway spawns `argo factory approve` as detached child
