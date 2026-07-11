---
id: roadmap
title: Roadmap
sidebar_position: 1
---

# Roadmap

Where Vanta is headed and what just shipped — generated straight from the project board, so it never goes stale.

_1173 capabilities shipped · 2 in flight · 4 on the horizon. Updated 2026-07-11._

## In flight

What we are actively building next.

### Interrupted tool effects - preserve unknown mutations and inspect before retry

**Harness** · M-size

Vanta avoids automatic retries for known mutators, but an exception, timeout, process death, or dangling tool tail is not durably classified; session recovery can therefore lose the fact that a mutation may already have landed. Add Vanta-native effect disposition to the canonical tool result and recovery path

### Compaction real-headroom guard - stop when the prompt floor stays over threshold

**Harness** · M-size

Vanta anti-thrash currently scores estimated before/after message savings, so it can judge a rewrite healthy while the actual prompt still cannot fit. Judge compaction effectiveness from the next real provider prompt count and treat no-op boundaries as failed progress

## Recently shipped

The latest of 1173+ capabilities. See the [changelog](./changelog) for curated milestones.

- **System prompt presets - switch Vanta's operating role per session** — Operator · 2026-07-12
- **Prompt-routed agent spawn - launch workers with different operating prompts** — Harness · 2026-07-12
- **Roadmap unblock command — turn blocked cards into exact next actions** — Operator · 2026-07-11
- **Messaging channel parity — reach Hermes(20+)/OpenClaw(13+) channel coverage** — Operator · 2026-07-11
- **Fix: Cmd+V image paste into the TUI doesn't attach (only /image + drag-drop work)** — Operator · 2026-07-11
- **Autonomous (bash) builds in a Docker container — the containment that works** — Harness · 2026-07-11
- **Roadmap optional proof terminal — tabled experiments do not block completion** — Operator · 2026-07-11
- **Roadmap strategy parked terminal — out-of-strategy cards stop blocking completion** — Operator · 2026-07-11
- **A2A autonomous proof status — Docker/image/auth/receipt gate** — Harness · 2026-07-11
- **Profile roster — persistent specialist agents with isolated state** — Operator · 2026-07-11
- **Profile Kanban router — durable board routes work by specialist skill** — Operator · 2026-07-11
- **Second-brain corpus compiler — notes, transcripts, and receipts become searchable memory** — Operator · 2026-07-11
- **Delegation tree receipts — parent sees summaries, raw sidechains stay searchable** — Harness · 2026-07-11
- **Tool-surface profiles — shrink available tools by role and explain the boundary** — Harness · 2026-07-11
- **Webhook workflow builder — internet events trigger approved Vanta work** — Operator · 2026-07-11
- **Vault secrets rotation — one bootstrap token, scoped provider keys** — Harness · 2026-07-11
- **Dashboard plugin slots — operator home accepts safe custom panels** — Operator · 2026-07-11
- **Profile distributions — package a whole specialist agent as a git install** — Operator · 2026-07-11
- **Automation blueprint catalog — form-driven scheduled and webhook workflows** — Operator · 2026-07-11
- **Context references v2 — @file ranges, @folder, @diff, @git, @url** — Harness · 2026-07-11

## On the horizon

Directional, not committed — grouped by area, newest thinking first.

### Harness — 1 planned

- Authenticated runtime readiness - bounded health for remote supervision

### Operator — 3 planned

- Usage route ledger - attribute every model, fallback, and included call
- Session-scoped model switching - change this conversation without changing the default
- Remote context references - safe @file, @diff, and @git expansion through the gateway
