# CLAUDE.md — vanta-ts/src/factory/

Dark factory: the bounded autonomous loop that improves Vanta's own codebase. One reviewable slice per cycle, kernel-enforced safety.

## Module map

| File | Responsibility |
|------|----------------|
| `types.ts` | `WorkItem`, `FactoryPlan`, `SliceArtifact`, `VerifyResult`, `CycleResult`, `FactoryConfig` |
| `triage.ts` | Reads vitest JSON + tsc stderr + ROADMAP + PARKED → `WorkItem \| null`. Pure parsers exported. |
| `preflight.ts` | `scoreAmbiguity`/`shouldClarify`/`buildPrefightNote` — pre-execution ambiguity gate (`run.ts` skips + surfaces too-vague items). `VANTA_PREFLIGHT_THRESHOLD` (default 0.5). Pure. |
| `planner.ts` | `buildPlan(item, root)` → `FactoryPlan`. Per-category agent instructions. Pure. |
| `executor.ts` | `execute(root, plan, budget)` → `SliceArtifact`. Runs agent + harvests touched files. |
| `verifier.ts` | `verify(root, artifact, preExisting)` → `VerifyResult`. All checks must pass. |
| `intent-judge.ts` | `checkIntentSatisfied` — LLM-as-judge intent gate (called by `verifier.ts`); fails OPEN so tests/tsc stay the hard floor. Pure `parseJudgeResponse`. |
| `holdout.ts` | FAC-HOLDOUT author-separation: `generateHoldout`/`validateAgainstHoldout` — a SEPARATE provider authors acceptance criteria + reviews the result. Built, **not yet wired** into `run.ts`. |
| `compartments.ts` | O11 — `classifyCompartment(file)` → tier · `compartmentMaxAutonomy(tier)` → max L · `autonomyCapForFiles(files)` → most-restrictive cap. Pure. |
| `run.ts` | `runCycle(config, log, deps?)` → `CycleResult`. Orchestrates the full cycle. Pipeline stages (triage/buildPlan/execute/verify/listPreExistingFiles) are injected via `FactoryDeps` (default `defaultFactoryDeps` = the real stages) — swap the executor/planner/verifier without editing the orchestrator (ports/adapters, DECISIONS 2026-06-17). `withCodeMap` prepends a code-intelligence code map to the executor instruction (additive + guarded, no-op when no engine; CODE-INTEL-FACTORY-WIRING). The verify gate is deliberately NOT scoped down by code_affected (never weaken the safety gate on a heuristic). Git lifecycle (branch/commit/push/merge) is still inline — a VCS adapter is a noted follow-on. |

## Safety invariants (do not change without a kernel update)

- Files in this folder (`*.ts`) are kernel-protected. No autonomous write can touch them.
- `MANIFESTO.md` is kernel-protected. `AGENT-MANIFESTO.md` is writable.
- `verifier.ts:checkNoProtectedPaths` must mirror `src/safety.rs:is_protected_path` exactly.

## Autonomy ladder (O10)

`config.autonomyLevel: 1|2|3|4` controls how far a cycle proceeds after a clean verify
(`resolveAutonomyLevel(sub, env)` maps CLI + `VANTA_AUTONOMY_LEVEL` → level):

| L | name | stops after | CycleResult |
|---|------|-------------|-------------|
| 1 | suggest | print plan (no branch) | `aborted` |
| 2 | implement | branch → execute → verify | `implemented` |
| 3 | commit | + commit (no push) | `committed` (pushed:false) |
| 4 | push | + push branch | `committed` (pushed:true) |
| 5 | merge | + auto-merge low-risk slice (gated) | `merged` |

The kernel's `is_protected_path` blocks skeleton/brainstem edits at EVERY level — the ladder
governs reach over writable code only. `improve`/review = L1; `approve` = `VANTA_AUTONOMY_LEVEL`
(default 4).

### L5 auto-merge (O10b — `merge.ts`)

The factory's git lifecycle (branch/commit/push/merge) runs git **directly, outside** the
kernel `assess()` gate. A merge adds no new content (the verifier already vetted the slice),
so the **entire** safety story at merge time is `assessMergeRisk` — pure, exhaustively tested,
fails closed. Three independent gates must ALL pass or the cycle stays at L4 push:

1. **armed** — `VANTA_AUTONOMY_ALLOW_MERGE` set (default OFF; L5 silently lands at L4 otherwise)
2. **safe target** — `resolveMergeTarget` (`VANTA_FACTORY_MERGE_TARGET`, default `factory/integration`); never `main`/`master`; merge is `--no-ff`, never force; target must already exist (a missing/conflicting merge aborts and restores HEAD)
3. **low-risk** — limbs/reflexes/memory only (via O11 `autonomyCapForFiles`), no dep/env/config/migration file, ≤`MAX_MERGE_FILES` files & ≤`MAX_MERGE_DIFF_LINES` lines

## Compartments (O11)

After a clean verify, `run.ts` clamps the requested level to the most restrictive
compartment among the files the slice **actually touched** (`compartments.ts:autonomyCapForFiles`):

| Tier | Files | Max L | Rationale |
|------|-------|-------|-----------|
| skeleton | kernel `src/*.rs`, `Cargo.*`, `factory/*.ts`, `MANIFESTO.md` | 0 | never autonomous (also hard-blocked by the kernel) |
| brainstem | `agent.ts`, `providers/`, `prompt.ts`, `context.ts`, `session.ts`, `safety-client.ts`, `kernel-launcher.ts`, `scope.ts` | 2 | changes how Vanta decides → implement, then STOP for review |
| reflexes | `skills/`, `skills-library/` | 5 | self-evolving skill data |
| memory | `brain/`, `memory/` | 5 | self-knowledge |
| limbs | `tools/` + all other app code (default) | 5 | freely improvable |

A mixed slice takes the **minimum** cap (a tool + `agent.ts` → L2). So a brainstem fix
can't auto-commit even when `VANTA_AUTONOMY_LEVEL=4`; only limbs/reflexes/memory reach the
full ladder. This is the soft policy the kernel can't express; `is_protected_path` is still
the hard boundary (skeleton would fail verify before the clamp ever runs).

## Entry points

- `vanta improve` → `runCycle` at **L1** (suggest — prints plan, exits)
- `vanta factory approve` → `runCycle` at **L4** by default; `VANTA_AUTONOMY_LEVEL=2|3` stops earlier
- `vanta factory status` → shows lockfile + last log entry
- gateway cron `__factory__` → gateway spawns `vanta factory approve` as detached child
