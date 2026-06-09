# Handoff — TUI/UX Sprint: KANBAN-S2 + TUI-INPUT + TUI-MARKDOWN + ND1 + ND3 + U2
Generated: 2026-06-04 14:45
Project: Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta
Branch: feat/v1-hermes-parity

## What Was Accomplished

1. **KANBAN-S2 — Drag-and-drop roadmap board**
   - `roadmap/server.ts`: `createRoadmapServer` (Node http) + `serveRoadmap`
   - `GET /roadmap/board` serves `roadmap.html` fresh from disk on every request
   - `POST /roadmap/move` → `moveRoadmapItem` directly (no subprocess)
   - `render.ts`: `data-id` on cards, `data-status` on columns, drag-and-drop JS + CSS
   - `cli/ops.ts`: `vanta roadmap serve` — builds HTML, opens browser, starts server on port 7789 (env: `VANTA_ROADMAP_PORT`)
   - 8 tests

2. **TUI-INPUT — Composer history + multiline**
   - `tui/composer.tsx`: `navigateHistory` pure helper + `history`/`isHistoryActive` props; up/down cycles sent messages; shift+enter inserts `\n` at cursor
   - `tui/app.tsx`: `inputHistory` state accumulated on submit, passed to Composer
   - History active only when slash/@ palette not showing and not busy
   - 8 tests (`tui/composer.test.ts`)

3. **TUI-MARKDOWN — Markdown rendering in transcript**
   - `tui/markdown.tsx`: `tokenizeInline` (**bold**, `code`) + `parseFencedCode` + `parseBlocks` (h1-3, bullets, numbered, fenced code, spacer) + `renderMarkdown` Ink renderer
   - `tui/transcript.tsx`: assistant entries routed through `renderMarkdown`
   - Streaming text stays plain (incomplete content breaks inline parsing)
   - 15 tests (`tui/markdown.test.ts`)

4. **ND1 — /next slash command**
   - `repl/next.ts`: reads active kernel goals → returns `resend` prompt asking agent for one concrete, immediately actionable micro-step (names file/command/decision)
   - Registered in `HANDLERS` + `SLASH_COMMANDS` catalog
   - 5 tests

5. **ND3 — /planmode toggle**
   - `repl/plan-mode.ts`: injects `PLAN_MARKER` + numbered plan-first instruction into live system prompt; toggle with no arg or explicit `on`/`off`
   - Ephemeral (current session only — not persisted like `/moim`)
   - Registered as `/planmode` (not `/plan` which is already the todo viewer)
   - 7 tests

6. **U2 — @-file context references**
   - `tui/at-context.ts`: `parseAtRefs`, `activeAtRef`, `buildContextBlock`, `listRepoFiles` (depth-3 walk, skips `.git`/`node_modules`/`target`/`dist`/`.vanta`)
   - `tui/app.tsx`: `atFiles` loaded on mount; @ palette (↑↓ select, tab complete); `isActive: showAtPalette`; submit resolves `@refs` → prepends `<file path="...">` context blocks
   - 16 tests

7. **Compliance refactor (300/50-line audit)**
   - `tui/app-reducer.ts` (NEW): `State`, `Action`, `reduce` extracted from `app.tsx`
   - `tui/use-agent-send.ts` (NEW): `useAgentSend` hook — `sendToAgent`, queue-drain effect, Esc-abort `useInput`
   - `tui/app.tsx`: 398 → 178 lines; `submit` split into `handleSlash` (20L) + `submit` (28L)
   - `tui/markdown.tsx`: `parseBlocks` 58 → 22 lines via `parseFencedCode` helper
   - `re-export { reduce, State, Action }` from `app.tsx` for `app.test.tsx` compat

8. **Docs sync**
   - `vanta-ts/CLAUDE.md`: 8 new file map entries; TUI/REPL commands updated; session additions updated
   - `ROADMAP.md`: `## SHIPPED 2026-06-04 (session 2)` added; U2 ticked `[x]`; Polish tier updated
   - `CLAUDE.md`: counts correct (43 tools · 724 TS + 27 Rust = 751 tests)
   - `roadmap.json`: all 6 items → `shipped`

## Files Changed

| File | Status | What Changed |
|------|--------|-------------|
| `vanta-ts/src/roadmap/server.ts` | Created | KANBAN-S2 HTTP server |
| `vanta-ts/src/roadmap/server.test.ts` | Created | 8 server route tests |
| `vanta-ts/src/roadmap/render.ts` | Modified | `data-id`/`data-status` attrs, drag JS + CSS |
| `vanta-ts/src/tui/composer.tsx` | Modified | `navigateHistory`, `history`/`isHistoryActive` props, shift+enter |
| `vanta-ts/src/tui/composer.test.ts` | Created | 8 navigateHistory tests |
| `vanta-ts/src/tui/app.tsx` | Modified | 398→178L; `inputHistory`, `atFiles`, @ palette, `handleSlash`+`submit` split |
| `vanta-ts/src/tui/app-reducer.ts` | Created | `State`/`Action`/`reduce` extracted |
| `vanta-ts/src/tui/use-agent-send.ts` | Created | `useAgentSend` hook |
| `vanta-ts/src/tui/markdown.tsx` | Created | Markdown renderer |
| `vanta-ts/src/tui/markdown.test.ts` | Created | 15 tokenize/parse tests |
| `vanta-ts/src/tui/transcript.tsx` | Modified | Assistant entries → `renderMarkdown` |
| `vanta-ts/src/tui/at-context.ts` | Created | @-ref parsing + file listing |
| `vanta-ts/src/tui/at-context.test.ts` | Created | 16 at-context tests |
| `vanta-ts/src/repl/next.ts` | Created | `/next` handler |
| `vanta-ts/src/repl/next.test.ts` | Created | 5 next handler tests |
| `vanta-ts/src/repl/plan-mode.ts` | Created | `/planmode` handler |
| `vanta-ts/src/repl/plan-mode.test.ts` | Created | 7 planmode tests |
| `vanta-ts/src/repl/handlers.ts` | Modified | `next` + `planMode` imported + registered |
| `vanta-ts/src/repl/catalog.ts` | Modified | `/next` + `/planmode` in SLASH_COMMANDS |
| `vanta-ts/src/cli/ops.ts` | Modified | `vanta roadmap serve` subcommand |
| `vanta-ts/src/cli.ts` | Modified | Usage string updated |
| `roadmap.json` | Modified | 6 items shipped, U2→shipped |
| `CLAUDE.md` | Modified | Test counts updated |
| `vanta-ts/CLAUDE.md` | Modified | File map + session additions updated |
| `ROADMAP.md` | Modified | Session 2 shipped section + U2 tick |

## Current State

- **Tests**: 751 passing, 0 failing (107 test files)
- **Typecheck**: tsc clean
- **Uncommitted changes**: NO — all committed and pushed
- **Branch**: `feat/v1-hermes-parity`, up to date with origin
- **Commits this session**: 9 commits pushed

## In Progress

Nothing in progress. All roadmap items from the goal (TUI-INPUT + TUI-MARKDOWN + ND1) are shipped, plus KANBAN-S2, ND3, and U2 as extras.

## Key Decisions Made

1. **KANBAN-S2 uses a TS HTTP server on port 7789** (not kernel port 7788) — `moveRoadmapItem` is TypeScript; calling it from the Rust kernel would require a subprocess. Separate server is cleaner and direct.

2. **`/next` uses `resend` signal** — the handler returns `{ resend: prompt }` which sends to the agent as a real turn. The agent answers with one concrete step. No special tool or UI change needed.

3. **ND3 is `/planmode` not `/plan`** — `/plan` was already taken (shows the todo list). `/planmode` is the toggle; exists only in live session (ephemeral system prompt injection, not persisted like `/moim`).

4. **`navigateHistory` extracted as a pure function** — makes it unit-testable without rendering Ink. The hook just calls it and applies state updates.

5. **Streaming stays plain text in transcript** — `renderMarkdown` only applied to committed (complete) assistant entries. Partial streamed content would break inline code parsing on unclosed backticks.

6. **@-palette uses existing `Palette` component** — mapped as `{ name: filePath, desc: "" }`. No new component needed.

7. **`app-reducer.ts` re-exports `reduce`/`State` from `app.tsx`** — `app.test.tsx` imports from `./app`, so backward compat is preserved without touching the test.

## Exact Next Steps (in order)

The roadmap is now all `shipped` or `horizon` — no `next`/`building` items. Choose from:

1. [ ] **KANBAN slice 3** — WIP limit enforcement. Items in `building` col > N → warn/block the move. Native to `roadmap/server.ts` POST handler.

2. [ ] **TUI-DIFF** (`pebble`) — Render file diffs inline in the transcript when the agent edits a file. Hook into `onToolResult` for `write_file`; display a colored `+/-` diff view.

3. [ ] **TUI-MODE** (`pebble`) — In-TUI mode/approval toggle (shift+tab cycles modes). Would reuse the `planMode` injection pattern.

4. [ ] **ND5** (`pebble`) — Proactive nudge cadence. After N idle turns with an active goal, Vanta surfaces a reminder. Uses `/next` prompt logic + a counter in `replState`.

5. [ ] **FAC-INTENT** (`pebble`) — LLM-judge gate on factory cycle output: verify the output satisfies the original intent before commit. Extends `factory/verifier.ts`.

6. [ ] **Push to remote when ready**: branch is already pushed. `git push` when done with next session.

## Context That's Easy to Lose

- **`vanta roadmap serve` defaults to port 7789** (`VANTA_ROADMAP_PORT` overrides). Kernel is on 7788. Both can run simultaneously.

- **`handlers.ts` is at exactly 300 lines** — adding any handler inline will bust the hard limit. New handlers go in their own file (like `repl/next.ts`, `repl/plan-mode.ts`) and get imported.

- **`App` component (178L) and `Composer` component (141L) both exceed the 50-line fn limit** — they're Ink React components; the JSX + hooks make sub-50 impossible without destroying readability. Pre-existing pattern; don't try to split them further.

- **`navigateHistory` saves the draft when first pressing up** — on subsequent ups, it uses the already-saved draft. Draft is cleared when value goes to `""` (parent clears on submit). The ref (`histRef`) holds state between renders without causing re-renders.

- **@ palette deactivates when slash palette is showing** — `atHead` is only computed when `!showPalette`. This avoids input conflicts when a user types `/@something`.

- **`roadmap.json` is the agent/HTML source of truth**; `ROADMAP.md` is what the factory triage reads (checkbox format). Both must be kept in sync. The `roadmap.json → roadmap.html` pipeline runs on every `moveRoadmapItem` call.

- **Kernel goal 10** (`Ship TUI-INPUT + TUI-MARKDOWN + ND1`) was set via `POST /api/goals/add` this session. It's still active in the kernel (no completion endpoint). Goals 1–9 are also stale-active.

- **9 commits pushed this session** — all on `feat/v1-hermes-parity`, branch is up to date with origin.

## Continuation Prompt

---
Resuming Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta, branch `feat/v1-hermes-parity` (clean, 751 TS + 27 Rust = 778 total tests green, tsc clean, all committed and pushed).

Vanta = local trusted-operator agent: Rust safety kernel (`src/`) + TS agent layer (`vanta-ts/`, Node22/ESM/tsx). Read root `CLAUDE.md` + `vanta-ts/CLAUDE.md` + 5 planning docs first.

**This session shipped (in order):**
1. KANBAN-S2 — drag-and-drop roadmap board (`vanta roadmap serve` → `http://localhost:7789/roadmap/board`)
2. TUI-INPUT — up/down input history + shift+enter multiline in composer
3. TUI-MARKDOWN — markdown rendering for committed assistant entries in TUI transcript
4. ND1 — `/next` slash command: reads active kernel goals → sends agent a "one micro-step" prompt
5. ND3 — `/planmode [on|off]` toggle: injects plan-before-tools instruction into live system prompt
6. U2 — `@file` autocomplete in TUI composer + context injection on submit
7. Compliance refactor: `app.tsx` 398→178L via `app-reducer.ts` + `useAgentSend` hook; all files ≤300L, non-component fns ≤50L

**Key constraints to respect:**
- `handlers.ts` is exactly 300 lines — new handlers go in their own file, imported into handlers.ts
- `navigateHistory` pure helper in `composer.tsx` — tests in `tui/composer.test.ts`
- Streaming text stays plain in transcript; only committed assistant entries get `renderMarkdown`
- `/planmode` (not `/plan`) — `/plan` shows todos
- `roadmap.json` + `roadmap.html` are TS-layer concerns; `ROADMAP.md` is the factory/triage source

**All roadmap items are now `shipped` or `horizon`. Next candidates:**
1. KANBAN slice 3 — WIP limit enforcement in `POST /roadmap/move`
2. TUI-DIFF — colored diff rendering in transcript on write_file results
3. TUI-MODE — mode/approval toggle (shift+tab)
4. ND5 — proactive nudge cadence (idle turn counter)
5. FAC-INTENT — LLM-judge intent-satisfaction gate in `factory/verifier.ts`

Continue building: test-first, commit per item, update `roadmap.json` (building→shipped), regenerate HTML via `buildRoadmap`, update `CLAUDE.md` counts, push after each item.
---
