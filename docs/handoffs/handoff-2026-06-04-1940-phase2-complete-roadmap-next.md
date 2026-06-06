# Handoff — Phase 2 EF Complete → Continuing Roadmap
Generated: 2026-06-04 19:40
Project: Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta
Branch: feat/v1-hermes-parity

---

## What Was Accomplished (this session)

1. **EF-WORKINGMEM** — `/where` slash command (last intent + last 5 tool breadcrumb); `activeGoalText` threaded through `AgentDeps` → `compressMessages` opts → goal-reminder note re-injected after system messages on compression.

2. **EF-INHIBIT** — Session-scoped drift counter (3 consecutive non-output turns → alert). `repl/inhibit.ts` pure state machine; `session.ts inhibitAfterTurn`; wired in `interactive.ts` + `use-agent-send.ts`.

3. **EF-SETSHIFT** — Stuck-loop detector (same primary tool 3 consecutive turns → "different angle?" alert). `repl/set-shift.ts`. **Also:** ERRORS.md auto-read in `prepareRun` → `errorsLogTier` in `buildSystemPrompt` (capped 3k chars). `VANTA_SETSHIFT_THRESHOLD` env override.

4. **EF-SELFMONITOR** — Zero-latency pre-execution heuristic in `agent.ts dispatchTool`: if action is destructive AND goal is additive → one-line `onText` warning before `tool.execute`. `repl/self-monitor.ts`.

5. **EF-ERRORDETECT** — Consecutive `ok:false` / error-keyword failure tracker in `runTurn`. At 3 fires `onText` note + optional `deps.onIterationCheck?` callback. `repl/error-detect.ts`. `DispatchOutcome` gained `ok` field.

6. **EF-CLOSUREGATE** — On topic shift: scans `convo.messages` for `write_file` calls without a subsequent `git commit` in messages → surfaces list. `repl/closure-gate.ts`; wired pre-turn in `interactive.ts` + `use-agent-send.ts`.

7. **Context sync** — `argo-ts/CLAUDE.md` and root `CLAUDE.md` updated; project memory written.

---

## Files Changed

| File | Status | What Changed |
|------|--------|-------------|
| `argo-ts/src/repl/where.ts` | Created | `/where` handler — `lastIntent`, `lastToolCalls` |
| `argo-ts/src/repl/where.test.ts` | Created | 10 tests |
| `argo-ts/src/repl/inhibit.ts` | Created | `InhibitState` drift state machine |
| `argo-ts/src/repl/inhibit.test.ts` | Created | 11 tests |
| `argo-ts/src/repl/set-shift.ts` | Created | `SetShiftState` stuck-loop detector |
| `argo-ts/src/repl/set-shift.test.ts` | Created | 15 tests |
| `argo-ts/src/repl/self-monitor.ts` | Created | `shouldWarn`, `isDestructiveAction`, `isAdditiveGoal` |
| `argo-ts/src/repl/self-monitor.test.ts` | Created | 11 tests |
| `argo-ts/src/repl/error-detect.ts` | Created | `isErrorResult`, `buildErrorDetectText` |
| `argo-ts/src/repl/error-detect.test.ts` | Created | 7 tests |
| `argo-ts/src/repl/closure-gate.ts` | Created | `extractWrittenFiles`, `hasCommitAfterIndex`, `getInProgressItems` |
| `argo-ts/src/repl/closure-gate.test.ts` | Created | 10 tests |
| `argo-ts/src/repl/handlers.ts` | Modified | Import + register `/where`; STILL 300 lines |
| `argo-ts/src/repl/catalog.ts` | Modified | Added `/where` entry |
| `argo-ts/src/context.ts` | Modified | `TrimOptions.activeGoalText?`; goal note injected in `compressMessages` |
| `argo-ts/src/context.test.ts` | Modified | 2 new tests for goal injection |
| `argo-ts/src/agent.ts` | Modified | `AgentDeps`: `activeGoalText?`, `onIterationCheck?`; `DispatchOutcome.ok`; self-monitor + error-detect wired |
| `argo-ts/src/prompt.ts` | Modified | `errorsLogTier` + `errorsLog?` param to `buildSystemPrompt` |
| `argo-ts/src/prompt.test.ts` | Modified | 2 new tests for errorsLog |
| `argo-ts/src/session.ts` | Modified | `inhibitAfterTurn`, `setShiftAfterTurn` exported; `prepareRun` reads ERRORS.md |
| `argo-ts/src/interactive.ts` | Modified | `inhibitState`, `setShiftState` refs; closure gate wired pre-turn |
| `argo-ts/src/tui/use-agent-send.ts` | Modified | `inhibitRef`, `setShiftRef`; closure gate wired |
| `argo-ts/src/cli.ts` | Modified | `activeGoalText` wired into `AgentDeps` |
| `roadmap.json` | Modified | EF-WORKINGMEM/INHIBIT/SETSHIFT/SELFMONITOR/ERRORDETECT/CLOSUREGATE → shipped |
| `CLAUDE.md` | Modified | Status line updated; Phase 2 EF listed |
| `argo-ts/CLAUDE.md` | Modified | File map for 6 new repl/ modules; agent/context/prompt/session rows updated |

---

## Current State

- **Tests:** 935 passing, 0 failing (123 test files)
- **Typecheck:** tsc clean
- **Uncommitted:** None — clean tree
- **Branch:** `feat/v1-hermes-parity`, up to date with origin
- **Roadmap:** 67 shipped / 0 building / 0 next / **38 horizon**

---

## In Progress (not finished)

Nothing. Clean slate.

---

## The 38 Horizon Items (grouped by cluster)

### Cluster A — TUI Polish (all S/M, low-risk, self-contained)
*Best place to start — visual wins, no schema changes, easy to test.*

| ID | Size | Title |
|----|------|-------|
| TUI-SHORTCUTS | S | Prefix shortcuts: `!` for bash, `#` for memory |
| TUI-STATUS | S | Persistent rich status line (model · goals · turn count) |
| TUI-THINK | S | Thinking/reasoning display (collapsible) |
| TUI-THEME | S | Themes incl. high-contrast / dyslexia accessibility |
| TUI-VIM | S | Vim-mode composer editing |
| TUI-HELP | S | Keyboard shortcut help overlay |
| TUI-CMD | M | Custom user slash commands (user-defined aliases) |

### Cluster B — EF Phase 3 (S, direct continuations)
| ID | Size | Title |
|----|------|-------|
| EF-SCOPEDELTA | S | Scope delta tracker — counts topics per turn (while-we-are-at-it guard) |
| EF-WORKINGMEM-MANIP | S | Working memory manipulation mode (dorsolateral PFC analog) |

### Cluster C — Memory Foundation (build from S upward)
*Start with the S items; M/L follow once the S foundation exists.*

| ID | Size | Title |
|----|------|-------|
| PROJ-IDENTITY | S | Canonical project identity from git remote URL |
| MEM-HOOKS | S | Claude Code Stop/PreCompact hooks for Vanta memory |
| MEM-WORKINGMEM | S | Working memory (hot session cache + injection) |
| MEM-VERSIONING | S | Memory versioning (supersedes chain, no data loss) |
| MEM-WORKTREE | S | Worktree-aware project identity for memory scoping |
| MEM-TIMESTAMPS | S | Conversation timestamps in memory (not ingest time) |
| MEM-VERBATIM | M | Verbatim session archive + semantic search |
| MEM-STRUCT | M | Structured memory hierarchy (goals > sessions > turns) |
| MEM-COMPRESS | M | Observation compression pipeline (raw event → facts → memory) |
| MEM-LAYERS | M | Multi-tier memory injection (avoid dark-memory gap) |
| MEM-GRAPH | L | SQLite knowledge graph (goals × entities × decisions) |
| BRAIN-5D | L | Multi-dimensional brain (5D: type × time × strength × relations × decay) |
| BRAIN-SALIENCE | M | Two-network brain: salience network + executive control |
| BRAIN-NEURO | L | Full neurocognitive brain architecture (12-axis memory space) |
| B-v2 | L | Emergent self-designed brain |

### Cluster D — Factory / Reliability
| ID | Size | Title |
|----|------|-------|
| FAC-STALL | S | Stall recovery / bounded-retry |
| FAC-CLOSE | S | Work-item closure loop |
| FAC-PREFLIGHT | M | Ambiguity-gated preflight (unifies with ND clarify tool) |
| FAC-ESCALATE | M | Model escalation + per-cycle cost ledger |
| FAC-HOLDOUT | L | Holdout author-separation validation |

### Cluster E — Platform / Architecture
| ID | Size | Title |
|----|------|-------|
| D2 | S | Skill bundles |
| S5 | S | Heartbeat selfhood updates |
| E-eff2 | S | Prefer-local routing (already partial via model-router.ts) |
| REL3 | S | Recovery / degraded CLI mode |
| ND6 | M | Voice conversational loop |
| REL2 | M | Checkpoints + `/rollback` |
| UX-STREAM | M | Typed stream-event contract |
| WORKFLOWS | L | Dynamic workflows (agent writes its own orchestration harness) |
| SR | L | Safe kernel self-repair (propose → prove → swap) |

---

## Recommended Start Order

**Fastest velocity, lowest risk:**

1. **EF-SCOPEDELTA** (S) — direct continuation of Phase 2 pattern; pure fn + session ref
2. **TUI-SHORTCUTS** (S) — `!cmd` runs shell, `#text` saves to memory; well-scoped, no schema touch
3. **TUI-STATUS** (S) — status bar injection in TUI; no new types
4. **PROJ-IDENTITY** (S) — git remote URL → canonical project ID; unlocks MEM-WORKTREE and others
5. **MEM-HOOKS** (S) — Claude Code Stop/PreCompact hooks for Vanta memory; `update-config` skill handles it

**If wanting a deeper architectural slice:** pick up Memory Cluster C — start with S items (PROJ-IDENTITY → MEM-WORKINGMEM → MEM-VERSIONING) and build up.

---

## Key Constraints (don't lose these)

- **`handlers.ts` EXACTLY 300 lines** — every new `/` command goes in its own file. Trade a blank line for the import.
- **KANBAN WIP = 2 on `building`** — move item to `building` before starting, `shipped` when done; regenerate HTML after.
- **All EF gates non-blocking** — wrap in try/catch, emit via `onText?.()`/`onNote`, never throw.
- **Phase 2 EF pattern** — post-turn gates: session-scoped state ref in `interactive.ts` + `use-agent-send.ts`, exported `*AfterTurn` fn in `session.ts`. Pre-turn gates: fire before `convo.send()`. In-loop gates: in `agent.ts dispatchTool` / `runTurn`.
- **Roadmap HTML regen:**
  ```bash
  cd argo-ts && node --import tsx/esm -e "import { buildRoadmap } from './src/roadmap/build.js'; await buildRoadmap('/Users/jasonpoindexter/Documents/GitHub/Vanta'); console.log('done');"
  ```
- **Test-first, commit per item.** `npm test` (935+), `npm run typecheck` (clean) before each commit.

---

## Continuation Prompt

---
Resuming Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta, branch `feat/v1-hermes-parity` (clean, 935 TS tests green, tsc clean, all committed and pushed).

Vanta = local trusted-operator agent: Rust kernel (`src/`) + TS agent layer (`argo-ts/`, Node22/ESM/tsx). Read root `CLAUDE.md` + `argo-ts/CLAUDE.md` first.

**Last session:** Phase 2 EF pebbles complete (6 items: EF-WORKINGMEM, EF-INHIBIT, EF-SETSHIFT, EF-SELFMONITOR, EF-ERRORDETECT, EF-CLOSUREGATE). Full context in `docs/handoffs/handoff-2026-06-04-1940-phase2-complete-roadmap-next.md`.

**Current state:** 67 shipped, 38 horizon. Nothing building or next.

**Recommended next:** Start the next wave from the roadmap. Suggested order (smallest first):
1. EF-SCOPEDELTA (S) — scope delta tracker, `repl/scope-delta.ts`, pattern identical to Phase 2 EF gates
2. TUI-SHORTCUTS (S) — `!cmd` prefix runs shell inline, `#text` prefix saves to memory
3. TUI-STATUS (S) — persistent status line in TUI
4. PROJ-IDENTITY (S) — canonical project ID from git remote URL

**Key constraints:**
- `handlers.ts` MUST stay at 300 lines — new slash commands in own files, trade a blank line for the import
- KANBAN WIP = 2; move to `building` before starting, `shipped` when done
- All EF gates non-blocking, wrapped in try/catch
- Regenerate roadmap HTML after each status change: `cd argo-ts && node --import tsx/esm -e "import { buildRoadmap } from './src/roadmap/build.js'; await buildRoadmap('/Users/jasonpoindexter/Documents/GitHub/Vanta'); console.log('done');"`
- Test-first, commit per item, `npm test` (935+) + `npm run typecheck` (clean) before each commit
- Kernel goal to set:
  ```bash
  cargo run -- goals add "Continue Vanta roadmap: EF-SCOPEDELTA → TUI-SHORTCUTS → TUI-STATUS → PROJ-IDENTITY. Test-first, commit per item, 935+ tests green throughout."
  ```
---
