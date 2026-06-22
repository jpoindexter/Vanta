---
id: roadmap
title: Roadmap
sidebar_position: 1
---

# Roadmap

Where Vanta is headed and what just shipped — generated straight from the project board, so it never goes stale.

_903 capabilities shipped · 4 in flight · 146 on the horizon. Updated 2026-06-22._

## In flight

What we are actively building next.

### Context-aware /status + /doctor verbosity

**Harness** · S-size

Make /status + /doctor output context-aware — condense the firehose when a non-default model/provider is active

### In-product /feedback + feature-request flow

**Operator** · S-size

In-product /feedback (and feature-request) flow that files to GitHub Issues with redaction

### Self-learning loop — agent auto-writes and improves its own skills from what it does

**Harness** · L-size

Make autonomous self-improvement first-class, not scattered. Vanta already has the pieces — learned skills (~/.vanta/skills), a curator, per-goal memory, LoRA tuning, meta-tune — but no single always-on loop that, after a task, decides whether to mint or refine a skill and proves it improved. This epic unifies them into one named closed loop: observe trajectory -&gt; propose skill or edit -&gt; validate against evals -&gt; adopt (gated) -&gt; measure recurrence. The whole point of the product is that it learns by doing; this makes that real

### vanta migrate — import from OpenClaw / Hermes (skills + MCP servers + model config)

**Operator** · M-size

Preview plan -&gt; checkbox select -&gt; backup -&gt; apply; secrets redacted in the report; never overwrites without approval

## Recently shipped

The latest of 903+ capabilities. See the [changelog](./changelog) for curated milestones.

- **Dead-simple setup — first install works for a non-CS user (no toolchain)** — Operator · 2026-06-22
- **Prebuilt vanta-kernel binaries via GitHub Releases (no Rust to install)** — Operator · 2026-06-22
- **Public roadmap + changelog page on the docs site** — Operator · 2026-06-22
- **Provider-aware model-call watchdog (no false timeout on cold start)** — Harness · 2026-06-22
- **Public security page — threat model + pentest summary** — Operator · 2026-06-22
- **WhatsApp adapter (Node subprocess bridge; Business-API alt)** — Operator · 2026-06-22
- **Setup/install UX parity** — Harness · 2026-06-22
- **Messaging adapter — Slack** — Operator · 2026-06-22
- **Messaging adapter — WhatsApp** — Operator · 2026-06-22
- **Open-beta gate — live-prove the top operator task paths on a clean machine** — Harness · 2026-06-22
- **Multi-channel LIVE — 5+ platforms from one gateway (Telegram · WhatsApp · Signal · Discord · Slack)** — Operator · 2026-06-22
- **Images + voice memos in/out across channels** — Operator · 2026-06-22
- **Verify + harden SCRIPT-RPC-PIPELINE as first-class zero-context pipelines** — Harness · 2026-06-22
- **Tool-call repair — auto-fix malformed tool calls (weak/local models)** — Harness · 2026-06-22
- **Network egress policy — allow/deny for all outbound, not just hooks** — Harness · 2026-06-22
- **`/bg` flag preservation — backgrounded sessions keep all startup flags** — Harness · 2026-06-21
- **Agent management UI — AgentDetail, AgentEditor, AgentsList, AgentsMenu** — Operator · 2026-06-21
- **AI-powered permission explanation — risk level + reasoning for tool calls** — Operator · 2026-06-21
- **Shell tab-completion in bash input — command, variable, and file suggestions** — Operator · 2026-06-21
- **AskUserQuestion tool — structured multi-question UI with options, previews, multi-select** — Operator · 2026-06-21

## On the horizon

Directional, not committed — grouped by area, newest thinking first.

### Cofounder engine — 11 planned

- Self-evolve metrics — lift-per-iteration + human-in-loop ratio + spend
- Regression foresight — predict what an evolve edit will BREAK, not just fix
- Interaction-aware evolution — account for non-additive component effects
- Delegation up/down the org chart
- Leadership chat that resolves to real work objects
- Self-organization — agents propose org changes within governance
- _…and 5 more_

### Extensibility — 17 planned

- Bundles (skill aliases)
- 169 bundled skills (74 + 95 optional)
- Blueprints — reusable project/agent scaffolds you instantiate
- Skills hub — discover/share skills + agentskills.io standard compat
- A2A networked transport behind a Transport interface
- Out-of-process plugin workers + capability-gated host services
- _…and 11 more_

### Harness — 35 planned

- TUI delight / personality pass (not a soulless CLI)
- Commit attribution — track another agent-modified files for git co-authorship
- `/bg` while responding — active response continues in background, not dropped
- Tree-sitter bash parser — AST-accurate security validation for bash commands
- Self-hosted runner — dedicated entrypoint for running another agent as a CI/CD runner
- Secrets (Bitwarden Secrets Manager)
- _…and 29 more_

### Operator — 79 planned

- Gateway channel self-heal — auto-reconnect + health recovery
- Marketing/analytics connectors (amplitude, customer.io, ads)
- Unified cross-agent memory — ingest from/other agents/other agents
- Continuous live screen + app-context feed (approved local actions)
- TUI v2 — state / safety / working-memory / telemetry rails
- Hooks configuration menu — event/hook/matcher mode selectors
- _…and 73 more_

### Solutioning — 4 planned

- Intent/spec recovery from code + intent-drift detection
- Change-watchers for repos/issues/email/calendar
- Mine Goose/Reference for stealable patterns
- Calibrated solutioning — ranged/ensembled recommendations + revisit triggers
