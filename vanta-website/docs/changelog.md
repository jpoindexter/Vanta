---
id: changelog
title: Changelog
sidebar_position: 2
---

# Changelog

Major capability milestones, newest first. This is a curated highlight reel — the full per-slice history lives in `roadmap.json` (488 shipped of 856). See the [Roadmap](./roadmap.md) for what's ahead.

## Docs & polish
- Full documentation site (this site) — diagrams, complete tool + command reference generated from source, use cases, guides, FAQ.
- Modularity made the standard: ports/adapters seams + the code-size fitness function.

## Operator runtime
- **Operator systems** — world model, Money OS, opportunity radar, background teams, life-wide search, self-repair compartments, reach doctor, verification organ.
- **Executive-function gates** — research/inhibit/set-shift/closure/stall guardrails to keep long runs on-task; the task stack.
- **Self-improvement** — the factory (`vanta improve`), the evolve loop, the eval harness, an independent critic.

## Interface
- **Terminal UI rebuild** on real Ink — inline render + committed scrollback, markdown, diffs, approvals menu, cockpit, ⌘-style overlays; mission-control shell (`VANTA_TUI=v2`); desktop renderer.
- Slash-command surface grew to **97 commands**; per-turn tool scoping over **86 tools**.

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
