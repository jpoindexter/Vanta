---
name: keep-green
description: "Keep a repo green on the current branch: run typecheck + tests + build, fix any breaks, commit the fix - never push. Use as a standing job or a one-shot repair."
created: 2026-06-07
updated: 2026-06-07
tags: [ci, tests, typecheck, build, green, commit, repair, automation, loop]
---

# Keep Green

Boris's flagship loop, solo cut: watch the current branch, run the suite, repair breaks, commit the fix — no PR, no review gate. The daily workhorse. Read `standing-loops` first for the loop discipline.

## When to use

"Keep this building", "keep the repo green", or as the body of a scheduled job. Also good one-shot: "get the suite passing again".

## Procedure

1. **Detect the check commands.** Read `package.json` scripts (`typecheck`/`test`/`build`), `Makefile`, `cargo`, etc. with `read_file` — don't assume.
2. **Run in order, stop at first red:** typecheck -> tests -> build, via `shell_cmd`. Capture the exact failure (file:line, message).
3. **If red:** read the failure -> fix *minimally* (root cause, not a patch — use `systematic-debugging` if it isn't obvious) -> re-run that gate until green -> continue.
4. **Commit the fix** with `git_commit` on the **current branch**, conventional message (`fix: <what>`). Re-run the full set once to confirm green before reporting.

## Never (surface instead)

- `git_push` to `main`/shared, run **migrations**, touch `.env` / secrets, **deploy**. The kernel gates these — don't route around it.
- Give up after **3 attempts** on the same failure — stop and flag it with the error.

## Report

`what broke · what you changed · green/red now`. Already green -> say "clean" and end.

## Run it

- One-shot: `vanta run "keep <repo> green on the current branch; commit fixes, never push"`.
- Recurring: `vanta schedule "keep <repo> green on the current branch; commit fixes, never push" --cron "*/15 * * * *"`.

## Attribution

Adapted from Boris Cherny, *Why Coding Is Solved* (Anthropic, 08:23 "keep CI healthy"), via the build-catalog extraction. Solo-oriented: commit, don't push.
