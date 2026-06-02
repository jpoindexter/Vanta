---
name: argo-context-sync
description: Use after completing any Argo build slice, phase, or structural change (new module, layer, tool, provider, command, env var, API route, or locked decision). Keeps the per-level CLAUDE.md context files, README, PRD checkboxes, and project memory accurate and dense so future sessions and subagents don't re-derive context or burn tokens trusting stale docs.
---

# Argo Context Sync

Keep Argo's context files true to the code after every meaningful change. Stale docs cost more tokens than no docs — a subagent that trusts a wrong file map wastes a whole round-trip. This skill is the discipline that stops drift between what the code does and what the docs claim.

## When to run

- Finished a build slice or phase (and it verifies — tests pass, typecheck clean)
- Added or removed a module, tool, provider, or directory level
- Changed a command, env var, or API surface
- Locked a design decision
- Hit a gotcha worth recording for next time

## Do NOT run for

- Work in progress — wait until the slice actually verifies
- Pure refactors with no structural or decision change
- Trivial edits (typo, comment) that don't change the file map or behavior

## Checklist (create a TodoWrite item per step)

1. **Verify reality first.** `ls` the changed directories and `grep` the actual exports, routes, and commands. Update docs from what *is*, never from memory. A file map listing a deleted file is worse than none.

2. **Nearest-level CLAUDE.md.** Update the file map, decisions, and gotchas for the layer you touched — `argo-ts/CLAUDE.md` for agent work, root `CLAUDE.md` for kernel work. One line per file/fact.

3. **New directory level → new CLAUDE.md.** If you created a new layer or package, add a `CLAUDE.md` there: one-line role, file map, key decisions, how-to-extend, commands. Link up to the parent.

4. **Root CLAUDE.md status + maps.** Update the `## Status` line (current phase, test count, what's next) and the kernel module/API tables if the kernel changed.

5. **README "What works now."** Only if the change is user-facing. Keep the run commands runnable — actually run them.

6. **PRD checkboxes** (`docs/prd.md`). Tick the phase done-criteria you met. If scope shifted, note it explicitly — don't rewrite the roadmap silently.

7. **Locked decisions.** Add to the layer CLAUDE.md "Key decisions (don't re-litigate)" section: the choice + a one-line why. This is what stops future re-debate.

8. **Project memory.** Update `MEMORY.md` index + `project_argo.md` with new state, new gotchas, and the next step. Convert relative dates to absolute.

9. **Self-check.** Re-read each edited file: does the map match `ls`? Do the commands run? Any reference to a renamed or deleted thing? Fix inline.

## Density rules (non-negotiable — token economy is the whole point)

- Tables and one-liners over prose. No "this section describes…" filler.
- Decisions get a *why*; facts don't.
- If a CLAUDE.md exceeds ~120 lines, it's carrying explanation that belongs in code comments or the PRD — trim it.
- Global `~/.claude/CLAUDE.md` conventions are inherited, never repeated.
- The test: could a fresh subagent do the next slice from these files without opening more than 2-3 source files? If not, the docs are incomplete. If they're reading docs longer than the code, they're bloated.
