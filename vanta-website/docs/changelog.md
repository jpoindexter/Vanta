---
id: changelog
title: Changelog
sidebar_position: 2
---

# Changelog

Major capability milestones, newest first. This is a curated highlight reel — the full per-slice history lives in `roadmap.json` (888 shipped of 1053). See the [Roadmap](./roadmap.md) for what's ahead.

## Voice, desktop & on-device tuning
- **Voice input** — hold-to-talk speech-to-text, transcribed locally on your machine.
- **Native desktop control** — Vanta can see the screen and click/type/scroll to drive native apps, in addition to the browser.
- **Terminal capture** — read a live terminal pane into context.
- **Slack channel autocomplete** — type `#` in the composer to pick a channel.
- **Parallel swarm** — fan independent tasks across a live multi-pane terminal session, one worker per pane.
- **Personal tuning** — train a small on-device adapter from the choices you've accepted and rejected, so Vanta drifts toward your preferences.
- **Self-serve setup** — the setup wizard turns these on and walks you through the one-time OS permissions.

## Docs & polish
- Full documentation site (this site) — diagrams, complete tool + command reference generated from source, use cases, guides, FAQ.
- Modularity made the standard: ports/adapters seams + the code-size fitness function.

## Operator runtime
- **Operator systems** — world model, Money OS, opportunity radar, background teams, life-wide search, self-repair compartments, reach doctor, verification organ.
- **Executive-function gates** — research/inhibit/set-shift/closure/stall guardrails to keep long runs on-task; the task stack.
- **Self-improvement** — the factory (`vanta improve`), the evolve loop, the eval harness, an independent critic.

## Interface
- **Terminal UI rebuild** on real Ink — inline render + committed scrollback, markdown, diffs, approvals menu, cockpit, ⌘-style overlays; mission-control shell (`VANTA_TUI=v2`); desktop renderer.
- Slash-command surface grew to **125 commands**; per-turn tool scoping over **119 tools**.

## Selfhood & knowledge
- **Brain** — one cohesive memory unit (markdown regions + structured, decaying entries) with recall guardrails.
- **Knowledge graph** + **references** for cross-session facts and ingested sources.
- **MCP** both directions — mount external servers as tools; serve Vanta as an MCP server.

## v1 — feels like an operator
- Hook to **any model** (OpenAI/Ollama/Anthropic/Gemini/OpenRouter) via a first-run **setup wizard**.
- **Continuity** — age-gated resume, fork, handoff, session memory, standing loops.
- **Self-improvement loop**, bundled **skill library**.
- **Gateway** — run as a service, messaging (Telegram), webhooks.

## v0 — all the parts
- Rust **safety kernel** — risk classifier (allow/ask/block), approval queue, goal ledger, tamper-evident event log, HTTP sidecar.
- Core agent loop + the first tools (files, web, browser, vision, code, comms).
- Skills & per-goal memory; cron, subagents, operator modes.

> Dates and exact slice history are tracked in `roadmap.json`; this page summarizes the waves of capability as they landed.
