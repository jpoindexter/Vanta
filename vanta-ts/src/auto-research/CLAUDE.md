# CLAUDE.md — auto-research

This folder owns `vanta auto-research`.

`loop.ts` measures a numeric metric, spawns one candidate worker in an isolated worktree per iteration, commits the candidate branch, re-measures, merges only if the metric improves, journals the delta, and stops on no-progress or max iterations. `metric.ts` parses numeric metric-command output; `vcs.ts` handles candidate commits; `format.ts` owns CLI output.

Rules:
- Do not edit `src/factory/*`; this layer composes existing agent/worktree primitives.
- Keep subjective or live-only evals out of this loop. The metric must produce a number.
- Main branch should only receive metric-improving candidate commits.
