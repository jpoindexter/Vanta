---
name: standing-loops
description: "Design and run a safe standing job (loop / routine) in Vanta: the inspect-act-guard-report shape, the Never-gate, an explicit stop condition, and how to schedule it. Load before building any keep-green / prod-watch / cluster-feedback job."
created: 2026-06-07
updated: 2026-06-07
tags: [loops, routines, automation, scheduling, cron, safety, agentic]
---

# Standing Loops & Routines

A **standing loop** is a job that keeps one thing true on a cadence — "keep the repo green", "watch prod errors", "cluster new feedback". Boris Cherny runs dozens ("loops are the future"). This skill is the *shape* and the *guardrails*; the specific jobs (`keep-green`, `prod-watch`, `cluster-feedback`, `hill-climb`) instantiate it.

## When to use

Load this whenever the user wants something to run repeatedly, stay watching, or "keep X true" — **before** you write the job. The other loop skills assume this discipline.

## Vanta's primitives (use the real ones — there is no built-in `/loop`)

| Want | Vanta primitive |
|------|-----------------|
| Run the job once, now | `vanta run "<the job>"` — one session; the agent iterates internally (bounded by `VANTA_MAX_ITER`, default 50). |
| Run it on a cadence (survives laptop-close) | `vanta schedule "<the job>" --cron "<expr>"` registers it in `.vanta/cron.tsv`; `vanta cron` runs due tasks. Wire the OS scheduler once — `vanta service install` keeps the gateway alive, which ticks `cron` every minute. |
| "Until done" — a target, not a clock | a single iterating session — see the `hill-climb` skill. Vanta has **no** self-pacing loop; the stop is a measurable target, not an interval. |

Cron is 5-field (`*/15 * * * *` = every 15 min); minimum granularity is one minute.

## The shape — every good loop prompt

```
<one sentence: what must stay true>

Each run:
- Inspect: <logs · working tree · a query · inbox · metrics>
- Do (no asking): <safe, reversible actions only>

Never (surface instead): <irreversible / blast-radius actions>
Stop / escalate when: <repeated failure · ambiguity · risk>
Report each run: <cause · change · proof>. Idle -> say so and end.
```

## The four guardrails (non-negotiable — this is the leash)

1. **Explicit stop condition.** Every loop ends: target met, N runs with no progress, or nothing-to-do. A loop with no stop is a runaway.
2. **The Never-gate.** Name the irreversible actions the job must NOT take and must surface instead: push to a shared branch, run migrations, touch `.env`/secrets, deploy, delete, send. The kernel already gates these (`assess()` -> Ask/Block), but state them in the prompt so the agent self-stops before even proposing them.
3. **Per-run report.** Cause · what changed · proof (green/red, counts, file:line). No silent runs.
4. **Give up and flag.** After 3 attempts on the same failure, stop and surface it — don't thrash.

## Solo cut

Solo (no PRs, no review gate): a loop works your **branch / working tree directly**, so the leash is the Never-gate + **commit, don't push**. `git_commit` on the current branch is reversible; `git_push` to a shared branch is not — keep it behind the gate.

## Attribution

Adapted from Boris Cherny, *Why Coding Is Solved* (Anthropic, 24:33), §2 "Loops & Routines", via the build-catalog extraction. Mapped to Vanta's primitives (`vanta run` / `vanta schedule --cron` / `vanta cron`).
