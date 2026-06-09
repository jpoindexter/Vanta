# Handoff — ND Skills Always-On + Phase 2 Ready to Build
Generated: 2026-06-04 17:50
Project: Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta
Branch: feat/v1-hermes-parity

---

## What Was Accomplished

1. **ND Skills always-on in Claude Code** — added full 14-skill always-on block to `~/.claude/CLAUDE.md`. Skills now fire automatically every session without being invoked.

2. **ND Skills always-on in Codex** — `~/.codex/AGENTS.md` updated to include all 14 skills (was missing 5: nd-inhibit, nd-closuregate, nd-hyperfocus-guard, nd-velocity-check, nd-sensory-load).

3. **install.sh updated** — now writes always-on blocks to both `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` in a single run. Idempotent (marker-checked). Pushed to GitHub.

4. **README updated** — "Making skills always-on" is the primary install section, with the clarifying note that copying skill files alone doesn't activate them.

---

## Files Changed

| File | Status | What Changed |
|------|--------|-------------|
| `~/.claude/CLAUDE.md` | Modified | Added 14-skill always-on block before CodeGraph section |
| `~/.codex/AGENTS.md` | Modified | Added 5 missing skills to nd-skills block |
| `~/Documents/GitHub/neurodivergent-agent-skills/install.sh` | Modified | Writes always-on blocks to CLAUDE.md + AGENTS.md; all 14 skills for Codex |
| `~/Documents/GitHub/neurodivergent-agent-skills/README.md` | Modified | Always-on as primary section; clarification on invocation model |

---

## Current State

- **Tests:** 869 passing, 0 failing (117 test files)
- **Typecheck:** tsc clean
- **Uncommitted changes:** None — all committed and pushed
- **Branch:** `feat/v1-hermes-parity`, up to date with origin
- **Roadmap:** 61 shipped / 0 building / 0 next / 44 horizon
- **ND skills repo:** https://github.com/jpoindexter/neurodivergent-agent-skills (public, 3 commits)

---

## In Progress (not finished)

Nothing — clean slate. Ready for Phase 2.

---

## Goal for Next Session

**"Ship Phase 2 EF pebbles in order, test-first, one commit per item, all tests green before moving to next."**

Set this as an Vanta kernel goal:
```bash
cargo run -- goals add "Ship Phase 2 EF pebbles in order: EF-WORKINGMEM → EF-INHIBIT → EF-SETSHIFT → EF-SELFMONITOR → EF-ERRORDETECT → EF-CLOSUREGATE. Test-first, commit per item, 869+ tests green throughout."
```

---

## Exact Next Steps — Phase 2 Build Queue

All 6 items are `horizon`. For each: move to `building`, implement test-first, move to `shipped`, regenerate HTML, commit+push. In order:

### 1. EF-WORKINGMEM (M, pebble, medium)
**Done criteria:** `/where` shows last intent + last N tool calls; goal survives compaction and re-injects at next turn top.

Three parts:
- `/where` slash command — `repl/where.ts` → shows last stated intent + last 5 tool calls as a breadcrumb
- Active task stack — push/pop parent goal ref when entering/exiting subtasks (likely a session-level ref in `interactive.ts` + `use-agent-send.ts`)
- Goal re-injection post-compaction — in `context.ts` `compressMessages()`, after compression inject a "Current goal: X" note at the top of the compressed history

**Watch:** `handlers.ts` is at 300 lines. `/where` goes in its own file. Must trade a blank line for the import.

### 2. EF-INHIBIT (S, pebble, medium)
**Done criteria:** Off-goal tool calls logged as annotation; after 3 adjacent → drift alert surfaced; user can confirm or redirect.

Design:
- Pre-action goal check: before `dispatchTool()` in `agent.ts`, check if tool+args serves the active goal
- Needs `AgentDeps` to carry `activeGoal?: Goal` (optional, backwards-compat)
- 3-strike drift counter: session-scoped counter in `interactive.ts` / `use-agent-send.ts` (like `researchGateRef`)
- Check is annotation-only — never blocks; `onText?.(driftNote)` before the tool executes

**Key decision needed:** Where to pass the active goal into `agent.ts`? Cleanest: add `activeGoal?: Goal` to `AgentDeps` in `agent.ts`. Populated in `session.ts` `prepareRun()` from `goals.find(g => g.status === 'active')`.

### 3. EF-SETSHIFT (M, pebble, medium)
**Done criteria:** Vanta checks ERRORS.md before similar tasks; after 3 non-progressing same-direction attempts → proposes strategy switch.

Two parts:
- ERRORS.md auto-read at task start: in `prepareRun()` or session start, read `<repoRoot>/ERRORS.md` if it exists, inject summary into the volatile prompt tier
- Stuck-loop detector: track consecutive tool calls with same name + similar args; at 3 → surface "Stuck loop detected. Trying [approach] repeatedly. Want to try a different angle?"
- Pure functions in `repl/set-shift.ts`; counter in session scope

### 4. EF-SELFMONITOR (S, pebble, medium)
**Done criteria:** Before significant/destructive tool calls, fast self-monitor check runs; inconsistencies with stated goal are surfaced pre-execution.

Design:
- In `dispatchTool()` after verdict is `allow`, before `tool.execute()`: run a synchronous heuristic check (no LLM — keep it zero-latency)
- Check: does `describeForSafety(args)` content conflict with any obvious goal keywords?
- Heuristic only: look for "delete", "drop", "remove", "overwrite", "reset" in the action description when the goal is additive ("add", "build", "implement")
- If conflict detected: emit one line before execution — "⚠ Self-monitor: action looks destructive but goal is additive. Proceeding — verify this is correct."

### 5. EF-ERRORDETECT (S, pebble, low)
**Done criteria:** Mid-execution drift detected between tool calls; after N non-converging calls → Vanta surfaces interrupt opportunity.

Design:
- In `runTurn()` loop in `agent.ts`: after each tool result, check if the last 3 results all contain error/failure signals
- Error signal heuristics: `ok: false`, output contains "Error", "failed", "not found", "ENOENT", exit code patterns
- At N=3 consecutive failures: inject a user-visible note before next iteration — "3 consecutive tool failures. Pausing — want me to reassess the approach before continuing?"
- Add optional `onIterationCheck?: (failures: number) => void` to `AgentDeps` — caller wires the interrupt; agent loop calls it

### 6. EF-CLOSUREGATE (S, pebble, medium)
**Done criteria:** Before major thread switches, Vanta surfaces in-progress items; user can close or explicitly defer with one action.

Design:
- Detect "new major thread" signal: same heuristic as `nd-taskboundary` (topic shift detected)
- When shift detected: scan `convo.messages` for mentions of in-progress work from current session (tool calls that wrote files but no subsequent commit; items that were started but not finished)
- Surface: "Before switching — [N] items look in-progress this session: [list]. Close one first, or defer all?"
- Wires into the same pre-turn pipeline as complexity gate and topic-shift detector

---

## Context That's Easy to Lose

- **`handlers.ts` is EXACTLY 300 lines** — every new `/` command goes in its own file. Trade a blank line for the import. This constraint is real and must be respected.

- **KANBAN WIP limit = 2 on `building`** — move item to `building` before starting. Regenerate HTML after status changes with: `node --import tsx/esm -e "import { buildRoadmap } from './src/roadmap/build.js'; await buildRoadmap('/Users/jasonpoindexter/Documents/GitHub/Vanta'); console.log('done');"`

- **EF-INHIBIT + EF-ERRORDETECT both need `agent.ts` hooks** — cleanest path is adding optional callbacks to `AgentDeps`: `activeGoal?: Goal` for inhibit, `onIterationCheck?` for error detect. Don't hardcode logic in `agent.ts` — keep it injectable.

- **EF-SELFMONITOR is heuristic-only** — no LLM call. The spec mentions "haiku one-shot" but for an S/pebble item, keep it synchronous and heuristic to avoid latency + cost. If it needs LLM in future that's a separate item.

- **ERRORS.md location** — lives at `<repoRoot>/ERRORS.md` (project root, same level as CLAUDE.md). Not all projects have one. Read with `readIfExists()` pattern, inject as optional volatile tier content.

- **All EF gates are best-effort and non-blocking** — same pattern as Phase 1. Emit a note, continue. Never throw, never block. Wrap in try/catch.

- **Session state pattern** — Phase 1 used `useRef<ResearchGateState>` in TUI and a `let` variable in REPL. Phase 2 follows the same: new state refs for drift counter (EF-INHIBIT), stuck-loop counter (EF-SETSHIFT), etc.

- **After each item:** `npm test` must stay at 869+, `npm run typecheck` must be clean, commit with conventional message, push, update `CLAUDE.md` test counts.

---

## Continuation Prompt

---
Resuming Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta, branch `feat/v1-hermes-parity` (clean, 869 tests green, tsc clean, all committed and pushed).

Vanta = local trusted-operator agent: Rust kernel (`src/`) + TS agent layer (`vanta-ts/`, Node22/ESM/tsx). Read root `CLAUDE.md` + `vanta-ts/CLAUDE.md` first.

**Active goal:** Ship Phase 2 EF pebbles in order — test-first, commit per item, 869+ tests green throughout.

**Last session:** Phase 1 complete (6 EF items shipped). ND skills repo published and always-on in ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md.

**105 roadmap items. 61 shipped, 44 horizon. Nothing in building/next.**

**Phase 2 build queue (in order):**

1. **EF-WORKINGMEM** (M, pebble) — `/where` slash command + active task stack + goal re-injection post-compaction
   - `/where` handler in `repl/where.ts` (handlers.ts is at 300 lines — trade a blank line)
   - Goal re-injection: modify `compressMessages()` in `context.ts` to prepend "Current goal: X" after compression

2. **EF-INHIBIT** (S, pebble) — pre-action goal check in dispatchTool; 3 off-goal calls = drift alert
   - Add `activeGoal?: Goal` to `AgentDeps` in `agent.ts`; populate in `session.ts prepareRun()`
   - Drift counter session-scoped (like researchGateRef pattern)

3. **EF-SETSHIFT** (M, pebble) — ERRORS.md auto-read at task start + stuck-loop detector (3 same-tool consecutive)
   - Pure fns in `repl/set-shift.ts`
   - ERRORS.md inject into volatile prompt tier in `session.ts`

4. **EF-SELFMONITOR** (S, pebble) — synchronous heuristic pre-action check (NO LLM) in dispatchTool
   - Destructive keyword vs additive goal mismatch → one-line warning, proceed

5. **EF-ERRORDETECT** (S, pebble) — consecutive failure tracker in runTurn loop
   - Add `onIterationCheck?: (consecutiveFailures: number) => void` to `AgentDeps`
   - At 3 consecutive `ok:false` results: surface interrupt opportunity

6. **EF-CLOSUREGATE** (S, pebble) — in-progress item surface before topic switches
   - Reuse topic-shift detection from nd-taskboundary
   - Scan messages for started-but-not-committed work

**Key constraints:**
- handlers.ts EXACTLY 300 lines — new slash handlers in own files, trade a blank line for import
- KANBAN WIP = 2. Move to `building` before starting, `shipped` when done
- All EF gates are best-effort, non-blocking, wrapped in try/catch
- EF-INHIBIT/ERRORDETECT: inject via optional AgentDeps callbacks, not hardcoded in agent.ts
- EF-SELFMONITOR: heuristic only, zero LLM calls, zero latency
- After each: `npm test` (869+), `npm run typecheck` (clean), commit + push, update CLAUDE.md counts
- Regenerate roadmap HTML: `node --import tsx/esm -e "import { buildRoadmap } from './src/roadmap/build.js'; await buildRoadmap('/Users/jasonpoindexter/Documents/GitHub/Vanta'); console.log('done');"`

**Architecture reminders:**
- Session state pattern for new counters: `useRef<StateType>` in TUI, `let state` in REPL
- `readIfExists()` in `prompt.ts` for optional file reads
- Output tools (reset research gate): `write_file`, `roadmap_move`, `shell_cmd` — update if adding new output tools
- `splitStableVolatile` splits on LAST `\n\n---\n\n` — plan-mode injection lands in volatile (correct)
---
