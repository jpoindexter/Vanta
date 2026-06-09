# Handoff — Roadmap Restructure + ND4 MOIM
Generated: 2026-06-04 12:15
Project: Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta
Branch: feat/v1-hermes-parity

## What Was Accomplished

1. **Roadmap restructure (pickle-jar + build-routing tags)**
   - Added optional `tier` (rock/pebble/sand), `model` (haiku/sonnet/opus), `effort` (low/medium/high) fields to `RoadmapItemSchema`
   - All 37 open items tagged via deterministic script — IDs/count verified identical
   - Renderer now groups each status column Rocks → Pebbles → Sand; per-card `model · effort` badge
   - Track filter still works; empty tier groups auto-hide
   - Opus assigned to 4 items only (SR, WORKFLOWS, B-v2, FAC-HOLDOUT — all horizon)
   - **Important caveat**: tags are advisory labels, NOT auto-routing. The factory triage reads `ROADMAP.md`/`PARKED.md`, not `roadmap.json`. Wiring tags → actual model selection is separate work (FAC-ESCALATE).

2. **ND4 — Top-of-mind note (MOIM) shipped**
   - `/moim <text>` pins a note; injected at the top of the volatile prompt tier every turn
   - Patches the live system message immediately (same session sees it without restart)
   - `/moim` shows current note; `/moim clear` removes it
   - Persisted to `~/.vanta/moim.md` — survives across sessions
   - 8 new tests (6 store + 2 prompt)

## Files Changed

| File | Status | What Changed |
|------|--------|-------------|
| `vanta-ts/src/roadmap/schema.ts` | Modified | Added optional `tier`, `model`, `effort` fields + exported types/consts |
| `vanta-ts/src/roadmap/render.ts` | Modified | Tier-grouped columns (Rocks→Pebbles→Sand), model·effort badge, JS filter fix |
| `vanta-ts/src/roadmap/render.test.ts` | Modified | 3 new tests: badge render, tier grouping, untagged item |
| `vanta-ts/src/roadmap/schema.test.ts` | Modified | 3 new tests: optional fields present/absent, invalid tier/model rejection |
| `roadmap.json` | Modified | 37 open items tagged with tier/model/effort; updated `updated` field |
| `vanta-ts/src/moim/store.ts` | Created | `readMoim` / `writeMoim` / `clearMoim` — `~/.vanta/moim.md` persistence |
| `vanta-ts/src/moim/store.test.ts` | Created | 6 tests covering read/write/clear |
| `vanta-ts/src/prompt.ts` | Modified | `moimNote?` opt in `buildSystemPrompt`; injected top of volatile tier |
| `vanta-ts/src/prompt.test.ts` | Modified | 2 new tests: MOIM injected before goals; absent when unset |
| `vanta-ts/src/session.ts` | Modified | `prepareRun` reads MOIM note and passes it to `buildSystemPrompt` |
| `vanta-ts/src/repl/handlers.ts` | Modified | `moim` slash handler (show/set/clear) + HANDLERS entry |
| `vanta-ts/src/repl/catalog.ts` | Modified | `/moim [text|clear]` added to SLASH_COMMANDS |

## Current State

- **Tests**: 662 passing, 0 failing (98 test files)
- **Typecheck**: tsc clean
- **Uncommitted changes**: NO — both commits pushed to `feat/v1-hermes-parity`
- **Roadmap HTML**: regenerated (gitignored — run `vanta roadmap` to rebuild)

## In Progress

Nothing — both slices fully shipped and committed.

## Key Decisions Made

1. **Tier tags are advisory, not routing**: The factory triage reads `ROADMAP.md`/`PARKED.md` (not `roadmap.json`), so tagging an item `haiku` does not make a build run on Haiku. Tags are a build-session guide + durable decision record. Wiring to actual model selection is FAC-ESCALATE.

2. **Rock shortlist (3, not 6)**: Objective test — "unblocks another item OR kills the documented finish-poor bounce." ND2 (unblocks FAC-PREFLIGHT), KANBAN (WIP-limit IS the bounce prosthesis + unblocks FAC-CLOSE), ND4 (zero-dep EF opener). FAC-BORNSMALL demoted to pebble from the prior session's handoff recommendation — it's substantial but standalone.

3. **MOIM patches the live system message inline** (same pattern as `/goal`): so `/moim` mid-session takes effect immediately without a restart. `/moim clear` removes from storage; the current session's patched system message isn't un-patched (noted in the output).

4. **MOIM stored as plain text** (`~/.vanta/moim.md`, no YAML frontmatter, no git auto-commit): it's working memory, not identity. Contrast with brain regions which are git-versioned.

5. **Layer on top, not replace**: Pickle-jar tiers added as a layer within the existing Now/Next/Later columns — not a new axis. Preserves the live kanban the product itself uses (KANBAN + FAC-CLOSE both treat `status` as the columns).

## Exact Next Steps (in order)

1. [ ] **ND2 · clarify tool** (`sonnet·medium`) — a `clarify` tool the agent can call when intent is ambiguous: surfaces one structured question to the user before acting. Kernel-gated like any tool. Unblocks FAC-PREFLIGHT. ~1–2 hrs. Done criteria: on ambiguous intent Vanta asks one tappable structured question instead of guessing; wrong-guess rework drops.
2. [ ] **KANBAN slice 1** (`sonnet·medium`) — `roadmap_move` tool + `vanta roadmap move <id> <status>` CLI + regenerate HTML. Slice 2 (drag HTML endpoint) and slice 3 (WIP limit) parked until slice 1 ships. Done criteria: `vanta roadmap move ND2 building` updates roadmap.json + regenerates.
3. [ ] **Push to remote** when ready (both commits are local on `feat/v1-hermes-parity`; push with `git push`).

## Context That's Easy to Lose

- **`triage.ts` reads ROADMAP.md, not roadmap.json**: the factory's work-item picker (`selectWorkItem`) parses `[ ]` checkboxes from ROADMAP.md and `## ` headers from PARKED.md. roadmap.json is the agent-readable source + HTML generator; ROADMAP.md is the factory's trigger. Keep both in sync when marking items shipped.
- **KANBAN has 3 slices, ship slice 1 only**: (1) `roadmap_move` tool + CLI, (2) drag-to-move HTML endpoint, (3) WIP limit enforcement. Per anti-drift: only slice 1 this session.
- **ND2 clarify tool is a new Vanta tool** (not a slash command): it lives in `tools/clarify.ts`, registered in `tools/index.ts`, kernel-assessed via `describeForSafety`. Pattern: `tools/inspect-state.ts` is a good reference for a simple non-destructive tool.
- **Model tagging is Sonnet 4.6 session** — the roadmap restructure and ND4 were built on Sonnet 4.6 (user switched from Opus at session start). ND2 and KANBAN are also `sonnet·medium`.
- **662 TS + 27 Rust = 689 total tests green** at handoff. Rust test count unchanged.
- **`roadmap.html` is gitignored** — regenerate with `vanta roadmap` or `cd vanta-ts && npx tsx src/roadmap/build.ts` from the repo root.

## Continuation Prompt

---
Resuming Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta, branch feat/v1-hermes-parity (clean, 662 TS + 27 Rust tests green, tsc clean).

Vanta = local trusted-operator agent: Rust safety kernel (src/) + TS agent layer (vanta-ts/, Node22/ESM/tsx). Read root CLAUDE.md + vanta-ts/CLAUDE.md + the 5 planning docs first.

**This session shipped:**
1. Roadmap restructure — optional tier (rock/pebble/sand) / model (haiku/sonnet/opus) / effort fields in schema + render; 37 open items tagged; Rocks→Pebbles→Sand grouping in each board column; model·effort badge per card. Tags are advisory (build-session guide), not factory routing — triage reads ROADMAP.md, not roadmap.json.
2. ND4 MOIM — `/moim <text>` pins a top-of-mind note injected at the top of the volatile prompt tier every turn; persisted to `~/.vanta/moim.md`; `/moim clear` removes it.

**Next task: ND2 · clarify tool (`sonnet·medium`)**
A new Vanta tool (`tools/clarify.ts`) the agent calls when intent is ambiguous. It surfaces ONE structured question to the user before acting instead of guessing and thrashing. Kernel-gated. Unblocks FAC-PREFLIGHT later.
- Done criteria: on ambiguous intent Vanta asks one tappable structured question; wrong-guess rework drops.
- Pattern: see `tools/inspect-state.ts` for a simple non-destructive tool reference.
- How to add a tool: new file `tools/<name>.ts` → `describeForSafety` → `execute` → register in `tools/index.ts` → co-located test in `tools/tools.test.ts`.

**After ND2: KANBAN slice 1 only** — `roadmap_move` tool + `vanta roadmap move <id> <status>` CLI + regenerate. Slices 2 (drag HTML) and 3 (WIP limit) are parked; ship slice 1 only per anti-drift.

Respect anti-drift: one feature end-to-end, test-first, commit+push. Push back if scope creeps.
---
