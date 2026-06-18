# AGENTS.md — vanta-ts/src/fleet

Parallel agent fleet orchestration.

- Keep live worker execution injectable; tests must not require a provider, real worktrees, or branch merges.
- Fleet worktrees live under `.vanta/worktrees` so the repo-scoped kernel still contains worker file operations.
- Fleet workers emit `TaskCreated` when assigned, `TaskCompleted` when they finish successfully, and `TeammateIdle` before the finished worker goes idle; blocked workers remain represented by team-task status records.
- Persist review state in `.vanta/fleets/<id>.json`; do not commit fleet runtime files.
- `accept` is explicit only: merge a reviewed branch, then clean up its worktree.
