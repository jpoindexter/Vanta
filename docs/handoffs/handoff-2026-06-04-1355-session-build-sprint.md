# Handoff — Build Sprint: ND2 + KANBAN + REL1 + TUI-INTERRUPT + FAC-BORNSMALL
Generated: 2026-06-04 13:55
Project: Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta
Branch: feat/v1-hermes-parity

## What Was Accomplished

1. **ND2 — clarify tool** (new Vanta tool)
   - `tools/clarify.ts`: agent calls `clarify({question, options?})` when intent is ambiguous
   - End-of-turn design: returns formatted question as output; no ToolContext changes; works in TUI + REPL + headless
   - 5 tests

2. **KANBAN slice 1 — roadmap_move tool + CLI**
   - `roadmap/move.ts`: pure `moveRoadmapItem(repoRoot, id, toStatus)` — patches roadmap.json + regenerates HTML
   - `tools/roadmap-move.ts`: `roadmap_move` Vanta tool, kernel-gated
   - `vanta roadmap move <id> <status>` CLI subcommand wired in `cli/ops.ts` + `cli.ts`
   - 6 + registry tests

3. **REL1 — per-model capability matrix**
   - `providers/catalog.ts`: added `ModelCapability` type + `modelSupports(modelId, cap)` function
   - BLOCKS/ALLOWS prefix maps: o-series no temperature / has reasoning_effort; claude-4/3.7 has thinking
   - 9 tests

4. **TUI-INTERRUPT — Esc aborts a running turn**
   - `agent.ts`: added optional `signal?: AbortSignal` to `Conversation.send()` + `runTurn()`
   - `tui/app.tsx`: `abortRef` stores per-turn `AbortController`; `useInput` Esc handler aborts + shows "· interrupted"
   - Backward compatible — all existing callers unchanged

5. **FAC-BORNSMALL — born-small codegen (3 slices)**
   - Slice 1 — verifier hard gate: `checkNewFilesUnderLineLimit()` rejects new non-test .ts files >300 lines; wired as step 3 in `verify()`
   - Slice 2 — planner gene-transfusion: `PROVEN_PATTERNS` block prepended to roadmap+parked instructions (300-line cap, registry-by-default, co-located tests, errors-as-values, Zod)
   - Slice 3 — executor CLAUDE.md injection: `readDirContexts()` reads per-dir CLAUDE.md; passed to `buildFactoryInstruction()`
   - 17 tests

6. **Docs + roadmap sync**: CLAUDE.md counts updated, all shipped items marked in roadmap.json, KANBAN slice 2 decision (build native drag board, not agent-kanban) noted

## Files Changed

| File | Status | What Changed |
|------|--------|-------------|
| `argo-ts/src/tools/clarify.ts` | Created | clarify tool |
| `argo-ts/src/tools/clarify.test.ts` | Created | 5 tests |
| `argo-ts/src/roadmap/move.ts` | Created | moveRoadmapItem pure fn |
| `argo-ts/src/roadmap/move.test.ts` | Created | 6 tests |
| `argo-ts/src/tools/roadmap-move.ts` | Created | roadmap_move tool |
| `argo-ts/src/providers/catalog.ts` | Modified | ModelCapability + modelSupports() |
| `argo-ts/src/providers/catalog.test.ts` | Created | 9 tests |
| `argo-ts/src/agent.ts` | Modified | per-turn signal on send() + runTurn() |
| `argo-ts/src/tui/app.tsx` | Modified | abortRef + Esc useInput handler |
| `argo-ts/src/factory/verifier.ts` | Modified | checkNewFilesUnderLineLimit() + wired in verify() |
| `argo-ts/src/factory/verifier.test.ts` | Modified | 4 new tests |
| `argo-ts/src/factory/planner.ts` | Modified | PROVEN_PATTERNS block |
| `argo-ts/src/factory/planner.test.ts` | Modified | 3 new tests |
| `argo-ts/src/factory/executor.ts` | Modified | readDirContexts() + wired into execute() |
| `argo-ts/src/factory/executor.test.ts` | Modified | 3 new tests |
| `argo-ts/src/tools/index.ts` | Modified | registered clarify + roadmap_move |
| `argo-ts/src/tools/tools.test.ts` | Modified | added clarify + roadmap_move to registry list |
| `argo-ts/src/cli/ops.ts` | Modified | runRoadmapCommand now accepts args[] + move dispatch |
| `argo-ts/src/cli.ts` | Modified | pass rest to runRoadmapCommand; updated usage string |
| `roadmap.json` | Modified | ND2/ND4/KANBAN/REL1/TUI-INTERRUPT/FAC-BORNSMALL → shipped; TUI-INPUT → building |
| `CLAUDE.md` | Modified | 43 tools · 692 TS + 27 Rust = 719 tests |
| `argo-ts/CLAUDE.md` | Modified | clarify.ts + roadmap-move.ts + move.ts added to file map |
| `docs/superpowers/specs/2026-06-04-kanban-slice1-design.md` | Created | KANBAN spec |
| `docs/superpowers/plans/2026-06-04-kanban-slice1.md` | Created | KANBAN plan |

## Current State

- **Tests**: 692 passing, 0 failing (101 test files)
- **Typecheck**: tsc clean
- **Uncommitted changes**: NO — all committed
- **Branch**: feat/v1-hermes-parity, 16 commits ahead of origin

## In Progress

**TUI-INPUT** — marked `building` in roadmap.json, not started yet.
- What remains: input history (up/down arrows cycles prior messages) + multiline input (shift+enter)
- Where to start: `argo-ts/src/tui/composer.tsx` (the custom readline composer) + `argo-ts/src/tui/app.tsx`

## Key Decisions Made

1. **clarify tool uses end-of-turn design** — returns the question as output; model surfaces it in reply; user answers next turn. No ToolContext/AgentDeps changes; works in TUI + headless. Alternative (inline interrupt) required per-interface wiring including Ink TUI changes.

2. **roadmap_move lazy-imports moveRoadmapItem** — `await import("../roadmap/move.js")` inside execute() avoids circular dep issues and keeps the tool thin.

3. **agent-kanban rejected for roadmap board** — it's designed for multi-agent task hand-off (agents/PRs/comms), not for Vanta's roadmap format (tiers/tracks/done criteria). Native KANBAN slice 2 (drag-to-move HTML endpoint) is the right path. agent-kanban is parked for FAC territory (dark factory multi-agent orchestration).

4. **KANBAN slices 2+3 still parked** — slice 2 = drag-to-move HTML endpoint; slice 3 = WIP limit enforcement. Per anti-drift, only slice 1 was in scope.

5. **FAC-BORNSMALL new-files-only** — the 300-line gate applies only to NEW non-test .ts files. Bug fixes to pre-existing large files are safe (avoids false positives blocking legitimate fixes).

## Exact Next Steps (in order)

1. [ ] **TUI-INPUT** (`pebble·sonnet·medium`) — input history (up/down) + multiline (shift+enter). Start at `argo-ts/src/tui/composer.tsx`. Done: up arrow cycles history; shift+enter inserts newline in the composer.
2. [ ] **TUI-MARKDOWN** (`pebble·sonnet·medium`) — Markdown + syntax-highlight rendering in the transcript. Done: agent replies render with headers/bold/code blocks instead of raw markdown.
3. [ ] **ND1** (`pebble·sonnet·medium`) — task-initiation affordance: given a goal, surface ONE concrete next micro-step. `/next` slash command or `vanta next`. Done: user types `/next` → Vanta surfaces one tiny action.
4. [ ] **ND3** (`pebble·sonnet·medium`) — plan-first / converse mode: `/plan` makes Vanta clarify → lay out steps → confirm → act. Done: toggleable; step list confirmed before any tool runs.
5. [ ] **U2** (`pebble·sonnet·medium`) — @-context references in TUI composer: @file/@diff/@url autocomplete inlines context. Done: type @ → autocomplete suggestions → selected item attached as context.
6. [ ] **KANBAN slice 2** — drag-to-move HTML endpoint: POST /roadmap/move + drag-and-drop board UI. Park until after TUI items.
7. [ ] **Push to remote**: `git push` when ready.

## Context That's Easy to Lose

- **roadmap.json vs ROADMAP.md**: `roadmap.json` is the agent/HTML source; `ROADMAP.md` is what the factory triage reads (`[ ]` checkboxes). Both must be kept in sync when marking items shipped.
- **TUI-INPUT lives in `composer.tsx`**: The TUI uses a custom composer component at `argo-ts/src/tui/composer.tsx` (not standard Ink TextInput) — that's where input history and multiline belong.
- **agent-kanban URL**: `https://github.com/saltbo/agent-kanban.git` — parked for FAC multi-agent work, not the roadmap board.
- **Kernel goals 1, 2, 4 are stale** (all shipped) — kernel `/api/goals` has no completion endpoint, so they remain active. Goals 5–9 are the live queue (FAC-BORNSMALL done = goal 5 complete mentally).
- **16 commits unpushed** — all on `feat/v1-hermes-parity`, need a `git push` before this branch is backed up remotely.
- **modelSupports() default-allow** — unknown models default to `true` for all capabilities (safer than silently dropping features). The BLOCKS/ALLOWS maps use prefix matching so free-typed OpenRouter IDs inherit the right caps.

## Continuation Prompt

---
Resuming Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta, branch feat/v1-hermes-parity (clean, 692 TS + 27 Rust = 719 tests green, tsc clean). 16 commits ahead of origin — push when ready.

Vanta = local trusted-operator agent: Rust safety kernel (src/) + TS agent layer (argo-ts/, Node22/ESM/tsx). Read root CLAUDE.md + argo-ts/CLAUDE.md + the 5 planning docs first.

**This session shipped (in order):**
1. ND2 — clarify tool (end-of-turn design, no ToolContext changes)
2. KANBAN slice 1 — roadmap_move tool + `vanta roadmap move <id> <status>` CLI
3. REL1 — modelSupports() capability matrix in providers/catalog.ts
4. TUI-INTERRUPT — Esc aborts running turn (per-turn AbortController in app.tsx)
5. FAC-BORNSMALL — 3 factory slices: verifier 300-line gate + planner PROVEN_PATTERNS + executor CLAUDE.md injection

**Key decision this session:** agent-kanban (https://github.com/saltbo/agent-kanban.git) rejected for the roadmap board — wrong data model (it's for multi-agent task hand-off, not Vanta's tier/track/done roadmap format). KANBAN slice 2 (native drag-to-move HTML endpoint) is the right path, still parked.

**Next task: TUI-INPUT** (`pebble·sonnet·medium`)
Input history (up/down arrows cycles prior messages) + multiline input (shift+enter inserts newline). Start at `argo-ts/src/tui/composer.tsx` — that's the custom readline composer the TUI uses. Done criteria: up arrow in the composer cycles message history; shift+enter inserts a newline instead of submitting.

**After TUI-INPUT:** TUI-MARKDOWN → ND1 → ND3 → U2 → KANBAN slice 2.

Continue building through the queue: test-first, commit per item, move roadmap status at start (building) and end (shipped), update CLAUDE.md counts. No approval gates unless genuinely blocked.
---
