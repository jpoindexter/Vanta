# AGENTS.md — vanta-ts/src/worktree

Git worktree adapter for isolated worker branches.

- Keep this layer thin: create worktree, diff branch, merge branch, cleanup worktree.
- Tests should avoid mutating the real repo; use fake repos or export-shape checks.
- Cleanup and merge are explicit caller actions, not automatic side effects of creating a worktree.
