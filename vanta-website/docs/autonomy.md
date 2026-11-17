---
id: autonomy
title: Autonomy & multi-agent
sidebar_position: 5
---

# Autonomy & multi-agent

Vanta has unattended scheduling and worker capabilities. Consequential
autonomy is promoted only after exact authority, receipts, recovery, and effect
mediation pass in the named domain.

`R0`–`R5` are the canonical target/migration contract and are reserved
exclusively for autonomy. Current legacy runtime stores still expose
`watch | queue | auto` and `acts-alone | queues-for-approval | wakes-me`; those
are compatibility inputs, not aliases for R0–R5:

1. **R0 — Observe:** read, classify, and report; no mutation.
2. **R1 — Recommend:** identify the outcome and propose one next action; no mutation.
3. **R2 — Prepare:** create private, reversible drafts, tasks, notes, reminders, or isolated artifacts.
4. **R3 — Confirm:** show the exact action preview and require fresh one-use authority.
5. **R4 — Delegate:** run an allowlisted recurring workflow within explicit target, account, recipient, quota, budget, expiry, exclusions, cancellation, and review bounds.
6. **R5 — Autonomous delegate:** in a proven bounded domain, initiate, chain, coordinate, communicate with permitted parties, monitor, reconcile, follow up, and recover without per-step approval.

Grants remain user-owned, inspectable, interruptible, budgeted, revocable, and
automatically demoted after failure or drift. `E0`–`E5` is reserved for a
future consequence classifier, not an operative runtime scale; it never grants
autonomy or replaces `Allow | Ask | Block`.

The canonical target WorkItem lifecycle is `draft`, `queued`, `running`, `waiting`,
`needs human`, `stopped`, `failed`, `unverified`, `verified`. `denied`,
`expired`, `unknown`, and `compensated` are receipt/action dispositions, not
WorkItem states. Inbox, Today, Doing, Waiting, Needs You, and Done are UI
projections. Legacy task stores remain on their existing lifecycle until
read-only projection, reconciliation, bounded cutover, restart, and rollback
evidence are complete.

## Scheduling (cron)

```bash
vanta schedule "<instruction>" --cron "0 8 * * *"   # add a recurring task
vanta schedule list                                  # see tasks
vanta cron                                            # run due tasks (OS-scheduler-invoked)
```

Tasks live in `.vanta/cron.tsv` (5-field cron). The runner runs every due active task; one failure doesn't abort the batch.

## Subagent delegation

The `delegate` tool spawns a scoped worker with its own goal, prompt, and
iteration budget, and returns a result with its recorded verification status.
Worker prose is not evidence. Pass `agent_type` to select a built-in or
markdown-defined prompt, tool allowlist, and optional default model. The child
registry excludes `delegate` itself; universal worker effect mediation and
receipt semantics remain current trust work. See [Prompt presets & custom
agents](./prompt-presets-and-agents.md).

## Background teams

A named worker roster with a task ledger (assignment + legal status transitions):

- `team dispatch` / `advance` / `tasks` — manage assignments
- `team run` — spawns a worker for a dispatched task; the child registry
  excludes recursive fan-out. Worker effect mediation remains part of the
  trusted action-gateway acceptance.
- Manage from the CLI: `vanta agents`, `attach`/`logs`/`respawn`/`stop`/`rm <id>`, `daemon status/stop`

See [Operator systems](./operator-systems.md#background-teams).

## Swarm & workflows

`swarm` / `compose_workflow` coordinate multiple agents for a larger task; a local in-process A2A (agent-to-agent) message bus carries structured messages between them.

## Standing loops (Ralph)

A durable project loop persists to `.vanta/ralph-loop.json`: a goal, an ordered feature list, per-feature status, summaries, and the next action. On restart it surfaces **paused** until you `/goal resume` or `/goal drop` — it never silently resumes last session's work. The `/loops` view shows live loop state.

## Gateway (always-on)

Run Vanta as a service that reacts to schedules, messages, and webhooks — see [Comms & gateway](./comms-and-gateway.md).
