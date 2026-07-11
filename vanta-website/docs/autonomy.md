---
id: autonomy
title: Autonomy & multi-agent
sidebar_position: 5
---

# Autonomy & multi-agent

Vanta can run unattended, on a schedule, and fan work out to subagents — every spawned action still passes through the kernel.

## Scheduling (cron)

```bash
vanta schedule "<instruction>" --cron "0 8 * * *"   # add a recurring task
vanta schedule list                                  # see tasks
vanta cron                                            # run due tasks (OS-scheduler-invoked)
```

Tasks live in `.vanta/cron.tsv` (5-field cron). The runner runs every due active task; one failure doesn't abort the batch.

## Subagent delegation

The `delegate` tool spawns a scoped worker with its own goal, prompt, and iteration budget, and returns only the verified outcome. Pass `agent_type` to select a built-in or markdown-defined prompt, tool allowlist, and optional default model. The child registry excludes `delegate` itself, so there's no runaway recursion. See [Prompt presets & custom agents](./prompt-presets-and-agents.md).

## Background teams

A named worker roster with a task ledger (assignment + legal status transitions):

- `team dispatch` / `advance` / `tasks` — manage assignments
- `team run` — actually spawns a worker for a dispatched task (child registry excludes recursive fan-out; every worker tool call is kernel-gated)
- Manage from the CLI: `vanta agents`, `attach`/`logs`/`respawn`/`stop`/`rm <id>`, `daemon status/stop`

See [Operator systems](./operator-systems.md#background-teams).

## Swarm & workflows

`swarm` / `compose_workflow` coordinate multiple agents for a larger task; a local in-process A2A (agent-to-agent) message bus carries structured messages between them.

## Standing loops (Ralph)

A durable project loop persists to `.vanta/ralph-loop.json`: a goal, an ordered feature list, per-feature status, summaries, and the next action. On restart it surfaces **paused** until you `/goal resume` or `/goal drop` — it never silently resumes last session's work. The `/loops` view shows live loop state.

## Gateway (always-on)

Run Vanta as a service that reacts to schedules, messages, and webhooks — see [Comms & gateway](./comms-and-gateway.md).
