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

## 2026-06-11 — Killed the kernel under a live session → bricked transcript (Codex 400)

**Symptom:** After rebuilding the kernel I killed the old process (port 7788) while a Vanta session was OPEN. The live session's next tool call failed (`error: fetch failed` — safety client lost the kernel), the turn aborted mid-dispatch, and from then on EVERY turn failed: `Codex request failed (400): No tool output found for function call call_…`. The session was bricked; /compact etc. appeared "broken" too (same kernel-down root cause).

**What failed:** (1) `applySafetyGate` had no try/catch around `safety.assess()` — a kernel fetch failure threw through dispatchTool → runTurn → the turn died AFTER the assistant tool_calls message was pushed but BEFORE any tool result landed. (2) `sanitizeMessages` only dropped orphaned tool RESULTS, not dangling assistant tool CALLS — so the malformed transcript replayed forever (saved sessions resume it too).

**What worked:** Fail closed, gracefully: assess() failure now returns a blocked tool result ("safety kernel unreachable — restart vanta") so the transcript stays consistent and the session survives; approval-queue bookkeeping is best-effort. And `sanitizeMessages` now synthesizes a stub result for any dangling call ("[no result — the turn was interrupted…]") right after its assistant message — self-heals new aborts AND existing bricked session files on their next call.

**Lesson:** the kernel is a live dependency of every open session — never kill/replace it while a session is running without restarting the session; and any code path that appends an assistant tool_calls message must guarantee a result lands for every call id, even on abort. Transcript consistency is an invariant, not a happy-path property.

## 2026-06-13 — TUI v2 streaming duplication (ghosting regression)
What failed: the live region rendered the full growing assistant stream (`⏺ {streaming}`). Once a turn's <Static> transcript + the streamed text exceeded the terminal height, Ink could no longer erase the prior dynamic frame, so every token re-render stacked a copy (~70 duplicate lines on screen) — the exact ghosting the Claude-method rebuild was meant to remove.
What worked: bound the non-<Static> region. Stream shows only a clipped TAIL (last 6 lines, width-clipped so no wrapping — `ui/stream-view.tsx streamingTail`); todo panel capped to 6 rows (`ui/todo-panel.tsx`); busy spinner hidden while text is flowing. The complete response still commits to <Static> scrollback intact on turnEnd.
Why it failed: Ink re-renders the non-Static region in place and can only do so while that region fits the viewport. An unbounded live region violates that invariant — the fix is to keep the live region small and let <Static> + the terminal own everything else.

## 2026-06-13 — Ghosting, second vector: streamed text held through a tool/approval phase
What failed: bounding the stream tail (above) fixed pure streaming, but the reducer only committed streamed text on `turnEnd`. When the model streamed a long preamble and THEN called a tool — especially an approval-gated one (`write_file` to `~/Desktop`, outside the repo root → kernel `ask`) — the full text sat in the redrawing live region for the entire tool+approval window. Each redraw of that tall region leaked a copy into scrollback (~40 stacked copies of the "Goal: …" preamble).
What worked: commit assistant text to <Static> the instant a tool call follows it. New reducer `commitText()` flushes `streaming` → an assistant entry on `toolCall` (and via `flush()` before any user/thinking/note entry), so the text leaves the live region before the tool runs. During the tool/approval phase the live region is now just the spinner + active-tool line. `commitStreaming` (turnEnd) reuses `commitText`, so trailing text still commits and never duplicates.
Why it failed: the live-region-size invariant isn't only about streaming length — ANY committable content (text) left in the dynamic region during a long-held phase (tool exec, approval HITL) will ghost. Rule: text and tools both leave the live region for <Static> as soon as the next thing happens, not at turn end.
