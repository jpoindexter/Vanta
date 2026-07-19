---
id: roadmap
title: Roadmap
sidebar_position: 1
---

# Roadmap

Where Vanta is headed and what just shipped — generated straight from the project board, so it never goes stale.

_1258 capabilities shipped · 0 in flight · 10 external proof gates · 11 on the horizon. Updated 2026-07-19._

## In flight

What we are actively building next.

_Nothing in flight right now — the remaining accepted work is listed under external proof gates._

## Recently shipped

The latest of 1258+ capabilities. See the [changelog](./changelog) for curated milestones.

- **Remote context references - safe @file, @diff, and @git expansion through the gateway** — Operator · 2026-07-19
- **Desktop live-proof diagnostics — separate API truth, rendered truth, and startup context** — Desktop App · 2026-07-19
- **Desktop assistive-technology proof — automate accessibility and complete one VoiceOver task** — Desktop App · 2026-07-19
- **Terminal panel + TerminalCaptureTool — agent captures terminal content, Meta+J toggle** — Operator · 2026-07-18
- **Regional payment authorization broker - route by capability, regulation, and provider availability** — Harness · 2026-07-18
- **Visa TAP conformance lab - signed agent intent and merchant recognition** — Harness · 2026-07-18
- **Interactive Telegram setup discovery - answer the operator and expose the command** — Operator · 2026-07-18
- **Desktop setup hub + Telegram lifecycle — route, verify, secure, and start** — Desktop App · 2026-07-18
- **Demote DuckDuckGo - bot-blocked search is explicit legacy fallback, never the default** — Harness · 2026-07-18
- **Desktop message fidelity — preserve intraword underscores and exact identifiers** — Desktop App · 2026-07-18
- **Desktop session draft ownership — drafts stay with the correct task** — Desktop App · 2026-07-18
- **Desktop kernel port collision recovery - Retry finds a safe project endpoint** — Desktop App · 2026-07-17
- **Desktop context attachments — files as searchable task context, not raw inventory** — Desktop App · 2026-07-17
- **Desktop safe session operations — archive undo, recoverable trash, menu feedback** — Desktop App · 2026-07-17
- **Desktop Connect setup status — outcome cards with test actions** — Desktop App · 2026-07-17
- **First-class MCP connectors — one registry for Vanta CLI, TUI, and Desktop** — Extensibility · 2026-07-17
- **Desktop MCP control center — install, approve, test, and use MCP servers** — Desktop App · 2026-07-17
- **Desktop flow proof suite — cold start, work, recovery, attachments, outputs, resize** — Desktop App · 2026-07-17
- **Schema task environment contract - typed observe, act, predict, and outcome boundary** — Harness · 2026-07-17
- **Schema transition timeline - append-only ground truth for every real action** — Harness · 2026-07-17

## External proof gates

Implemented locally, but not called shipped until the real provider, device, or hosted environment produces an accepted receipt.

- **Run Anywhere v1 release gate — reach, wake, and execute on controlled infrastructure** — Operator
- **Messaging adapter — Microsoft Teams** — Operator
- **Termux / Android runtime (run-anywhere North Star gap)** — Operator
- **Spreadsheet copilot — Excel/Sheets agent surface with charts and custom functions** — Operator
- **Cross-platform service supervisor — one `vanta up` on macOS, Linux, and Windows** — Reach
- **Adyen Agentic delegated payments - limited-access provider integration** — Operator
- **Payment skill pack - delegated fiat and SaaS provisioning under transaction gates** — Operator
- **Shopify operations - scoped catalog, orders, inventory, and verified mutations** — Operator
- **Telephony consent lifecycle - provision numbers, SMS, calls, callbacks, and retention** — Reach
- **Commerce and telephony skill pack - Shopify, shopping, returns, SMS, and calls** — Reach

## On the horizon

Directional, not committed — grouped by area, newest thinking first.

### Desktop App — 2 planned

- Desktop cold-operator release proof — one useful task without repo knowledge
- Desktop release-candidate provenance — notarize and bind the exact commit

### Harness — 6 planned

- Workflow data handoffs — typed references with preflight and redaction
- Graph shared run state — typed coordination without one giant conversation
- Graph completion contracts — stop on evidence, budget, or escalation
- Graph review/rework cycle — reviewer findings route back to the builder
- Adaptive graph policy — spawn, collapse, and route within hard bounds
- Graph engineering v1 release gate — organization executes and explains itself

### Operator — 3 planned

- Workflow composer v1 — compose Vanta primitives without rebuilding n8n
- Graph operator replay — inspect decisions, state diffs, and handoffs
- Browser workflow boundary — observe, extract, and act under explicit policy
