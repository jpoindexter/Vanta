# Handoff — Research Sprint: MemPalace + AgentMemory + EF Architecture
Generated: 2026-06-04 16:20
Project: Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta
Branch: feat/v1-hermes-parity

---

## What Was Accomplished

### Part 1 — Feature Sprint (all shipped)
1. **KANBAN-S3** — WIP limit (hard cap 2) on the `building` column. Server returns 409 with `wip:{count,limit}` payload when exceeded. Board HTML shows live count badge (red at limit). `roadmap_move` tool inherits the gate. `checkWipLimit` pure fn in `roadmap/wip.ts`. 12 tests.

2. **TUI-DIFF** — Colored diff rendering for `write_file` in the TUI activity feed. `write_file` reads old content before overwriting, runs LCS diff (`util/diff.ts`, MAX_LINES=400 guard), includes `DiffLine[]` in `ToolResult`. Agent threads it through `onToolResult` → reducer → `ToolEntry`. `DiffView` renders `+green / -red / context-dim` below the `✓ wrote` line. 8 tests.

3. **TUI-MODE** — Shift+tab cycles `review ↔ auto` approval mode. `ApprovalMode` type + `nextMode` pure cycle (`tui/approval-mode.ts`). `useApproval` accepts `modeRef` — when `mode="auto"` the `requestApproval` Promise resolves `true` immediately (kernel `block` verdict is UNCHANGED — hard floor holds). StatusBar shows `⚡auto` indicator when active. Mode change dispatches a note. 4 tests.

4. **ND5** — Gentle goal nudge every N turns. `shouldNudge` + `buildNudgeText` pure fns in `repl/nudge.ts`. `nudgeAfterTurn` in `session.ts` reads active kernel goals and calls `onNote` at `VANTA_NUDGE_EVERY` intervals (default 5, `0`=disabled). Wired into TUI via `useAgentSend`. 11 tests.

5. **FAC-INTENT** — LLM-as-judge intent-satisfaction gate added as step 7 in `factory/verifier.ts`. `checkIntentSatisfied` (factory/intent-judge.ts) sends work item + touched-file list to LLM judge after all deterministic gates pass. **Fails OPEN on LLM error** — deterministic gates remain the hard floor. `parseJudgeResponse` pure helper. `run.ts` passes `workItem: item` to `verify()`. 11 tests.

**Total: 798 tests, tsc clean, all committed + pushed.**

---

### Part 2 — Research Sprint + Architecture

Examined 3 external sources and added 28 new horizon roadmap items + 3 design docs:

**Sources examined:**
- MemPalace (github.com/MemPalace/mempalace) — full codebase + 50 open issues
- AgentMemory (github.com/rohitg00/agentmemory) — full codebase + 50 open issues
- PMC4455841 — Rabinovici et al., "Executive Dysfunction" (UCSF Memory and Aging Center, 2015) — COMPLETE article including all 3 clinical cases, full neuroanatomy section, all references, treatment section

**New design docs:**
- `docs/executive-dysfunction-brain-design.md` — full mapping from EF science to Vanta requirements. Covers 4 EF components, 9 clinical symptoms, treatment→architecture translation, 7 extended brain dimensions (activation state, inhibition weight, set/task context, epistemic state, prospective memory, affective valence, source monitoring), two-network brain architecture (salience network DISTINCT from executive control), two working memory modes (maintenance vs manipulation), Tower of London = factory planner problem.

- `docs/ef-network-analysis.md` — 6 real EF failure patterns from actual Vanta sessions (handoffs + today's conversation), mapped to clinical EF components + counter-measures. Includes the full EF network diagram (cause → effect → counter-measure) and gap analysis for 5 new items not yet on the roadmap.

---

## Files Changed

| File | Status | What Changed |
|------|--------|-------------|
| `argo-ts/src/roadmap/wip.ts` | Created | KANBAN-S3: WipLimitError + checkWipLimit |
| `argo-ts/src/roadmap/wip.test.ts` | Created | 8 wip tests |
| `argo-ts/src/roadmap/move.ts` | Modified | Wire checkWipLimit, re-export WipLimitError |
| `argo-ts/src/roadmap/server.ts` | Modified | 409 for WipLimitError, WIP_LIMIT import |
| `argo-ts/src/roadmap/server.test.ts` | Modified | +4 WIP limit server tests |
| `argo-ts/src/roadmap/render.ts` | Modified | WIP count badge on Now column header |
| `argo-ts/src/util/diff.ts` | Created | LCS diff pure fn |
| `argo-ts/src/util/diff.test.ts` | Created | 8 diff tests |
| `argo-ts/src/tui/diff-view.tsx` | Created | Ink diff rendering component |
| `argo-ts/src/tools/types.ts` | Modified | DiffLine + diff? on ToolResult |
| `argo-ts/src/tools/write-file.ts` | Modified | Read old content, compute diff, include in result |
| `argo-ts/src/agent.ts` | Modified | Thread diff through onToolResult callback |
| `argo-ts/src/tui/app-reducer.ts` | Modified | diff? on toolResult Action + ToolEntry |
| `argo-ts/src/tui/transcript.tsx` | Modified | diff? on ToolEntry, DiffView render |
| `argo-ts/src/tui/app.tsx` | Modified | Pass diff to dispatch; mode state; shift+tab |
| `argo-ts/src/tui/approval-mode.ts` | Created | ApprovalMode + nextMode |
| `argo-ts/src/tui/approval-mode.test.ts` | Created | 4 mode tests |
| `argo-ts/src/tui/use-approval.ts` | Modified | Accept modeRef, auto-approve in auto mode |
| `argo-ts/src/tui/status-bar.tsx` | Modified | mode? prop → ⚡auto indicator |
| `argo-ts/src/repl/nudge.ts` | Created | shouldNudge + buildNudgeText |
| `argo-ts/src/repl/nudge.test.ts` | Created | 11 nudge tests |
| `argo-ts/src/session.ts` | Modified | nudgeAfterTurn function |
| `argo-ts/src/tui/use-agent-send.ts` | Modified | Accept safety, call nudgeAfterTurn |
| `argo-ts/src/factory/intent-judge.ts` | Created | parseJudgeResponse + checkIntentSatisfied |
| `argo-ts/src/factory/intent-judge.test.ts` | Created | 11 intent judge tests |
| `argo-ts/src/factory/verifier.ts` | Modified | Step 7: intent judge gate + VerifyOpts |
| `argo-ts/src/factory/run.ts` | Modified | Pass workItem: item to verify() |
| `docs/executive-dysfunction-brain-design.md` | Created | Full EF→Vanta design spec |
| `docs/ef-network-analysis.md` | Created | Real session EF pattern analysis |
| `roadmap.json` | Modified | 105 total items (+28 new horizon items) |
| `CLAUDE.md` | Modified | Test counts: 43 tools · 771 TS + 27 Rust = 798 |

---

## Current State

- **Tests**: 798 passing, 0 failing (112 test files)
- **Typecheck**: tsc clean
- **Uncommitted changes**: NO — all committed and pushed
- **Branch**: `feat/v1-hermes-parity`, up to date with origin
- **Roadmap**: 55 shipped / 0 building / 0 next / 50 horizon

---

## In Progress (not finished)

Nothing — all commits are clean and pushed. The research docs are complete.

---

## Blocked / Needs Decision

None currently.

---

## Key Decisions Made (and Why)

1. **FAC-INTENT fails OPEN on LLM error** — the deterministic gates (tests pass, tsc clean) are the hard floor. If the LLM judge times out or errors, the slice passes. Otherwise every factory cycle breaks if the provider is unreachable.

2. **28 new roadmap items are ALL horizon** — none were moved to `next` or `building`. The research sprint was capture-not-build by design. Pick deliberately which to build first (see Next Steps below).

3. **Salience network is SEPARATE from executive control** — important architectural constraint. BRAIN-NEURO must implement both as distinct systems with explicit interaction. Don't merge them.

4. **Real session data is the calibration set** — the EF pattern analysis uses your actual sessions as the ground truth. The 6 patterns identified are not hypothetical.

---

## Exact Next Steps (in order)

### Phase 1 — Quick wins (all sand/S, ~1hr each, zero dependencies)
These can be done in any order but this sequence builds the most momentum:

1. [ ] **PROMPT-STABILITY** — Freeze the stable prompt prefix for LLM cache hit rate.
   - `prompt.ts`: compute the stable tier (SOUL + tools + rules + skills index) once per session as a constant. Only inject goals/time/moim in the trailing volatile section.
   - Why first: saves money on every single turn, zero new concepts, 1hr.
   - File: `argo-ts/src/prompt.ts` (look at `buildSystemPrompt()`)

2. [ ] **EF-VELOCITY** — Rolling capture:ship ratio in `/status`.
   - `~/.argo/velocity.json`: append on every roadmap item creation (capture) + every `roadmap_move` to `shipped` (ship). Read in `/status` output.
   - Show: "capture/ship: 8:1 this week" as a dim line in status. Warn when > 5:1.
   - Why second: makes the exact pattern from today's session visible in the product.

3. [ ] **EF-RESEARCH-GATE** — Gentle pattern interrupt after N research turns.
   - Needs a turn-type classifier: is this turn research/analysis, or concrete output?
   - After `VANTA_RESEARCH_GATE_TURNS` (default 8) consecutive non-output turns, dispatch a note: "8 research turns since last commit. Original goal: X. Want to pick one finding to build?"
   - Why third: literally fires on the pattern from today.

4. [ ] **EF-COMPLEXITY-GATE** — Lightweight complexity classifier auto-suggests `/planmode`.
   - On each user message, score complexity (multi-file indicators, schema change, migration, ambiguous spec).
   - If complexity > threshold and `/planmode` is off: dispatch a one-line suggestion before any tool call. User can dismiss.
   - Why fourth: prevents Case 4-2 paralysis.

5. [ ] **EF-CHOICEREDUCE** — Show only top 3 from the next queue.
   - When `/next` is called and backlog has >3 items, present only the top 3 (smallest + most dependencies met + least recently touched).
   - Why fifth: directly addresses the "11-item paralysis" pattern.

6. [ ] **EF-TASKBOUNDARY** — Explicit task boundary event on topic switches.
   - Detect significant topic shift mid-session (classifier: new goal set OR topic diverges > threshold from active goal).
   - Propose boundary: summarize prior task state, archive to session memory, begin fresh context.
   - Why sixth: prevents context pollution across cognitive sets.

### Phase 2 — EF pebbles (after Phase 1 is done)
These are meatier but all well-specified:

7. [ ] **EF-WORKINGMEM** — Active task stack + `/where` + goal re-injection post-compaction.
   - `/where` slash command surfaces last stated intent + last N tool calls.
   - Push/pop parent goal on subtask entry/exit.
   - Goal re-injected at top of next volatile tier after compaction.

8. [ ] **EF-INHIBIT** — Soft pre-action goal check (annotation, not block).
   - Before each tool call, lightweight check: does this tool+args serve the active goal?
   - After 3 adjacent off-goal calls: surface drift alert.

9. [ ] **EF-SETSHIFT** — ERRORS.md auto-read + approach diversity tracker.
   - At task start: scan ERRORS.md for similar prior failures.
   - After 3 non-progressing similar-direction iterations: propose strategy switch.

10. [ ] **EF-SELFMONITOR** — Fast pre-action sanity check before destructive ops.
    - Before write_file overwrite, shell_cmd, commit: haiku one-shot "does this make sense given goal?"
    - Not a hard gate — an annotation that catches "about to write the wrong file."

11. [ ] **EF-ERRORDETECT** — Mid-execution error detection between tool calls.
    - Between tool calls in a single turn: heuristic check tracking convergence toward goal.
    - After N non-converging calls, surface interrupt opportunity.

12. [ ] **EF-CLOSUREGATE** — Surface in-progress items before major thread switches.
    - When major new thread begins, scan current session for >50% done items.
    - "2 items in-progress this session. Want to close one first?" One-tap dismiss.

### Phase 3 — Memory foundation (enables all BRAIN-NEURO work)

13. [ ] **MEM-HOOKS** — Claude Code Stop/PreCompact hooks.
    - `scripts/argo-memhook.sh`: Stop hook mines transcript every 10 turns (background).
    - PreCompact hook runs synchronously.
    - Zero tokens in chat. Install instructions in README.

14. [ ] **PROJ-IDENTITY** — git remote URL for canonical project identity.
    - `git remote get-url origin` as the memory namespace key.
    - Falls back to directory name for non-git roots.
    - `VANTA_PROJECT_ID` env override.

15. [ ] **MEM-TIMESTAMPS** — Conversation timestamps in memory (not ingest time).
    - Add `timestamp` to `Message` type (record at send time).
    - Propagate to memory store entries.
    - Enables: `argo memory search --since 7d`.

16. [ ] **MEM-WORKINGMEM** — Session-scoped working memory hot cache.
    - `VANTA_WORKING_MEM_TOKENS` env (default 2k).
    - Auto-populated from current-session tool results.
    - Injected as volatile prompt tier.

17. [ ] **BRAIN-5D** — Replace 7 flat brain .md files with SQLite + 5-axis model.
    - `~/.argo/brain.db` (SQLite): id, region, content, createdAt, updatedAt, strength, relatedIds[], forgetAfter.
    - `brainDigest` selects top-K by strength × recency.
    - Auto-decay stale entries (7d without reinforcement).
    - This unlocks all subsequent BRAIN-NEURO work.

### Phase 4 — Full neurocognitive brain (after BRAIN-5D)

18. [ ] **BRAIN-SALIENCE** — Two-network brain (salience + executive control separate).
19. [ ] **MEM-VERSIONING** — Memory versioning with supersedes chain.
20. [ ] **MEM-COMPRESS** — Observation compression pipeline (raw → facts → memory).
21. [ ] **MEM-VERBATIM** — Verbatim session archive + semantic search.
22. [ ] **MEM-LAYERS** — Multi-tier memory injection (avoid dark-memory gap).
23. [ ] **BRAIN-NEURO** — Full 12-axis neurocognitive brain.

---

## Context That's Easy to Lose

- **`handlers.ts` is at exactly 300 lines** — new slash handlers must go in their own file (e.g., `repl/nudge.ts`) and be imported. Don't add inline.

- **The 28 new roadmap items are ALL `horizon`** — none are `next` or `building`. Move one to `building` explicitly when you start it. The KANBAN WIP limit enforces this.

- **EF features are about the USER's EF, not just the agent's** — the patterns in `ef-network-analysis.md` are from Jason's real sessions. Build them in the order that would have helped most today: PROMPT-STABILITY first (immediate ROI), EF-VELOCITY second (makes the pattern visible), EF-RESEARCH-GATE third (fires on the spiral pattern).

- **BRAIN-5D is the prerequisite for everything else in Phase 3/4** — don't build MEM-COMPRESS or BRAIN-NEURO before BRAIN-5D ships. The SQLite store is the foundation.

- **`util/diff.ts` MAX_LINES = 400** — diffs on files over 400 lines are silently skipped (empty diff returned). This is intentional — large file diffs flood the TUI.

- **FAC-INTENT fails open** — if the provider is unreachable, the intent judge returns `ok:true` and lets the slice through. The deterministic gates (tests/tsc) remain the hard floor. This is correct behavior.

- **The salience network is SEPARATE from executive control** (PMC4455841, critical) — BRAIN-SALIENCE must implement both as distinct subsystems. The salience network determines WHAT MATTERS; the executive control network determines HOW TO ACT. Don't merge them.

- **`VANTA_NUDGE_EVERY=0` disables ND5 nudges** — default is 5 turns. Users who find the nudge annoying can set it to 0.

---

## Continuation Prompt

---
Resuming Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta, branch `feat/v1-hermes-parity` (clean, 798 tests green, tsc clean, all committed and pushed).

Vanta = local trusted-operator agent: Rust safety kernel (`src/`) + TS agent layer (`argo-ts/`, Node22/ESM/tsx). Read root `CLAUDE.md` + `argo-ts/CLAUDE.md` first.

**Last session shipped:**
- KANBAN-S3: WIP limit (cap 2) on building column — 409 from server, badge in board HTML
- TUI-DIFF: LCS diff in write_file results, green/red inline in transcript
- TUI-MODE: shift+tab cycles review ↔ auto approval, ⚡auto badge in status bar
- ND5: goal nudge every 5 turns (VANTA_NUDGE_EVERY), 💡 /next reminder
- FAC-INTENT: LLM-as-judge intent gate in factory verifier (fails open on LLM error)
- Research sprint: 28 new horizon roadmap items from MemPalace + AgentMemory + PMC4455841 (EF paper)
- Design docs: docs/executive-dysfunction-brain-design.md + docs/ef-network-analysis.md

**105 roadmap items total. 55 shipped, 50 horizon. Nothing in building/next — pick one to start.**

**Build queue (ordered, start here):**
1. PROMPT-STABILITY — freeze stable prompt prefix in buildSystemPrompt() for LLM cache hit rate (prompt.ts, ~1hr, sand/S)
2. EF-VELOCITY — rolling capture:ship ratio in /status (~1hr, sand/S)
3. EF-RESEARCH-GATE — gentle pattern interrupt after N research turns without output (~1hr, pebble/S)
4. EF-COMPLEXITY-GATE — auto-suggest /planmode for complex requests (~1hr, sand/S)
5. EF-CHOICEREDUCE — show only top 3 from next queue when backlog > 3 (~1hr, sand/S)
6. EF-TASKBOUNDARY — explicit task boundary on topic switches (~1hr, sand/S)

Then Phase 2 (EF pebbles): EF-WORKINGMEM → EF-INHIBIT → EF-SETSHIFT → EF-SELFMONITOR → EF-ERRORDETECT → EF-CLOSUREGATE.
Then Phase 3 (memory foundation): MEM-HOOKS → PROJ-IDENTITY → MEM-TIMESTAMPS → MEM-WORKINGMEM → BRAIN-5D.
Then Phase 4 (neurocognitive): BRAIN-SALIENCE → MEM-VERSIONING → MEM-COMPRESS → BRAIN-NEURO.

**Key constraints:**
- handlers.ts is exactly 300 lines — new slash handlers go in their own file
- KANBAN WIP limit = 2. Move one roadmap item to `building` before starting, move to `shipped` when done
- BRAIN-5D is the prerequisite for all Phase 3/4 memory work (SQLite foundation)
- The 28 new items are ALL horizon — move deliberately, not automatically
- FAC-INTENT fails open (LLM error → ok:true) — deterministic gates are the hard floor
- Update roadmap.json status as you go. Regenerate roadmap HTML after each ship.
- After each item: npm test (must stay 798+), tsc clean, commit + push

**EF context (important for understanding what to build):**
The EF items (EF-VELOCITY, EF-RESEARCH-GATE, etc.) were designed from real session patterns — Jason's actual sessions. docs/ef-network-analysis.md has the full analysis. These are not hypothetical features — they address documented recurring patterns from handoffs.

Build test-first, commit per item, update CLAUDE.md counts, push after each.
---
