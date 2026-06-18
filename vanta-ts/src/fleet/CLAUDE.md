# CLAUDE.md — fleet

This folder owns the parallel worker fleet flow.

`fleet.ts` fans out task specs to isolated worktrees, appends team-task status records, runs subagents with `AgentDeps.root` set to each worktree, records per-worker diff stats, and persists fleet reports. `store.ts` is the JSON boundary under `.vanta/fleets/`. `format.ts` owns CLI text.

Hook events: successful workers emit `TaskCreated`, `TaskCompleted`, and `TeammateIdle`.

Rules:
- Default runtime may call real subagents and git worktrees, but tests inject those seams.
- Keep worker worktrees inside `.vanta/worktrees` so the existing kernel root contains them.
- Do not auto-merge worker branches; `accept` is a separate reviewed action.
