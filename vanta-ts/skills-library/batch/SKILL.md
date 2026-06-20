---
name: batch
description: "Run a large, parallelizable code change across many worker agents in isolated git worktrees, opening one PR per completed task."
---

# Batch — parallel multi-agent implementation

Use when a change splits into many independent edits that can be done in parallel
(e.g. "add the same guard to all 12 route handlers", "migrate every adapter to
the new interface"). Each task runs as its own worker in an isolated git
worktree; completed workers open a PR; the coordinator reports the PR URLs.

## When to use

- The work is **parallelizable** — tasks don't depend on each other's output.
- Each task is **self-contained** enough for one worker to finish + test it.
- You want **PRs** (external review) rather than a local fleet merge — for a
  local-merge flow use `vanta fleet` + `vanta fleet accept`.

If tasks are sequential or share state, do them in one session instead.

## How to run

```bash
vanta batch run \
  --task "Add input validation to routes/users.ts" \
  --task "Add input validation to routes/orders.ts" \
  [--base main]
```

- Each `--task` becomes one worker in its own worktree under `.vanta/worktrees`.
- The test gate is automatic: each worker is told to run the suite and fix
  failures **before finishing** — a worker that can't get tests green is
  `blocked` and gets **no PR**.
- For every `done` worker, `batch` pushes the branch and runs `gh pr create`,
  then prints each PR URL (or the failure reason).

## Requirements (live)

- `gh` CLI authenticated (`gh auth status`) and a GitHub remote — needed only for
  the PR step; the worker/worktree orchestration runs without it.
- A configured model backend (workers are real subagents, each kernel-gated).

## Boundary

`batch` is the PR layer over the worker fleet. Splitting a vague description into
tasks is the operator's job — pass explicit `--task`s. Every worker action is
gated by the kernel exactly as in a normal session.
