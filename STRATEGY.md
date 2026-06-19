# STRATEGY.md — Vanta

> The spine the roadmap hangs off. roadmap.json must agree with this file; when it doesn't, this file wins. Locked 2026-06-11 (see DECISIONS.md).

## North star

A **trusted operator that runs anywhere you control**: knows the goal before it picks a tool, enforces scope on every action, reports only verified output. **User-controlled-infrastructure-first** — laptop, VPS, home server, container, SSH, or serverless — and the **kernel travels with it**, gating every action wherever it runs. No vendor lock-in, your data residency. (Not a hosted SaaS-as-a-business, not coupled to any vendor's cloud/account/billing — the kernel boundary is what makes running on a $5 VPS safe.)

## What we are building (in priority order)

| # | Pillar (`track`) | What it is | Wins when |
|---|------------------|------------|-----------|
| 1 | **Harness** | The agent loop + kernel boundary, solid & trusted: tool exec, hooks, goals, sessions, context, permissions engine, reliability, multi-agent mechanics | A long autonomous run finishes verified work without babysitting |
| 2 | **Operator** | A **neurodivergent-first** operator layer: surfaces (TUI, **desktop app**) + reach (comms, senses, brain, memory, selfhood) + **executive-function support built into the product** (EF gates + ND behaviors generalized to any ND user via a per-user ND profile) — how Vanta serves its operator. Lean, not bloated (steal affordances, not sprawl). See DECISIONS 2026-06-16. | Any ND operator reaches for Vanta over any other agent for daily operating |
| 3 | **Solutioning** | The front half of the build loop, Vanta-native: research → decide **what to build + how to win** → (AUTO-WATCH watches what's next). Evidence-backed ranked recommendations before any build action | Vanta proposes the right thing to build, with sources, unprompted |
| 4 | **Extensibility** | Grow without core edits: plugins, MCP (use·make·serve), skills, agent definitions, providers | A third-party capability lands without touching `src/` |
| 5 | **Cofounder engine** | What a single owner needs to **fan out and run a company of sub-agents** — org chart, budgets, governance, heartbeats, tickets, maximizer — all **kernel-gated to one owner**. Multi-tenancy (serving other humans/companies) stays parked. No THEFT; Vanta carries this natively (DECISIONS 2026-06-19 — multi-agency, not multi-tenancy). | Vanta fans out a team of sub-agents that does real work for its owner, all gated by one kernel — not a bespoke loop, not a SaaS |

## The filter (other agents are reference points, not templates)

Other agents are reference points, not templates: adopt only what serves the pillars, leave the rest. Every adopted idea answers one question:

> Does this make Vanta a better trusted local operator — or just more like something else?

Auto-park, no debate: Anthropic cloud/account/billing coupling · enterprise policy/MDM · IDE-plugin surfaces · their telemetry · duplicate of an existing card · conflicts with rule zero (e.g. speculative pre-execution). Parked cards go to PARKED.md with the reason; full bodies recoverable from git history.

## One source of truth

- `roadmap.json` — the only work database. **Every card carries `track` = one of the 5 pillars.** Edit via tools/scripts (`roadmap_add`, `roadmap_move`, `vanta roadmap …`), never by hand-editing generated views.
- `STRATEGY.md` (this file) — direction. `DECISIONS.md` — locked choices. `PARKED.md` — deliberately-not list. `ERRORS.md` — failure log.
- `roadmap.html` (gitignored) and the agent-readable build order — **generated views, never edited**. Regenerate: html via `roadmap/build.ts buildRoadmap`; build order via `node scripts/build-order.mjs`.

## Build order rule

`status (building > next > horizon)` → `tier (rock > pebble > sand)` → `pillar (table order above)` → `size (S→XL)` → `effort (low→high)` → stable. A card with `after: [ids]` never sorts before an open dependency. New cards must name a pillar and a tier or they don't get filed.
