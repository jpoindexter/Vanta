---
id: intro
title: Introduction
sidebar_position: 1
---

# Vanta

**A local trusted-operator agent — knows the goal before it picks a tool, enforces scope on every action, reports only what it actually verified.**

Vanta is not a chatbot, a dashboard, or a thin wrapper. It's a full-capability personal operator agent with one structural advantage over everything before it: every action is checked against an enforced safety boundary *before* it runs, and the agent always knows which goal an action serves.

## Two layers

| Layer | Language | Role |
|-------|----------|------|
| **`vanta-kernel`** (`src/`) | Rust, zero deps | The **enforced** security boundary: risk classifier, approval queue, goal ledger, event log, HTTP sidecar |
| **`vanta`** (`vanta-ts/`) | TypeScript, Node 22 | The agent loop: LLM providers, tools, three-tier prompt. Gates every action through the kernel |

The kernel is the boundary — its `assess()` is a gate, not a suggestion. The TypeScript layer orchestrates but **cannot bypass the kernel**. This separation is the whole point: the part that decides what's safe is small, auditable, and written in a language with no runtime surprises.

## What it does

- **Core loop** — goal-inject → plan → assess → execute → verify. Works with OpenAI, Ollama, Anthropic, Gemini, OpenRouter, and Claude-subscription providers.
- **Skills & memory** — learned skills and per-goal memory in `~/.vanta`, git-versioned for free history.
- **Web, browser & vision** — search (DuckDuckGo/Searxng/SerpAPI/Brave), readable page fetch, Playwright navigate/click/extract, and image understanding.
- **Code & dev** — scoped file editing, grep/glob, sandboxed code execution, TypeScript LSP diagnostics, git tools, regression locks.
- **Autonomous** — cron scheduler, background workers, subagent delegation, and an agent-to-agent bus.
- **Operator systems** — world model, opportunity radar, life-wide search, self-repair compartments.

## Why "trusted operator"

Three properties hold on every action:

1. **Goal-aware** — the agent knows internally which goal an action serves before it acts.
2. **Boundary-enforced** — the kernel classifies every action `allow` / `ask` / `block` and the agent physically cannot skip that check.
3. **Verified reporting** — it reports what it actually confirmed, not what it assumed.

Next: [install and run it →](./quickstart.md)
