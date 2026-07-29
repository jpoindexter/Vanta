# AGENTS.md — src/ui

Ink 7 TUI surface. The existing `app.tsx` path is the default v1 UI and should stay stable unless a task explicitly targets it.

`src/ui/v2/` is the opt-in mission-control surface selected by `VANTA_TUI=v2`. Keep launch selection small and testable in `launch.tsx`; keep layout-specific v2 code in `v2/`.

Approval UI (`approval-prompt.tsx`) renders typed request context from `../permissions/request.ts` and four decisions: allow once, always allow, deny, never allow.

`mode-line.tsx` owns the shared Manual → Accept edits → Plan → Auto cycle. Shift+Tab cycles whenever the composer has focus. Auto-classifier Ask decisions must remain visible approvals; never auto-resolve a pending prompt in the renderer.

Default TUI host responsibilities: fire session lifecycle hooks, prompt submit/expansion hooks, per-turn Stop hooks, StopFailure on send errors, and start the opt-in FileChanged watcher.

Completed turns must be saved through the existing session store. `/restart` supplies `initialSession` on the next process; initialize the conversation with that transcript, retain its provider/model scope, show a compact reload receipt, and reset only process-local display timing.

Turn summaries retain every tool receipt but treat a failed action as recovered when a later successful tool has the same name and displayed target. Trace loop warnings require consecutive identical tool arguments; repeated reads or commands against different targets are normal progress.
