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

## Autonomy ladder (O10)

`config.autonomyLevel: 1|2|3|4` controls how far a cycle proceeds after a clean verify
(`resolveAutonomyLevel(sub, env)` maps CLI + `ARGO_AUTONOMY_LEVEL` → level):

| L | name | stops after | CycleResult |
|---|------|-------------|-------------|
| 1 | suggest | print plan (no branch) | `aborted` |
| 2 | implement | branch → execute → verify | `implemented` |
| 3 | commit | + commit (no push) | `committed` (pushed:false) |
| 4 | push | + push branch | `committed` (pushed:true) |
| 5 | merge | *reserved — clamps to 4* | — |

The kernel's `is_protected_path` blocks skeleton/brainstem edits at EVERY level — the ladder
governs reach over writable code only. `improve`/review = L1; `approve` = `ARGO_AUTONOMY_LEVEL`
(default 4). L5 auto-merge + a low-risk classifier is the next slice.

## Entry points

- `argo improve` → `runCycle` at **L1** (suggest — prints plan, exits)
- `argo factory approve` → `runCycle` at **L4** by default; `ARGO_AUTONOMY_LEVEL=2|3` stops earlier
- `argo factory status` → shows lockfile + last log entry
- gateway cron `__factory__` → gateway spawns `argo factory approve` as detached child
