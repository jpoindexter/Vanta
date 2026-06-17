---
id: roadmap
title: Roadmap
sidebar_position: 1
---

# Roadmap

Vanta ships as an ordered backlog of small, verified slices (tracked in `roadmap.json`). This is the product-level view: where it's been, what's in flight, and what's ahead.

## Now · Next · Later

| **Now** (in build) | **Next** (queued) | **Later** (horizon) |
|--------------------|-------------------|----------------------|
| User-facing, configurable executive-function gate engine | Terminal-UI depth — vim-mode composer, richer status line, multi-agent progress visibility | Isolated git-worktree workspaces for parallel agents |
| | Automation depth — richer hook types & event coverage | Multi-agent plan execution |
| | Mission-control shell rails (state · safety · working-memory · telemetry) | Swarm backends & peer-agent discovery |
| | Preference / "want" engine — learn and apply operator preferences | Deeper session-memory compaction into durable files |
| | Solutioning depth — stronger what-to-build recommendations | Template/pattern injection for common task shapes |

## Milestone timeline

```mermaid
timeline
  title Vanta — shipped milestones → ahead
  section Foundations
    Rust safety kernel : assess · approvals · goal ledger · event log
    Agent loop : goal-aware · kernel-gated · errors-as-values
  section v0 — all the parts
    Capabilities : files & code · web · browser & vision · comms
    Skills & memory : learned skills · per-goal memory · curator
    Autonomy : cron · subagents · operator modes
  section v1 — feels like an operator
    Any model : setup wizard · provider matrix
    Continuity : age-gated resume · fork · handoff
    Self-improvement : background skill capture
    Gateway : service · messaging · webhooks
  section Selfhood & MCP
    Brain : md regions + structured entries · guardrails
    MCP : mount · serve · runtime mount
  section Operator & runtime
    Operator systems : world · money · radar · teams · life-search · self-repair · reach
    Terminal UI : real Ink rebuild · mission-control · approvals
    Executive-function gates : on-task discipline
    Modularity : ports-and-adapters as the standard
  section Now & ahead
    Now : configurable EF gate engine
    Next : TUI depth · automation depth · preference engine
    Later : worktrees · multi-agent plans · cofounder engine
```

## Status mix

```mermaid
pie showData
  title 856 slices by status
  "Shipped" : 488
  "Next" : 283
  "Horizon" : 80
  "Parked" : 4
  "Building" : 1
```

A slice is *shipped* only when its done-criterion holds — tests green, behavior verified.

## The five pillars

Work is organized under five strategy pillars, in priority order (earlier ones are load-bearing for later):

1. **Harness** — the agent runtime: loop, prompt, tools, safety, TUI, sessions, discipline.
2. **Operator** — acting across your systems: world, money, radar, teams, search, self-repair, reach.
3. **Solutioning** — deciding *what* to build before building it.
4. **Extensibility** — swappable seams: providers, tools, search, MCP, plugins.
5. **Cofounder engine** — the long arc: carrying real business and product work end-to-end.

| Pillar | Slices |
|--------|-------:|
| Harness | 403 |
| Operator | 382 |
| Extensibility | 52 |
| Solutioning | 10 |
| Cofounder engine | 9 |

## How statuses move

```mermaid
flowchart LR
  next[Next] --> building[Building]
  building --> shipped[Shipped]
  next -. deferred .-> horizon[Horizon]
  next -. dropped .-> parked[Parked]
  horizon -. promoted .-> next
  parked -. promoted .-> next
```

- **Next** — queued, buildable now · **Building** — in progress (one at a time) · **Shipped** — done + verified
- **Horizon** — deferred until a prerequisite exists · **Parked** — set aside with a documented cost-to-revisit; promoted, never silently dropped

## Working principles

- One feature end-to-end before the next; refactors come after a slice ships.
- Decisions are append-only and not re-litigated without new information.
- The kernel boundary (Rule Zero) holds on every slice — see [Safety model](./safety-model.md).

> Counts reflect the latest `roadmap.json` snapshot and move as work lands.
