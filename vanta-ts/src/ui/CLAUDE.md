# CLAUDE.md — src/ui

The TUI uses React + Ink 7 with inline rendering and `<Static>` scrollback. Tests use `test-render.tsx` with fake stdio.

Default surface:
- v1: `app.tsx`, selected by default.
- v2: `v2/`, selected only by `VANTA_TUI=v2`.

When adding UI behavior, prefer pure helpers and co-located tests. Do not use `ink-testing-library`; use the existing real-Ink harness.

**Test timing — never assert after a fixed tick count.** A keypress → `useInput` → `setState` → Ink repaint takes a nondeterministic number of flush cycles, and under full-suite load a fixed `await tick()`/`ticks(n)` before the assertion races the repaint and flakes (see ERRORS.md 2026-06-20). After any `inst.input(...)`, poll instead: `await waitForFrame(inst, text)` for a frame-text assertion, `await waitUntil(() => spy.mock.calls.length > 0)` for a callback/state assertion (both in `test-render.tsx`; they return as soon as the condition holds, throw on timeout). Pick a wait-target UNIQUE to the post-input view — e.g. wait on a detail-only marker, not text that also appears in the list view. Fixed waits remain correct only for negative assertions (`not.toHaveBeenCalled`) and intermediate keypress sequencing.

Approval prompt: `approval-prompt.tsx` consumes `permissions/request.ts` for per-tool context and `permissions/grant.ts` for Always/Never tool-scoped rules. Esc maps to deny, not never.

Hook host: `app.tsx`, `use-agent.ts`, and `use-slash.ts` mirror readline hook coverage for SessionStart/End, UserPromptSubmit, UserPromptExpansion, Stop, StopFailure, and FileChanged watcher startup.
