# Local store versioning

Vanta initializes its home directory as a local Git repository so skill and
memory changes retain lightweight history. Store writes stage only their owned
path and commits are best-effort; missing Git or an empty commit never blocks
the primary operation. Secret-bearing files are excluded by the store's managed
`.gitignore`.

Vanta commit invocations set `gc.auto=0` and `maintenance.auto=false` for that
process. Git can otherwise start auto-GC or maintenance in the background and
return before it finishes, which violates the store API's settled-on-return
contract and can race profile or temporary-home teardown. These invocation-only
settings do not disable explicit/manual Git maintenance.

Bundled skill installation makes one batch commit after copying the library,
rather than one commit per skill. Existing user-edited skills remain untouched
unless the caller explicitly requests a forced reinstall.
