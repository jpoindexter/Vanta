---
id: roadmap
title: Roadmap
sidebar_position: 1
---

# Roadmap

Where Vanta is headed and what just shipped — generated straight from the project board, so it never goes stale.

_1288 capabilities shipped · 5 in flight · 14 parked external-proof items · 7 on the horizon. Updated 2026-10-03._

## In flight

What we are actively building next.

### Desktop ambient workflow — one agent across chat, mini, work and results

**Operator** · L-size

Streamline the existing Vanta Desktop into one everyday workflow: invoke, give context, work, intervene, inspect results and resume or schedule. Keep the generalist engine, capabilities and revocable authority. White/grey with Vanta violet; optional mini/avatar opens the same workspace, not another agent. Owner priority 2026-10-03: dependable chat/remembered approvals and Stop first, then browser/native actions with saved results, then local-first voice in the same conversation. Voice model downloads and optional hosted providers have explicit acceptance in VOICE-LOCAL-MODELS-AND-PROVIDERS; historical speech modules are not Desktop voice proof. Sequence and evidence: docs/voice-and-everyday-agent-plan-2026-10-03.md

### Repository Git probe isolation — project configuration cannot execute host commands

**Harness** · M-size

Prevent a repository delivered with hostile Git configuration or attributes from executing host commands when Vanta automatically gathers status, diffs, history, worktree, goal, or review context before an approval prompt

### Protected instruction writes — exact approval for every standing-order file

**Harness** · M-size

Extend Vanta's control-plane boundary from runtime state and agent-authored skills to every repository or operator file that can change standing instructions, tool authority, memory policy, verification policy, or future-session behavior

### Local state recovery boundary — never silently lose operator truth

**Harness** · L-size

Make Vanta's canonical local sessions, WorkItems, runs, approvals, receipts, schedules, settings, and continuity state failure-atomic, concurrency-safe, recoverable, and visibly degraded instead of returning missing data after a partial write or corrupt file

### Browser workflow boundary — observe, extract, and act under explicit policy

**Operator** · L-size

Make every current and future browser action use one explicit policy boundary. Navigation and extraction are read-only capabilities; click, fill, select, submit, upload, download, dialog handling, login, and authenticated reads declare their exact account, profile, domain, target, budget, authority, and expected evidence instead of inheriting a broad browser grant

## Recently shipped

The latest of 1288+ capabilities. See the [changelog](./changelog) for curated milestones.

- **Explicit-empty MCP allowlist — zero means zero tools** — Harness · 2026-08-26
- **Desktop semantic foundation — contrast, type, controls, and one token authority** — Desktop App · 2026-08-26
- **Local document reading — bounded PDF and office-file context** — Operator · 2026-08-14
- **Urgent control-plane trust closure — hooks, environments, audit state, and local authentication** — Harness · 2026-08-02
- **Safe continuity slice — messy capture to Today, prepared action, waiting, and restart re-entry** — Operator · 2026-08-02
- **Truthful completion and one typed receipt across every host** — Harness · 2026-08-02
- **Universal effect-path inventory and one trusted action gateway** — Harness · 2026-08-02
- **Desktop queued-turn editor — inspect, reorder, edit, steer, retry, or remove what runs next** — Desktop App · 2026-07-30
- **Minimum operator spine — WorkItem, Run, Approval, Receipt, follow-up, and resume** — Operator · 2026-07-30
- **Streaming TTS — speak after the first complete clause** — Operator · 2026-07-29
- **Memory Sparse Attention adapter — long-context memory without Python in Vanta** — Operator · 2026-07-29
- **Shared operating-mode cycle — Manual / Accept edits / Plan / Auto** — Harness · 2026-07-29
- **Surface 'compacting now' state in footer** — Operator · 2026-07-29
- **True first-token performance harness — measure cold start through painted output** — Harness · 2026-07-29
- **Deterministic turn closeout — changed, checked, verified, and next** — TUI · 2026-07-29
- **Claude-style output hierarchy — compact evidence and scan-friendly answers** — TUI · 2026-07-29
- **Hot reload continuity — preserve the active conversation and reset runtime status** — TUI · 2026-07-29
- **AskUserQuestion tool — structured multi-question UI with options, previews, multi-select** — Operator · 2026-07-28
- **Task-scoped go-ahead — one approval for repeated reversible work** — Operator · 2026-07-28
- **Live todo / progress checklist (TodoWrite pattern)** — Operator · 2026-07-28

## Parked external-proof items

These remain unshipped until the real provider, device, or hosted environment produces the evidence required by that card. Eleven are canonical machine-evaluated release gates; the remaining parked items are related proof work.

- **MSA NVIDIA runtime proof — execute the official checkpoint behind Vanta's contract** — Infrastructure
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
- **Desktop cold-operator release proof — one useful task without repo knowledge** — Operator
- **Desktop release-candidate provenance — notarize and bind the exact commit** — Desktop App
- **Look capture — native macOS screen, window, or marquee vision from CLI and Desktop** — Operator

## On the horizon

Directional, not committed — grouped by area, newest thinking first.

### Harness — 4 planned

- Capability-grounded prompt — promise only callable tools and routes
- Canonical action envelope and scoped capability
- Untrusted-content quarantine across email, web, documents, messages, and social input
- Safe factory, self-repair, and Vanta Lab production boundary

### Operator — 3 planned

- Trustworthy Needs You — deterministic, deduplicated, expiring, and auto-resolving
- Contextual Review, first-run usefulness, and cross-host accessibility contract
- Authenticated browser workspace — visible sessions, takeover, and revocation
