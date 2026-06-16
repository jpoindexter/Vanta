# STRATEGY.md — Vanta

> The spine the roadmap hangs off. roadmap.json must agree with this file; when it doesn't, this file wins. Locked 2026-06-11 (see DECISIONS.md).

## North star

A **local trusted operator**: knows the goal before it picks a tool, enforces scope on every action, reports only verified output. Local-first, kernel-gated, no platform, no SaaS.

## What we are building (in priority order)

| # | Pillar (`track`) | What it is | Wins when |
|---|------------------|------------|-----------|
| 1 | **Harness** | The agent loop + kernel boundary, solid & trusted: tool exec, hooks, goals, sessions, context, permissions engine, reliability, multi-agent mechanics | A long autonomous run finishes verified work without babysitting |
| 2 | **Operator** | The better Hermes / Open Claw, **neurodivergent-first**: surfaces (TUI, **desktop app**) + reach (comms, senses, brain, memory, selfhood) + **executive-function support built into the product** (EF gates + ND behaviors generalized to any ND user via a per-user ND profile) — how Vanta serves its operator. Lean, not bloated (steal affordances, not sprawl). See DECISIONS 2026-06-16. | Any ND operator reaches for Vanta over any other agent for daily operating |
| 3 | **Solutioning** | The front half of rocket.new's loop, Vanta-native: research → decide **what to build + how to win** → (AUTO-WATCH watches what's next). Evidence-backed ranked recommendations before any build action | Vanta proposes the right thing to build, with sources, unprompted |
| 4 | **Extensibility** | Grow without core edits: plugins, MCP (use·make·serve), skills, agent definitions, providers | A third-party capability lands without touching `src/` |
| 5 | **Cofounder engine** | What THEFT AI (company-OS on Paperclip) needs Vanta to be as its operator engine. Engine only — product surfaces live in the THEFT repo | THEFT's Operator role is played by Vanta, not a bespoke loop |

## The filter (CC parity is a quarry, not a goal)

Claude Code / Hermes / Open Claw / rocket.new are **quarries**: steal what serves the pillars, leave the rest in the ground. Every stolen card answers one question:

> Does this make Vanta a better trusted local operator — or just more like the thing it was copied from?

Auto-park, no debate: Anthropic cloud/account/billing coupling · enterprise policy/MDM · IDE-plugin surfaces · their telemetry · duplicate of an existing card · conflicts with rule zero (e.g. speculative pre-execution). Parked cards go to PARKED.md with the reason; full bodies recoverable from git history.

## One source of truth

- `roadmap.json` — the only work database. **Every card carries `track` = one of the 5 pillars.** Edit via tools/scripts (`roadmap_add`, `roadmap_move`, `vanta roadmap …`), never by hand-editing generated views.
- `STRATEGY.md` (this file) — direction. `DECISIONS.md` — locked choices. `PARKED.md` — deliberately-not list. `ERRORS.md` — failure log.
- `roadmap.html` (gitignored) and the agent-readable build order — **generated views, never edited**. Regenerate: html via `roadmap/build.ts buildRoadmap`; build order via `node scripts/build-order.mjs`.

## Build order rule

`status (building > next > horizon)` → `tier (rock > pebble > sand)` → `pillar (table order above)` → `size (S→XL)` → `effort (low→high)` → stable. A card with `after: [ids]` never sorts before an open dependency. New cards must name a pillar and a tier or they don't get filed.
