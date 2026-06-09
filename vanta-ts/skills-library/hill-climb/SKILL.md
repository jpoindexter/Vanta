---
name: hill-climb
description: "Iterate toward one measurable target until met or capped: measure -> one improvement -> commit -> re-measure -> log the delta. A bounded session (or cron-driven re-runs); the stop is the target, not a clock."
created: 2026-06-07
updated: 2026-06-07
tags: [iterate, target, measurable, refactor, incremental, stop-condition, grind]
---

# Hill Climb

"Give it a target and tell it to iterate until done." The stop condition is a **measurable target**, not an interval. (This is exactly how Vanta's own SIZE-PAYDOWN grind ran: a `vanta lint` count driven toward zero, one verified commit at a time.)

## When to use

A quantifiable goal you can re-measure every iteration: "every file < 300 lines", "zero `any`", "`vanta lint` -> 0", "bundle < 200kb", "coverage >= 80%". Not for open-ended work — if you can't measure "done", use `standing-loops` or `writing-plans` instead.

## The mechanism (accurate to Vanta — there is no self-pacing loop)

- **Single session (preferred):** `vanta run "<target>"` — the agent iterates inside one session (bounded by `VANTA_MAX_ITER`). Best when the target is reachable in one sitting.
- **Cron-driven:** `vanta schedule "<one iteration toward <target>>" --cron "<expr>"` — each run makes one increment and re-checks the measure. Best for long grinds that should survive laptop-close. Persist the measure (a file, or just re-run the metric command) so each run knows where it left off.

## Each iteration

1. **Measure.** Run the metric command (`shell_cmd`); record the number.
2. **One improvement.** A single, scoped change toward the target — no batching, no "while I'm here".
3. **Verify + commit.** Gate it (tests / typecheck / lint as relevant), then `git_commit` on the current branch.
4. **Re-measure.** Log the delta (`was N -> now M`).

## Stop when

- The target is met, **or**
- **3 iterations with no progress** on the metric — stop and report what's blocking. Don't thrash.

## Never

Push to shared, deploy, or take an irreversible step to "hit the number". A metric made green by breaking something else is failure — re-measure the **whole** gate each iteration, not just the target metric.

## Attribution

Adapted from Boris Cherny, *Why Coding Is Solved* (Anthropic, 11:53 "iterate until done"), via the build-catalog extraction. Reframed for Vanta: no self-pacing loop — the stop is a measurable target.
