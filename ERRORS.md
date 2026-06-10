# ERRORS.md — Vanta failure log

Append-only. Approaches that took >2 attempts. Check this before debugging similar tasks.

## 2026-06-10 — Alt-screen TUI ghost frames (stacked composer boxes)

**Symptom:** With `VANTA_NO_FLICKER=1`, the TUI rendered the composer box repeatedly stacked down the screen (ghost frames), each with a varying-width top border. Worse on short terminals. Sometimes a blank screen.

**What failed (4 wrong attempts — all theorized from screenshots, none verified):**
1. SIGINT/SIGTERM/exit handlers to restore the terminal — addressed cleanup, not the ghosting.
2. Manual `\x1b[2J\x1b[H` clear before `render()` + a resize handler — caused a *blank* screen: clearing the screen out-of-band desynced Ink's internal `previousOutput`, so log-update computed a zero-diff and wrote nothing.
3. Swapped manual `\x1b[?1049h/l` escape codes for Ink v7's built-in `alternateScreen: true` option — correct API, but ghosts persisted.
4. Removed the 36-line banner from the alt-screen render path — reduced overflow but ghosts persisted.

**Root cause:** `app.tsx` read `const ALT_SCREEN = process.env.VANTA_NO_FLICKER === "1"` at **module-load time**. The `.env` is loaded at **runtime** (`cli.ts` `main()` → `loadEnv()`), long after the static `import` graph evaluated — so `ALT_SCREEN` was frozen `false`. Meanwhile `launch.tsx`'s `inAltScreen()` reads at runtime and correctly enabled Ink's alt-screen buffer. The two surfaces disagreed: Ink entered the alt buffer, but `App` rendered the `<Static>` + banner path (frozen `false`) **inside** it. `<Static>` has no scrollback and the banner overflows, so every render tick ghost-stacked.

**What worked:** Thread `altScreen` as a **prop** from `launch.tsx` (runtime-correct) into `App`. The two surfaces now agree by construction. Verified in tmux at 102×27 (the failing size): clean single composer, no banner, no ghosts, survives resize; normal mode still renders the banner via `<Static>`.

**Lesson:** Any `const X = process.env.Y` at module top-level in a file imported by `cli.ts` is frozen *before* `loadEnv()` runs — it will always read the default. Read env at runtime (in a function, or threaded as a prop), never at module load. `THEME`/`VIM_ENABLED`/`SPINNER` in `app.tsx` have the same latent bug.

**Meta-lesson:** I edited 4 times from screenshots without once capturing the actual terminal bytes or driving the real app. The fix came only after reading the env-load order and verifying in tmux. Reproduce + verify before editing, not after.

## 2026-06-10 — Alt-screen ghost frames pt 2: resize storms (the prop fix wasn't the whole story)

**Symptom:** With the altScreen-prop fix in (entry above), a single resize looked clean — but an ANIMATED macOS drag (a storm of SIGWINCH) still ghost-stacked composer boxes. Reproduced headlessly: tmux 100×29 + a tight `tmux resize-window` width loop (grow AND shrink) → 3 stacked boxes after 4 rounds. One clean resize proves nothing.

**Root cause (read from Ink 7.0.5 source, then confirmed live):** short frames render via log-update's RELATIVE path — `eraseLines(previousLineCount)` anchored at the cursor (`ink/build/log-update.js`). Ink only full-clears when a frame overflows the viewport (`shouldClearTerminalForFrame`, ink.js) and its resize handler only clears on width DECREASE. Vanta's ~8-line frame never overflowed → every mid-storm width increase under-erased rewrapped lines → old frame tops survived → stacking.

**What worked:** make every frame overflow on purpose. `tui/alt-frame.tsx` renders a full viewport of blank filler ABOVE the content, so outputHeight always exceeds rows → Ink takes its clearTerminal path (absolute, home-anchored full rewrite) on every frame, and the write's final scroll leaves the content bottom-anchored with blanks above. Reactive rows/cols (`useTermSize`) re-render on resize; a debounced redraw nonce (`useResizeRedraw`) forces one post-storm commit as backstop. Banner returned as scrollable VirtualTranscript entries (`bannerEntries`), safe under the new regime.

**Dead ends inside this fix (caught by ink-testing-library probes before shipping):**
- `justifyContent="flex-end"` + `overflow="hidden"` does NOT bottom-anchor overflowing content — Yoga clamps children to the top edge, clipping the NEWEST lines.
- `flexDirection="column-reverse"` — same clamp; children overdraw each other at the top.
- A trailing-space redraw nonce is dead: Ink `trimEnd()`s every output line (`ink/build/output.js`) so the frame string never changes. Use a non-whitespace glyph.
- A fixed-height frame needs `flexShrink={0}` on every fixed-size child or Yoga silently collapses them.

**Lesson:** verify resize handling with a rapid storm in BOTH directions, never a single resize. And never build on an assumed Yoga layout behavior — probe it with a 10-line ink-testing-library render first.
