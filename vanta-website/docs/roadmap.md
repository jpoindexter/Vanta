---
id: roadmap
title: Roadmap
sidebar_position: 1
---

# Roadmap

Where Vanta is headed and what just shipped — generated straight from the project board, so it never goes stale.

_1146 capabilities shipped · 5 in flight · 13 on the horizon. Updated 2026-07-11._

## In flight

What we are actively building next.

### Profile Kanban router — durable board routes work by specialist skill

**Operator** · M-size

Vanta ships roadmap Kanban, work queues, teams, delegation, and org chart primitives; the missing workflow is a user-facing board where cards declare required skills and persistent profiles claim, update, hand off, and close work with receipts

### Second-brain corpus compiler — notes, transcripts, and receipts become searchable memory

**Operator** · M-size

Vanta has brain memory, vault bridge, world model, and transcript tooling; the missing product workflow is a corpus compiler with hybrid search, source receipts, and refresh status

### Profile distributions — package a whole specialist agent as a git install

**Operator** · M-size

Vanta has blueprints, imports, plugins, and profile-adjacent primitives; the missing workflow is installing and updating a whole specialist profile without copying secrets, sessions, or private memory

### Hermes story eval harness — test real community jobs across all 15 categories

**Harness** · M-size

Vanta's June USE-CASE-AUDIT is a static capability map and the existing surface script samples 12 routes; neither proves complete user jobs or tracks receipts over time. Build a versioned representative corpus and run it at route, sandbox, and live tiers

### Hermes multi-turn story runner — continue choices and approvals in one session

**Harness** · M-size

The current use-case runner executes one-shot commands. It can prove that Vanta stops at a clarification wall, but it cannot send a scripted operator choice back into the same conversation and verify the resulting plan, approval gate, artifact, or delivery across later turns

## Recently shipped

The latest of 1146+ capabilities. See the [changelog](./changelog) for curated milestones.

- **Profile roster — persistent specialist agents with isolated state** — Operator · 2026-07-11
- **Hermes issue regression pack — turn competitor failures into Vanta invariants** — Harness · 2026-07-11
- **Vanta public site v1 — product-first homepage, use cases, install, and proof** — Reach · 2026-07-11
- **Choice-wall side-effect guard — no post-turn writes before the operator chooses** — Harness · 2026-07-11
- **Glob base-path root scope — relative searches use the declared project** — Harness · 2026-07-11
- **Compaction intent grounding — generated summaries cannot invent user asks** — Harness · 2026-07-11
- **ACP session routing isolation — peer events cannot cross active session IDs** — Harness · 2026-07-11
- **Subagent provider identity — provider switches cannot inherit the parent model** — Harness · 2026-07-11
- **MCP reconnect process reap — obsolete clients close before replacement** — Harness · 2026-07-11
- **Safe-mode state isolation — no user memory, plugins, MCP, or settings** — Harness · 2026-07-11
- **Session environment output redaction — credentials never enter recordings** — Harness · 2026-07-11
- **Desktop and gateway provider parity — user aliases keep complete identity** — Harness · 2026-07-11
- **Live context cost inspector — measure prompt surfaces before optimizing** — Harness · 2026-07-11
- **Workflow acceptance evidence contract — validate requested operations, not labels** — Harness · 2026-07-11
- **Successful tool error classification — policy prose cannot open repair loops** — Harness · 2026-07-11
- **Roadmap blocked status — external gates stop consuming Now slots** — Operator · 2026-07-10
- **Roadmap unblock command — turn blocked cards into exact next actions** — Operator · 2026-07-10
- **Run Anywhere readiness status — one auditable release-proof checklist** — Operator · 2026-07-10
- **Autonomy contract walls — acts alone, queues, wakes me** — Harness · 2026-07-10
- **Trust ledger autonomy — earn auto-run with measured pass rates** — Harness · 2026-07-10

## On the horizon

Directional, not committed — grouped by area, newest thinking first.

### Extensibility — 1 planned

- Public skill registry client — search, inspect, install, update, and remove safely

### Harness — 6 planned

- Delegation tree receipts — parent sees summaries, raw sidechains stay searchable
- Tool-surface profiles — shrink available tools by role and explain the boundary
- Vault secrets rotation — one bootstrap token, scoped provider keys
- Context references v2 — @file ranges, @folder, @diff, @git, @url
- Credential pools — rotate same-provider keys before cross-provider fallback
- Plugin LLM lane — bounded host-owned model calls from plugins

### Operator — 4 planned

- Webhook workflow builder — internet events trigger approved Vanta work
- Spreadsheet copilot — Excel/Sheets agent surface with charts and custom functions
- Dashboard plugin slots — operator home accepts safe custom panels
- Automation blueprint catalog — form-driven scheduled and webhook workflows

### Reach — 2 planned

- Deliverable auto-attach — generated files become native chat artifacts
- Cross-platform service supervisor — one `vanta up` on macOS, Linux, and Windows
