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
flowchart TB
  F["<b>Foundations</b> — shipped<br/>Rust safety kernel · agent loop"]
  V0["<b>v0 — all the parts</b> — shipped<br/>files & code · web · browser & vision · comms<br/>skills & memory · cron · subagents · operator modes"]
  V1["<b>v1 — feels like an operator</b> — shipped<br/>any model + setup wizard · age-gated resume · fork · handoff<br/>self-improvement · gateway (service · messaging · webhooks)"]
  SM["<b>Selfhood & MCP</b> — shipped<br/>brain (regions + structured entries · guardrails)<br/>MCP mount · serve · runtime mount"]
  OR["<b>Operator & runtime</b> — shipped<br/>operator systems · real Ink terminal UI · mission-control<br/>executive-function gates · ports-and-adapters standard"]
  NOW["<b>Now</b> — open beta push<br/>install-anywhere · live-proof the core task paths<br/>multi-channel reach (Telegram · WhatsApp · Signal · Discord · Slack) · images & voice in every channel"]
  NEXT["<b>Next</b><br/>serverless presence (hibernate + wake-on-message) · zero-context tool pipelines<br/>dialectic user modeling · preference engine"]
  LATER["<b>Later</b><br/>multi-agent fan-out depth · org-chart · budgets and governance · maximizer mode"]
  F --> V0 --> V1 --> SM --> OR --> NOW --> NEXT --> LATER
```

## Path to open beta

The current build sequence is ordered to reach a **launchable open beta** — a stranger installs Vanta and it runs as a real operator. Everything else is sequenced behind it.

1. **Frictionless install** — one command, on any machine, no manual setup.
2. **Robust on local & budget models** — repair fumbled tool calls instead of failing the turn.
3. **Efficient multi-step work** — collapse a pipeline of tool calls into a single, cheap turn.
4. **Reaches you on your channels** — WhatsApp, Slack, and Telegram from one gateway.
5. **Images & voice in every channel** — send it a photo or a voice memo; it replies in kind.
6. **Proven live on a clean machine** — the core operator tasks verified end-to-end, not just in tests.
7. **Safe by default** — network egress is allow/deny controlled, on top of the kernel.

Past beta: serverless presence, wake word, ambient companion apps, a visual canvas, proactive outreach, and deeper personalization.

## Status mix

```mermaid
pie showData
  title 1053 slices by status
  "Shipped" : 888
  "Next" : 9
  "Horizon" : 136
  "Parked" : 20
```

A slice is *shipped* only when its done-criterion holds — tests green, behavior verified.

## The five pillars

Work is organized under five strategy pillars, in priority order (earlier ones are load-bearing for later):

1. **Harness** — the agent runtime: loop, prompt, tools, safety, TUI, sessions, discipline.
2. **Operator** — acting across your systems: world, money, radar, teams, search, self-repair, reach.
3. **Solutioning** — deciding *what* to build before building it.
4. **Extensibility** — swappable seams: providers, tools, search, MCP, plugins.
5. **Cofounder engine** — fan out and run a company of sub-agents for *one owner*: org chart, budgets, governance, heartbeats — all kernel-gated. (Multi-tenancy — serving other people as a business — stays parked.)

| Pillar | Slices |
|--------|-------:|
| Harness | 473 |
| Operator | 463 |
| Extensibility | 67 |
| Solutioning | 12 |
| Cofounder engine | 36 |

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
