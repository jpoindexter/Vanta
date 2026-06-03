# O9 — Self-Improving Codebase ("Dark Factory") — Design

> Status: **approved design, pre-implementation.** Date: 2026-06-03.
> North star: [`MANIFESTO.md`](../../../MANIFESTO.md) · build order: [`ROADMAP.md`](../../../ROADMAP.md) · cold-start: [`HANDOFF.md`](../../../HANDOFF.md).
> This is the one feature the manifesto + handoff explicitly say to design slowly: an
> autonomous loop that **edits its own codebase**. The whole point of the design is the
> safety model, not the loop.

---

## 1. What it is, in one line

A bounded autonomous loop that improves Argo's *own* repository — fixes code quality,
closes failing tests, ships ROADMAP/PARKED items — one reviewable slice per cycle, under
the Rust kernel's hard lines, never able to weaken its own guardrails, fully stoppable.

## 2. Done line (v0)

> **Done = a scheduled (or `argo improve`-triggered) cycle picks the highest-value work
> item, builds it on its own branch with tests, verifies it for real, and commits + pushes
> a reviewable slice — in review mode, where a human approves the plan before any code is
> written — and the kernel provably blocks it from editing the kernel, the factory loop, or
> the human manifesto.**

v0 ships **review-mode only**. The full auto-mode machinery (§7) is *designed here* and
*enforced at graduation*, not switched on at first ship. This keeps blast radius narrow
while the trust model is proven.

## 3. Triggers (decision D)

Two entry points, one implementation (`factory/run.ts`):

- **Scheduled** — a cron entry in `~/.argo/crons/`; the existing `argo gateway` daemon
  (`argo-ts/src/gateway/run.ts`, already ticking every 60s) fires it. The gateway does **not**
  run the cycle inline — it **spawns `argo factory` as a detached child process** so a
  multi-hour cycle never blocks the gateway tick. (Hybrid of approach 1's module + approach
  2's process isolation.)
- **On-demand** — `argo improve` calls `factory/run.ts` inline and streams progress to the
  TUI. Same code path; `interactive: true`.

A lockfile (`~/.argo/factory.lock`) prevents the gateway from double-spawning. `argo improve`
checks the lock and reports "factory already running" rather than racing.

## 4. Scope of work (decision D, priority-ordered)

Each cycle's triage walks this stack and takes the **first** category with a concrete item:

1. **Code quality** — files over the size budget, functions over complexity budget, dead code.
2. **Failing tests / type errors** — `vitest run --reporter=json` failures, `tsc --noEmit` stderr.
3. **ROADMAP items** — first unchecked `- [ ]` in `ROADMAP.md`.
4. **PARKED ideas** — first promotable item in `PARKED.md`.

Triage reads **concrete artifacts, not vibes** — JSON test output, compiler stderr, checkbox
parse. Deterministic inputs, LLM only to rank/select among real candidates.

## 5. Architecture

```
argo-ts/src/factory/
  run.ts        orchestrator: gate → snapshot → triage → branch → plan → execute → verify → commit. Owns lock + budget (too small to split).
  triage.ts     reads concrete inputs (vitest json, tsc stderr, ROADMAP, PARKED) → WorkItem | null
  planner.ts    builds factory.plan.json (one slice); renders to TUI when interactive; gates on approval in review mode
  executor.ts   swarm/delegate dispatch for the slice + co-located tests + per-folder CLAUDE.md/AGENTS.md update
  verifier.ts   the trust gate: new-test-fails-on-old-code · full prior suite passes · tsc clean · no protected path touched
  types.ts      WorkItem · CycleResult · AutonomyLevel · FactoryConfig
```

Entry wiring:
- `argo improve` → CLI command → `factory/run.ts` (`interactive: true`).
- gateway cron → spawns `argo factory` (`argo-ts/src/cli/factory.ts`) as a **detached child** → `factory/run.ts` (`interactive: false`).

The factory loop is an **orchestrator**, not a monolith: actual code generation is delegated
to `swarm`/`delegate` workers (existing). `run.ts` sequences, gates, and verifies.

### Token frugality (decision D — three layers)

1. **Backlog check** — triage runs only if the priority stack has a concrete item. Empty → exit ~0 cost. Prevents invented busywork (a token *and* safety failure mode).
2. **Cheap triage** — selection uses the local Ollama model on the M4 Pro (prefer-local routing, existing). Near-zero cost; frontier model only spins up for actual code generation.
3. **Hard ceiling** — `ARGO_FACTORY_BUDGET` (default 80_000 output tokens/cycle). On hit: commit whatever is verified-complete, log `budget reached`, stop clean. Spend reported in the commit message.

## 6. Safety model (the heart)

Every guardrail is tested against one question — the whole Argo thesis (hard line 2):
**does it survive the factory editing its own code?** A guard that lives only in
`factory/*.ts` fails: the factory could edit it away. So the load-bearing guards live in
the **Rust kernel**, where the agent layer cannot rewrite them.

### 6.1 Protected paths — kernel-enforced, a new rule class

The existing kernel allows all of these *today*: kernel `src/*.rs`, `factory/*.ts`, and
`MANIFESTO.md` are all in-root, so `inside_scope` (`src/safety.rs:98`) returns `true`.
Protected-paths is therefore a **new rule class — in-root-but-forbidden**, not a tightening
of the existing scope check.

New kernel function `is_protected_path(path: &Path, root: &Path) -> bool` and a write-assessor
that consults it. A write whose target matches the protected set returns `Risk::Block`
(`needs_human: true`) and can only be cleared by **out-of-band human approval** — the existing
`approvals` queue *driven by a human at the CLI*, never a decision the factory can enqueue-and-
self-approve.

Protected set (in-root, forbidden to autonomous writes):
- Kernel `src/*.rs` + `Cargo.toml` / `Cargo.lock` / build files — the safety boundary itself.
- `argo-ts/src/factory/*.ts` — the driver loop can't rewrite its own guardrails.
- The kernel safety tests (`src/safety.rs` tests, `argo-ts/src/factory/*.test.ts`).
- `MANIFESTO.md` — the human north star (see 6.2).
- The protected-list definition itself.

**Writable** (explicitly *not* protected): `ROADMAP.md` (it must tick checkboxes),
`AGENT-MANIFESTO.md`, per-folder `CLAUDE.md`/`AGENTS.md`, and all feature code outside the set.

### 6.2 Two manifestos (decision: split)

- **`MANIFESTO.md`** — human-authored, **kernel-protected, hard block.** The line that
  doesn't move. The factory can never touch it.
- **`AGENT-MANIFESTO.md`** — agent-authored, **editable.** Argo's own evolving declaration
  of what it is and what it's doing. Diffing it over time is a transparency ledger of how the
  agent's self-model changed. (Natural home for the S1 selfhood track.)

Separation of concerns: "the line that doesn't move" (human) vs "what the agent is becoming"
(agent, auditable).

### 6.3 Verification that can't be self-faked (hard line 3)

The factory writes the code *and* the tests *and* runs them — so "verified" needs a contract
that a self-interested author can't game:

- **Full pre-existing suite must pass.** It didn't write those this cycle → a trustworthy
  regression catch.
- **May ADD tests; may NOT modify or delete existing tests** without out-of-band approval.
  Kills "weaken the test until the bad change passes."
- **New tests must fail against pre-change code.** `verifier.ts` stashes the slice, runs the
  new test, asserts it **fails**, then restores — cheap, strong proof the test actually
  exercises the change. A new test that passes on old code tests nothing → slice rejected.
- **`tsc --noEmit` clean.**
- **No protected path touched** (kernel re-checks every written path; a touch = hard fail).

### 6.4 Execute → verify → commit (never execute → commit → rollback)

Bad code never enters git history. On verify failure: `git checkout .` discards the unstaged
slice. No `git reset`, no history rewrite, no destructive rollback. (`reset --hard` is itself
on the kernel `DATA_LOSS` denylist — `src/safety.rs:38`.)

### 6.5 Own-branch isolation

Each cycle works on `factory/auto-<YYYY-MM-DD-HHMM>` branched off the current branch — never
the human's working branch. Fixes branch-collision with a live `argo run` session and makes
every cycle a reviewable PR. The human merges deliberately.

### 6.6 Bail conditions (stoppability — constraint 4)

- **Kill switch:** `ARGO_FACTORY_DISABLED` checked **kernel-side** at the top of every cycle —
  covers the unattended 3am path where there's no Ctrl+C. (Interactive runs also honor SIGINT
  via the existing AbortSignal.)
- **Dirty tree / active session → bail.** The lockfile only covers factory-vs-factory; an
  uncommitted human working tree means a live session — the factory exits without touching it.
- **Lockfile** — one cycle at a time.

### 6.7 Snapshot own source at cycle start

The running factory pins the hash of its own modules (`factory/*.ts`, kernel) at cycle start.
If a cycle's work proposes edits to its own modules, those land as a **protected-path block**
(6.1) requiring human approval + a manual restart — the factory never hot-swaps the code it is
currently executing.

### 6.8 Autonomy is earned by *active* approval, never silence

`review` → `auto` graduation requires an explicit `argo factory approve --promote` after a run
of clean cycles. **"Jason didn't revert" is not approval** — rubber-stamping must not promote.
And a revert of a factory commit (detected at next triage via `git log`) **auto-demotes** to
`review`. Trust is earned and retained, not assumed.

In unattended `auto` mode, anything that *would* require approval (a protected path, a
`Risk::Ask` action) is **deferred to the existing kernel approval queue** (`src/approvals.rs`,
surfaced by `argo approvals` / the TUI) for the human to clear at their next session — never
auto-approved at 3am. The factory does only what is auto-safe.

## 7. One cycle, end to end

```
1. GATE      kernel: ARGO_FACTORY_DISABLED? · lockfile free? · tree clean / no active session?  — else bail
2. SNAPSHOT  pin factory's own source + kernel hash for the cycle
3. TRIAGE    local model reads vitest --reporter=json, tsc stderr, ROADMAP, PARKED → WorkItem | null;  null → exit clean (~0 cost)
4. BRANCH    git checkout -b factory/auto-<ts>
5. PLAN      build factory.plan.json (ONE slice).  review-mode → render + wait for `argo factory approve`.  auto-mode → proceed
6. EXECUTE   swarm/delegate builds slice + co-located tests + updates CLAUDE.md & AGENTS.md in every touched folder; budget enforced
7. VERIFY    new test fails on pre-change code? · full prior suite passes? · tsc clean? · no protected path touched?  — ALL must hold
8. COMMIT    pass → git commit + push to factory/auto-<ts>; tick ROADMAP box; commit + push that too
             fail → git checkout . (discard; nothing entered history); log; exit
9. LOG       ~/.argo/logs/factory-<ts>.log · token spend in the commit message · `argo factory status` shows last result
```

**One slice per cycle** (decision) — one self-contained, reviewable commit. Multi-slice trades
reviewability for throughput; wrong trade until trust is established. Revisit post-trust.

## 8. Documentation discipline (standing requirement)

The factory updates docs **as part of the slice that changes code**, never as a skippable
post-step:
- Every folder it touches gets/keeps a `CLAUDE.md` and an `AGENTS.md` (file map + env + purpose).
- Completing a ROADMAP item ticks its checkbox in `ROADMAP.md` and commits that.
- `HANDOFF.md` / `DECISIONS.md` updated when a cycle makes a decision worth recording.
- Every slice commits **and pushes** (the standing Argo convention).

This is inlined in `executor.ts` per slice — a separate docs module would be skippable; an
inlined step cannot be.

**Token discipline — index, don't inject.** A `CLAUDE.md` + `AGENTS.md` in every folder, all
read at session start, is the skill-bloat problem in a new costume. Argo already solved this for
skills (index injection + on-demand body load) and uses the **same pattern** here: the agent
reads a folder's `CLAUDE.md`/`AGENTS.md` **only when it works in that folder**, never all-at-once.
The root docs (`CLAUDE.md`, `AGENTS.md`) carry a one-line pointer to subfolder docs; the body is
loaded lazily on entry. This keeps per-folder context useful without burning the context window
on every folder up front.

## 9. Testing

Every module is pure-testable:
- **`triage`** — fixture inputs (sample vitest json / tsc stderr / ROADMAP) → expected `WorkItem`.
- **`verifier`** — the critical tests: a slice whose new test *passes on old code* is **rejected**;
  a slice that *modifies an existing test* is **rejected**; a slice touching a *protected path* is **rejected**.
- **`run`** — gate logic (disabled flag, dirty tree, lock all bail); budget ceiling stops cleanly.
- **Kernel (Rust)** — `is_protected_path` blocks a write to `src/safety.rs` and to
  `factory/run.ts`, and **allows** a write to `ROADMAP.md` and `AGENT-MANIFESTO.md`.

The kernel protected-path tests are the load-bearing ones: they are what makes the safety model
*enforced, not advisory*.

## 10. Out of scope (v0) — parked

- **Auto-mode at first ship** — designed (§6.8), enforced at graduation. v0 = review-mode only.
- **Multi-slice cycles** — one slice/cycle until trust established.
- **Per-project autonomy level** — YAGNI until Argo is multi-root.
- **`argo factory logs --follow`** — nice-to-have; `status` + the log file cover v0.
- **B-v2 emergent self-designed brain** — separate research track; `AGENT-MANIFESTO.md` is the
  bootstrap surface, not B-v2 itself.

## 11. Manifesto hard-line traceability

| Hard line | How O9 honors it |
|---|---|
| 1 Goal before tool | Triage is goal-driven (ROADMAP/PARKED are the goals); empty backlog → no action. |
| 2 Safety enforced, not advisory | Protected paths + kill switch live in the Rust kernel; the factory cannot edit them. |
| 3 Verified output only | §6.3 — full prior suite + new-test-fails-on-old-code; no self-faked green. |
| 4 Approval before risk | Risky/protected actions deferred to a human queue, never self-approved. |
| 5 Honest about limits | Verify fail → discard + log, never a faked commit. Budget hit → stop + report. |
| 6 Learns and keeps it | Skills/memory unchanged; `AGENT-MANIFESTO.md` is git-versioned, readable. |
| 7 Privacy-first | No new external surface; local-model triage by default. |
| 8 Ship, don't drift | One verified slice/cycle, committed + pushed before the next. |
