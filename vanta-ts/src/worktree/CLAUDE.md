# CLAUDE.md — worktree

`manager.ts` wraps `git worktree` for isolated branch work. `createWorktree(repoRoot, prefix, baseDir?)` can place worktrees under a caller-supplied directory; the fleet uses `.vanta/worktrees` so worker edits remain inside the repo-scoped kernel boundary. `cleanupWorktree` exists for persisted review flows where the in-memory handle is gone.

Hook note: `createWorktree` emits `WorktreeCreate`; `cleanupWorktree` emits `WorktreeRemove`. These are best-effort shell hooks and must not change git cleanup semantics.
