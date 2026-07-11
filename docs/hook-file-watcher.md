# FileChanged hook watcher lifecycle

When `.vanta/hooks.json` contains a `FileChanged` hook, Vanta starts one
repository watcher for the session. Paths under `.git`, `.vanta`, and
`node_modules` are ignored. Matching changes are debounced before the hook is
loaded and executed.

Watcher shutdown is asynchronous. Closing the watcher first prevents new
events, then waits for every already-dispatched `FileChanged` hook to settle.
Interactive and one-shot sessions await that close operation before completing
their own teardown. The TUI starts the same drain without blocking React's
effect cleanup.

This prevents a hook process from writing into session state after Vanta has
reported exit, and prevents temporary workspaces from being removed while an
accepted hook is still running. Rejected hook promises are settled during the
drain rather than becoming teardown races.
