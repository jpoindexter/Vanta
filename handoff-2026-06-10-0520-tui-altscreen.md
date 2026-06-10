# Handoff — Vanta TUI alt-screen ghost frames (PARTIALLY FIXED) + Phase 1/2 CC cards
Generated: 2026-06-10 05:20
Project: Vanta — /Users/jasonpoindexter/Documents/GitHub/_active/Vanta
Branch: main

## TL;DR for the next session
The alt-screen ghost-frame bug is **NOT fully fixed**. Initial render is clean now,
but **resizing the macOS window re-triggers ghost-stacking** (see screenshot evidence
below). There are also TWO things the user explicitly wants:
1. **Resize must not ghost.** (the remaining bug)
2. **Bring back the startup banner/capabilities info in alt-screen mode** — it was
   removed to stop overflow, but the user misses it.

Everything is committed; working tree is clean. Run from repo root: `./run.sh`
(it runs `tsx vanta-ts/src/cli.ts` directly — no build step, edits are live).
The user has `VANTA_NO_FLICKER=1` in `vanta-ts/.env` so alt-screen is ON by default.

## What Was Accomplished (this session)
Hill-climb through CC roadmap cards + a deep TUI bug hunt:

- **Phase 1 (all shipped):** CC-COLLAPSED-READ (fold long tool output, INLINE_MAX=5/
  FOLD_PREVIEW=12), CC-BASH-COMMENT-LABEL (first `#` comment → shell_cmd label),
  CC-MSG-GROUPED-TOOLS (`│` connector for consecutive tool calls), CC-NO-FLICKER-ENV.
- **Phase 2 (shipped):** CC-AUTO-COMPACT (onAutoCompact callback), CC-VIRTUAL-LIST /
  CC-ALT-SCREEN / CC-SCROLL-BOX (one impl: `virtual-transcript.tsx` + viewport slice
  + pgup/pgdn scroll, only active in alt-screen mode).
- **CC-ESC-INTERRUPT (shipped):** Esc now cancels the in-flight HTTP request (signal
  threaded through `CompletionConfig` → every provider).
- **Added cards:** CC-SCROLL-DURING-RUN (next), CC-ESC-INTERRUPT (shipped).
- **Ghost-frame bug:** found ONE real root cause (module-load env read) and fixed it,
  but the resize case remains. ERRORS.md created documenting 4 failed attempts.

## Files Changed (all committed)
| File | Status | What Changed |
|------|--------|-------------|
| vanta-ts/src/tui/tool-result.ts | Modified | `buildResultPreview`, INLINE_MAX, FOLD_PREVIEW |
| vanta-ts/src/tui/transcript.tsx | Modified | lineCount + isGrouped fields, fold render, `│` connector |
| vanta-ts/src/tui/tool-display.ts | Modified | `bashLabel()` |
| vanta-ts/src/tui/app-reducer.ts | Modified | viewOffset, scrollBy/scrollReset, isGrouped |
| vanta-ts/src/tui/app.tsx | Modified | altScreen as PROP (not module const); VirtualTranscript vs Static branch; streaming cap |
| vanta-ts/src/tui/virtual-transcript.tsx | Created | Viewport slice for alt-screen mode |
| vanta-ts/src/tui/launch.tsx | Modified | Ink `alternateScreen: true`; passes altScreen prop |
| vanta-ts/src/agent.ts | Modified | onAutoCompact callback; signal → getCompletion |
| vanta-ts/src/providers/{interface,openai,anthropic,codex}.ts | Modified | signal in CompletionConfig |
| vanta-ts/src/interactive.ts | Modified | onAutoCompact console log |
| vanta-ts/.env.example | Modified | VANTA_AUTO_COMPACT_THRESHOLD, VANTA_NO_FLICKER |
| ERRORS.md | Created | Ghost-frame root cause + 4 failed attempts |
| roadmap.json | Modified | Card statuses |

## Current State
- Build/typecheck: PASSING (`cd vanta-ts && npm run typecheck` clean)
- Tests: 198 TUI tests passing (`npx vitest run src/tui/`)
- Uncommitted changes: NO (clean tree)
- **Runtime behavior: alt-screen INITIAL render clean; RESIZE still ghosts.**

## In Progress / STILL BROKEN
### 1. Resize ghost-frames in alt-screen mode (the core remaining bug)
- **What's done:** Fixed the module-load env read (initial render clean now, verified
  in tmux at 102×27).
- **What remains:** macOS window resize (drag, or the open animation) fires MANY rapid
  resize events at intermediate widths. Ink re-renders on each; on width-INCREASE it
  does NOT clear (only clears on width-DECREASE — see Ink's `resized` handler in
  `vanta-ts/node_modules/ink/build/ink.js` ~line 262). Each intermediate width leaves
  a ghost composer box. Screenshot at 110×29 shows ~6 stacked boxes with varying-width
  top borders.
- **Why my verification missed it:** I tested `tmux resize-window` (single clean step).
  macOS drag-resize is animated = many events. Single-step resize ≠ animated resize.
- **Leading theory:** Ink's log-update tracks `previousLineCount` and does RELATIVE
  cursor moves (`eraseLines(n)` / `cursorUp(n)`). When the terminal reflows between
  renders (resize), the relative math is wrong → under-erase → ghost. Files to read:
  `node_modules/ink/build/log-update.js` (createStandard), `ink.js` `resized` (~262)
  and public `clear()` (~618), `cursor-helpers.js`.
- **Candidate fixes to try (NOT yet attempted):**
  a. On resize in alt-screen, force an ABSOLUTE full clear that ALSO resyncs Ink's
     internal state. Attempt #2 this session did `\x1b[2J\x1b[H` out-of-band and got a
     BLANK screen because it desynced Ink's `previousOutput` (log-update then computed
     a zero-diff and wrote nothing). The fix must clear AND make Ink forget its
     previous frame — likely call the instance's `.clear()` (returned by `render()`)
     then trigger a re-render, OR debounce resize and call `instance.clear()`.
  b. Debounce the resize storm: swallow rapid resize events, clear once when settled.
  c. Investigate Ink v7 `incrementalRendering` / whether a newer Ink fixes alt-screen
     resize. Current Ink is 7.0.5 (`node_modules/ink/package.json`).
  d. Reproduce reliably: drive in tmux and fire MULTIPLE rapid `resize-window` calls in
     a tight loop (mimics the animation), then `capture-pane` — single-step won't repro.

### 2. Banner missing in alt-screen mode (user wants it back)
- **Where:** `vanta-ts/src/tui/app.tsx` ~line 271 — alt-screen branch renders ONLY
  `<VirtualTranscript>`, no `<Banner>`. Removed because the 36-line banner overflowed
  short terminals and worsened ghosting (commit 76bf1b5).
- **What the user wants:** the startup capabilities/skills/tool-count info back, in
  alt-screen mode.
- **Recommended approach:** render the banner content as the FIRST entries INSIDE the
  VirtualTranscript (so it scrolls into history via pgup) instead of as fixed chrome.
  That keeps the viewport bounded (no overflow) while preserving the info. Alternatively
  a COMPACT one-line banner pinned at top. Decide with the user.

## Key Decisions Made (and why)
1. **Keep `<Static>` for normal mode, VirtualTranscript only for alt-screen.** Static
   gives terminal-native scrollback (copy/search/share); alt-screen has none, so it
   needs the virtual viewport. They're opposite render models — don't merge.
2. **altScreen is a PROP, not a module const.** Module-top `process.env` reads are
   frozen before `loadEnv()` runs (cli.ts main → loadEnv at runtime). This was THE
   initial-render root cause. Same latent bug still exists for THEME/VIM_ENABLED/SPINNER
   in app.tsx (not fixed — flagged in ERRORS.md).
3. **Esc cancels at the HTTP layer**, not just the iteration boundary — signal threaded
   to providers.

## Context That's Easy to Lose
- **Run from repo root**, but git/tests `cd` into `vanta-ts/` (shell cwd persists).
  Always `git -C <repo>` or cd back.
- `roadmap.json` is the board; `roadmap.html` is gitignored/regenerated.
- Pre-commit gitleaks + warn-only size gate run on every commit (size violations don't
  block unless `VANTA_LINT_BLOCK=1`).
- The user is on Opus 4.8 now. Provider in `.env` is `codex` / gpt-5.5 (banner shows
  "gpt-5.5"). Esc-interrupt fix touched the codex provider too.
- **tmux Enter quirk:** in this env, `tmux send-keys ... Enter` and `C-m` did NOT submit
  to the composer reliably during testing — couldn't drive a full turn. Initial-render
  and resize visual checks worked; full turn interaction did not. Find a working submit
  method before claiming turn-level features verified.
- ERRORS.md has the full 4-attempt failure log for the ghost bug — READ IT before
  touching the alt-screen render path again.

## Exact Next Steps (in order)
1. [ ] Reproduce the RESIZE ghost reliably: tmux session in alt-screen, fire a tight
       loop of `resize-window` calls at varying widths, `capture-pane`. Confirm repro.
2. [ ] Fix resize ghosting — start with candidate (a): on resize, call the Ink
       instance's `.clear()` then re-render; or (b) debounce the resize storm. Verify
       with the loop from step 1, AND by eyeballing a real macOS drag-resize.
3. [ ] Bring back banner info in alt-screen: render it as initial scrollable entries
       inside VirtualTranscript (recommended) — confirm the design with the user first.
4. [ ] Re-verify BOTH: initial render, idle-stability, animated resize, normal mode
       still shows banner. Update ERRORS.md if resize needed >2 attempts.
5. [ ] (Backlog) Phase 3 CC cards: CC-PERMISSIONS, CC-PROMPT-CACHE-1H, CC-HOOKS-ENGINE,
       CC-GOAL-CMD, CC-HOOK-ADDITIONAL-CTX. Also CC-SCROLL-DURING-RUN (normal-mode
       scroll while streaming). Don't start Phase 3 until the TUI is visually clean.

## Continuation Prompt
---
Working on Vanta at /Users/jasonpoindexter/Documents/GitHub/_active/Vanta (branch main,
clean tree). It's a local trusted-operator agent: Rust safety kernel (`src/`) + TypeScript
agent/TUI (`vanta-ts/`, Node 22 ESM, React/Ink 7). Run from repo root with `./run.sh`
(runs `tsx vanta-ts/src/cli.ts` directly, no build). The TUI is Ink-based; the user has
`VANTA_NO_FLICKER=1` in `vanta-ts/.env` so it launches in Ink's alternateScreen mode.

There is an UNFINISHED TUI bug. With alt-screen on, the INITIAL render is now clean
(I fixed a module-load-time `process.env` read by threading `altScreen` as a prop into
the App component — see commit ded3da3 and ERRORS.md). BUT resizing the macOS window
re-triggers ghost-frame stacking: multiple composer boxes stack with varying-width
borders. Cause: macOS animated resize fires many rapid resize events; Ink only clears
on width-DECREASE, not increase, so each intermediate width leaves a ghost. My earlier
attempt to manually clear (`\x1b[2J\x1b[H`) before render caused a BLANK screen because
it desynced Ink's internal `previousOutput` tracking — so any clear must also resync
Ink (likely via the instance `.clear()` returned by `render()`), not bypass it.

ALSO: the user wants the startup banner/capabilities info back in alt-screen mode — I
removed it (commit 76bf1b5) because the 36-line banner overflowed short terminals and
worsened ghosting. Recommended: render banner content as the first scrollable entries
inside VirtualTranscript (vanta-ts/src/tui/virtual-transcript.tsx) rather than fixed
chrome, so the viewport stays bounded. Confirm the design with the user first.

Before editing the alt-screen render path, READ /Users/.../Vanta/ERRORS.md — it logs 4
failed attempts on this exact bug. Reproduce the resize ghost in tmux (fire a tight loop
of resize-window calls — a single resize won't repro; that's why my last "fix" looked
verified but wasn't) BEFORE editing, and verify with a real macOS drag-resize after.

Key files: vanta-ts/src/tui/app.tsx (render branch ~line 271, altScreen prop),
launch.tsx (Ink alternateScreen option), virtual-transcript.tsx, and Ink internals at
vanta-ts/node_modules/ink/build/{ink.js resized ~L262 + clear ~L618, log-update.js,
cursor-helpers.js}. Typecheck: `cd vanta-ts && npm run typecheck`. Tests:
`npx vitest run src/tui/`. Commit per slice; conventional commits; end messages with the
Claude co-author trailer. After the TUI is visually clean, Phase 3 CC cards remain in
roadmap.json (CC-PERMISSIONS, CC-HOOKS-ENGINE, CC-GOAL-CMD, etc.).
---
