---
id: executive-function
title: Executive-function gates
sidebar_position: 7
---

# Executive-function gates

Vanta runs a set of always-on, best-effort guardrails that keep a long agent session on-task — modeled on executive-function support. Every gate is wrapped so a failure degrades silently rather than breaking the loop.

## The gates

| Gate | When it fires |
|------|---------------|
| **Research gate** | Too many consecutive read/analyze turns with no write/command — restates the goal, asks to pick one thing to build |
| **Complexity gate** | Before a multi-file / schema / ambiguous request — suggests plan mode |
| **Inhibit** | After consecutive off-goal / non-output turns — names the drift |
| **Set-shift** | Same primary tool / same error 3+ turns with no progress — names the stuck loop, proposes a different strategy |
| **Self-monitor** | Pre-execution heuristic before a destructive action on an additive goal — warns (zero-LLM, never blocks) |
| **Error-detect** | Consecutive error results — surfaces a note + an iteration-check callback |
| **Closure gate** | On topic shift with unclosed `write_file` calls lacking a follow-up commit |
| **Stall-unblock** | Active goal but no write/commit for N turns — names the top backlog card as the unblocker |
| **Working memory** | `/where` · `/wm` — last intent + recent tool calls breadcrumb |

## How they run

- **Pre-turn** gates (complexity, closure, topic-shift) fire as a turn starts.
- **In-loop** gates (self-monitor, error-detect) fire inside tool dispatch.
- **Post-turn** gates (inhibit, set-shift, stall) run after a turn as session-scoped state.

Thresholds are env-tunable (`VANTA_INHIBIT_THRESHOLD`, `VANTA_SETSHIFT_THRESHOLD`, `VANTA_STALL_THRESHOLD`, …), and the whole layer is configurable per operator.

## Task stack

A persistent, project-scoped stack of what you're attending to — the loop-closer that pairs with the closure gate.

- **Command:** `/tasks` (and `/tasks next` for the best move)
- **Store:** `.vanta/task-stack.json`
- **Statuses:** pending · active · blocked · parked · closed

`selectNextTask` biases toward **closure** (finishing what's in flight over starting new work), and a summary is injected into the prompt so the agent stays anchored to the open stack. Tasks relate to the closure gate and the roadmap.

## Bundled discipline skills

The skill library auto-installs a set of `nd-*` executive-function skills (e.g. research-gate, choice-reduce, task-boundary, time-blindness, hyperfocus-guard) plus build-discipline skills — applied as behavioral patterns, not one-off prompts. See [Skills & memory](./skills-and-memory.md).
