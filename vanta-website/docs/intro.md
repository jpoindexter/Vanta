---
id: intro
title: Introduction
sidebar_position: 1
slug: /docs
---

# Vanta

**A full-capability personal operator for trusted continuity and verified follow-through.**

Vanta is a broad personal AI operator across research, files, software, documents, communication, schedules, business, media, life administration, and automation. Its wedge is trusted continuity when attention, memory, time, and executive function are finite.

Neurodivergent and disability experience supplies curb-cut universal-design requirements without limiting the audience or requiring diagnosis disclosure. Vanta is designed to capture messy intent, recommend or prepare one safe next action, preserve waiting and follow-up through interruption, and close only with evidence.

Autonomy is progressively earned per workflow and domain: R0 Observe → R1
Recommend → R2 Prepare → R3 Confirm → R4 Delegate → R5 Autonomous delegate.
`R0`–`R5` are autonomy labels only. Authority remains user-owned, visible,
scoped, revocable, and interruptible.

## Two layers

| Layer | Language | Role |
|-------|----------|------|
| **`vanta-kernel`** (`src/`) | Rust, zero deps | The intended enforced security boundary: risk classifier, approval queue, goal ledger, event log, HTTP sidecar |
| **`vanta`** (`vanta-ts/`) | TypeScript, Node 22 | The agent loop, providers, tools, work state, memory, jobs, Desktop, and extensibility |

The Rust kernel and shared TypeScript action gateway form the checked effect boundary. The bounded `TRUST-02`, `TRUST-04`, and `TRUST-01` contracts have executed evidence across the documented local and signed macOS paths, including secondary hosts, exact authority, failure recovery, and typed receipts. The versioned inventory—not a broad marketing claim—defines coverage; future executors and other hosts require fresh evidence. The repository product-acceptance record separates that executed boundary from release and external-proof work.

## What it does

- **Core loop** — goal-inject → plan → assess → execute → verify. Works with OpenAI, Ollama, Anthropic, Gemini, and OpenRouter models.
- **Skills & memory** — learned skills and per-goal memory in `~/.vanta`, git-versioned for free history.
- **Profiles & work routing** — persistent specialist profiles with isolated state, installable distributions, and a durable Kanban router with evidence receipts.
- **Corpus & ecosystem** — searchable notes/transcript ingestion with source freshness, plus approval-gated discovery and installation from public skill registries.
- **Web, browser & vision** — automatic search routing across managed and browser-backed providers, readable page fetch, Playwright navigate/click/extract, image understanding, and explicit macOS area/window/display capture through [Sight](./sight.md).
- **Code & dev** — scoped file editing, grep/glob, sandboxed code execution, TypeScript LSP diagnostics, git tools, regression locks.
- **Autonomous & multi-agent** — schedules and bounded workers are internal capabilities for one owner. Fan-out is not the product identity, and every effect still needs the same scoped authority and receipt contract.
- **Operator systems** — world model, opportunity radar, life-wide search, self-repair compartments.
- **Reach surfaces** — CLI/TUI, web cockpit, desktop, native mobile over the
  API/gateway, and 22 registered messaging adapters. Telegram and ntfy have
  accepted live receipts; other platforms and physical devices retain their own
  setup and acceptance gates.

## Why "trusted operator"

The product contract requires three properties:

1. **Goal-aware** — the agent knows internally which goal an action serves before it acts.
2. **Boundary-enforced** — consequential effects cross one action gateway and consume exact, expiring authority.
3. **Verified reporting** — WorkItems use the exact lifecycle draft, queued,
   running, waiting, needs human, stopped, failed, unverified, and verified;
   receipts separately record denied, expired, unknown, and compensated
   dispositions.

These are product requirements. The supported local contracts have passed their retained real paths; release packaging, other operating systems, live accounts, and future roadmap cards remain separately gated.

Next: [install and run it →](./quickstart.md)
