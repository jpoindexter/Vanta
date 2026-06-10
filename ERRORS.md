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
