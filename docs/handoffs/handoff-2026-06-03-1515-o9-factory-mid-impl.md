# Handoff — O9 Dark Factory: Mid-Implementation
Generated: 2026-06-03 15:15
Project: Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta (agent code in `argo-ts/`)
Branch: feat/v1-hermes-parity (5 commits ahead of origin — NOT pushed)

## What Was Accomplished This Session

1. **Fixed 4 live-session bugs** (committed `9193f39`):
   - Bug 1: `/path/file.mov` dropped in terminal was intercepted as slash command — fixed in `interactive.ts` + `tui/app.tsx` (first-token slash check)
   - Bug 2: video drops not auto-routed to `watch_video` — added `maybeDroppedVideo` to `repl-commands.ts`, wired in both surfaces
   - Bug 3: `look_at_screen` gave cryptic macOS error on Screen Recording denial — improved catch block with friendly message
   - Bug 4: agent claimed Desktop image paths were "out of scope" — updated `prompt.ts` rule 7 to explain `/image` + drag-drop bypass

2. **Wrote the O9 dark-factory implementation plan** (`docs/superpowers/plans/2026-06-03-o9-dark-factory-plan.md` — untracked, not committed yet)

3. **Implemented O9 Tasks 1–4** (all committed):
   - **Task 1** (`0fd0299`): `src/safety.rs` — `is_protected_path` + `extract_write_path` + integration into `assess_action`. 27 Rust tests pass.
   - **Task 2** (`9a1c7a8`): `argo-ts/src/factory/types.ts` — all factory types.
   - **Task 3** (`bbbe8be`): `argo-ts/src/factory/triage.ts` + `triage.test.ts` — pure parsers + `selectWorkItem`. 12 tests.
   - **Task 4** (`ed7939c`): `argo-ts/src/factory/verifier.ts` + `verifier.test.ts` — trust gate (protected paths, existing-test guard, new-test-fails-on-old-code, full suite, tsc). 10 tests.

## Files Changed (this session)

| File | Status | What Changed |
|------|--------|-------------|
| `argo-ts/src/interactive.ts` | Modified | Slash guard fix (Bug 1) + video routing (Bug 2) |
| `argo-ts/src/repl-commands.ts` | Modified | `maybeDroppedVideo` added |
| `argo-ts/src/repl-commands.test.ts` | Modified | `maybeDroppedVideo` test added |
| `argo-ts/src/tools/look-at-screen.ts` | Modified | Permission error hint (Bug 3) |
| `argo-ts/src/tools/look-at-screen.test.ts` | Modified | Minor |
| `argo-ts/src/prompt.ts` | Modified | Image path scope clarification (Bug 4) |
| `argo-ts/src/tui/app.tsx` | Modified | Slash guard fix (Bug 1) + video routing (Bug 2) |
| `src/safety.rs` | Modified | `is_protected_path` + `extract_write_path` + integration (Task 1) |
| `argo-ts/src/factory/types.ts` | Created | All factory types (Task 2) |
| `argo-ts/src/factory/triage.ts` | Created | Triage module (Task 3) |
| `argo-ts/src/factory/triage.test.ts` | Created | Triage tests (Task 3) |
| `argo-ts/src/factory/verifier.ts` | Created | Verifier trust gate (Task 4) |
| `argo-ts/src/factory/verifier.test.ts` | Created | Verifier tests (Task 4) |
| `docs/superpowers/plans/2026-06-03-o9-dark-factory-plan.md` | Created | Full 11-task implementation plan (UNTRACKED) |

## Current State

- **Tests:** 535 TS (vitest) + 27 Rust = **562 total, all passing**
- **tsc:** clean
- **Uncommitted:** only `docs/superpowers/plans/` (untracked) — commit it at start of next session
- **Branch:** `feat/v1-hermes-parity`, 5 commits ahead of origin, NOT pushed

## In Progress (not finished)

**O9 dark factory — Tasks 5–11 remain:**

| Task | File(s) | Status |
|------|---------|--------|
| 5 | `factory/executor.ts` + `executor.test.ts` | PENDING |
| 6 | `factory/planner.ts` + `planner.test.ts` | PENDING |
| 7 | `factory/run.ts` + `run.test.ts` | PENDING |
| 8 | `AGENT-MANIFESTO.md` | PENDING |
| 9 | `argo-ts/src/cli.ts` (add `vanta improve` + `vanta factory`) | PENDING |
| 10 | `argo-ts/src/gateway/run.ts` (spawn factory as detached child) | PENDING |
| 11 | `argo-ts/src/factory/CLAUDE.md` + `AGENTS.md` | PENDING |

Where left off: **Task 5 was just starting** (`TaskUpdate` to in_progress was the last action).

## Key Decisions (don't re-litigate)

1. **Review-mode only at first ship** — v0 ships with `autonomy: "review"`. `vanta improve` prints the plan and exits, requiring `vanta factory approve` to execute. Auto-mode requires an explicit `--promote` command (not silence = approval).
2. **`is_protected_path` mirrors in both layers** — `verifier.ts:checkNoProtectedPaths` duplicates the Rust logic in TS (intentional: verifier must not depend on a network call to the kernel for its own safety check).
3. **Executor uses `runAgent` for v0** — single agent, not swarm. Swarm is for v1 after trust is established.
4. **`__factory__` prefix on cron entries** — gateway detects factory cron entries by instruction prefix and spawns detached child instead of running inline.
5. **`git stash` / `stash pop`** for the "new test fails on pre-change code" check in `verifier.ts` — safe because the factory runs on its own branch (`factory/auto-<ts>`).

## Exact Next Steps (in order)

1. [ ] Commit the plan file: `git add docs/superpowers/plans/ && git commit -m "docs(o9): implementation plan"`
2. [ ] **Task 5: executor** — write `executor.test.ts` first, then `executor.ts`. Tests: `buildFactoryInstruction` includes budget + touched dirs; `parseTouchedFiles` splits git diff output. Implementation: `buildFactoryInstruction(plan, budget)` (pure) + `parseTouchedFiles(stdout)` (pure) + `execute(root, plan, budget)` (I/O: calls `runAgent`).
3. [ ] **Task 6: planner** — `buildPlan(item, root) → FactoryPlan`. Pure. Tests per WorkItem category.
4. [ ] **Task 7: run.ts** — orchestrator. Pure `checkGate` + `formatCycleLog` tested; I/O cycle is glue. Note: `CycleGate` type is defined locally in `run.ts` as `GateInputs` (not exported from `types.ts` — that addition to types.ts in the plan is optional).
5. [ ] **Task 8: AGENT-MANIFESTO.md** — create at repo root.
6. [ ] **Task 9: CLI** — add `vanta improve` and `vanta factory [approve|status]` to `cli.ts`.
7. [ ] **Task 10: Gateway** — detect `__factory__` cron entries in `gatewayTick`, spawn `vanta factory approve` as detached child.
8. [ ] **Task 11: docs** — `factory/CLAUDE.md` + `factory/AGENTS.md`.
9. [ ] Push everything: `git push`.

## Context That's Easy to Lose

- **Plan file is at:** `docs/superpowers/plans/2026-06-03-o9-dark-factory-plan.md` — has full task code. Read it before implementing each task.
- **`verifier.ts:checkNoProtectedPaths`** must stay in sync with `src/safety.rs:is_protected_path` — they duplicate the same logic intentionally (no network dep).
- **executor.ts `execute()`** must use dynamic imports (`await import(...)`) for all Node modules — this is ESM. No `require()`.
- **gateway/run.ts** currently imports `loadCron` from `schedule/cron.ts` inside `gatewayTick` via the `load?` injection. Task 10 intercepts before the existing `runDueTasks` call — don't refactor the existing tick logic, just add the factory-entry detection before it.
- **535 TS tests pass** right now — any regression is a bug in the new code.
- **Model guidance:** Sonnet 4.6 for mechanical implementation (all remaining tasks). Switch to Opus only for a new debugging session.
- **Gotcha:** `argo-ts/src/tools/tools.test.ts` has a sorted tool-name list — if you add a new tool, add its name there. The factory doesn't add new tools, so this doesn't apply here.

## Continuation Prompt

Paste this into a new Claude session to resume:

---
Resume Vanta O9 dark-factory implementation. Repo: `/Users/jasonpoindexter/Documents/GitHub/Vanta` (agent code in `argo-ts/`, branch `feat/v1-hermes-parity`, 5 commits ahead of origin — NOT pushed).

**First:** commit the plan file: `git add docs/superpowers/plans/ && git commit -m "docs(o9): implementation plan"`

**Context:** The O9 dark-factory feature gives Vanta an autonomous loop that improves its own codebase — one reviewable slice per cycle. The Rust kernel enforces that the factory can never edit `src/*.rs`, `argo-ts/src/factory/*.ts`, or `MANIFESTO.md` (via `is_protected_path` in `src/safety.rs`).

**Tasks 1–4 are DONE and committed:**
- Task 1: `src/safety.rs` — `is_protected_path` + write-assessor integration (27 Rust tests)
- Task 2: `argo-ts/src/factory/types.ts` — all types
- Task 3: `argo-ts/src/factory/triage.ts` + tests — reads vitest JSON/tsc stderr/ROADMAP/PARKED → WorkItem
- Task 4: `argo-ts/src/factory/verifier.ts` + tests — trust gate (protected paths, new-test-fails-on-old-code, full suite, tsc)

**535 TS + 27 Rust tests pass, tsc clean.**

**Tasks 5–11 remain.** Implementation plan (with full code for every step): `docs/superpowers/plans/2026-06-03-o9-dark-factory-plan.md`. Read it now.

**Pick up at Task 5 (executor).** Use the `superpowers:executing-plans` skill with that plan file to execute tasks 5–11 in order. After Task 11, push the branch.

**Key constraints:**
- v0 = review-mode only (`autonomy: "review"` default). `vanta improve` prints the plan and exits; `vanta factory approve` actually runs it.
- `executor.ts execute()` uses `runAgent` (single agent, not swarm) for v0.
- `verifier.ts:checkNoProtectedPaths` must mirror `src/safety.rs:is_protected_path` — they duplicate logic intentionally (no network dep on the kernel for the verifier's own checks).
- Gateway wiring: detect `__factory__`-prefixed cron instructions in `gatewayTick`, spawn `vanta factory approve` as a detached child (never inline). Don't refactor the existing tick logic.
- All new code uses ESM dynamic `import()` — no `require()`.
- Model: Sonnet 4.6 is correct for the remaining mechanical tasks.
---
