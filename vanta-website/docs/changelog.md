---
id: changelog
title: Changelog
sidebar_position: 2
---

# Changelog

Major capability milestones, newest first. This is a curated highlight reel — the full per-slice history lives in `roadmap.json`.

## 2026-07-19 — v0.9.4 desktop release
- **Notarized public desktop build** — the Apple Silicon DMG and ZIP are published with checksum and Apple submission `374f7536-59ba-4657-a437-b6d151d81445`.
- **Independent Gatekeeper proof** — a clean hosted Mac downloaded the public DMG, verified its checksum and staple, quarantined the extracted app, and passed signature and Gatekeeper assessment.
- **Release regression boundary** — 36 Ghost light/dark captures, three fresh-profile startup samples, first-use latency, memory, CPU, and package-size budgets run in CI against the tagged source.
- **Cold-start repair** — critical Work data enables the composer without waiting for optional Connect, Outputs, Canvas, messaging, or release-proof data.

## 2026-07-17 — desktop session safety
- **Recoverable session operations** — archive and Trash now expose pending, success, error, and Undo states; permanent deletion is restricted to confirmed actions from Trash.
- **Bulk session control** — Select chats supports Shift-click ranges, All visible, bulk archive/restore, bulk Trash Undo, and explicit bulk permanent deletion.
- **Keyboard-safe menus** — session actions use menu semantics, arrow-key traversal, Escape focus return, and outside-click dismissal, verified in Electron against an isolated session store.
- **Project context picker** — the composer now attaches safe project files through Changed, Mentioned, Recent, and Search groups; ignored/private paths stay hidden and selected files remain removable before send.
- **Desktop release proof** — one command now builds and signs `Vanta.app`, then runs the complete cold-start, approval, recovery, attachment, session Undo, Outputs/Connect, and three-viewport matrix against both source and packaged Electron.
- **Reliable access mode switching** — stale background refreshes can no longer overwrite a newly saved project mode; the picker updates immediately and rolls back if persistence fails.
- **Outcome-oriented Connect** — models, capabilities, and messaging adapters now show Ready, Needs setup, or Unavailable with safe local test actions; project file/catalog failures no longer misdirect operators into model setup.
- **First-class MCP connectors** — CLI, TUI, and Desktop now share one project connector registry for source, trust, OAuth, enablement, health, tools/resources, redacted errors, and lifecycle receipts; kernel Block remains immovable.

## 2026-07-12 — Hermes delta and documentation release
- **Executed product acceptance** — real model read/write/readback, corpus recall, delegation, packaged desktop chat and destructive-command blocking, clean-install launchd scheduling, cold-start capability reporting, and bounded cited research now have recorded behavioral evidence. The refreshed public artifact remains the final local acceptance boundary.
- **Session-scoped model switching** — `/model` and both model pickers now change only the current conversation by default, persist that route with the session, and reserve `.env` mutation for explicit **Set as default**/`--global` actions.
- **Per-call route usage ledger** — completed agent-loop calls now persist the provider/model/base route that actually served them, including fallback depth, model switches, cache/reasoning tokens, and zero-cost local or subscription-included calls. `/usage breakdown` and `/dashboard` read the route ledger without double-counting legacy spend rows.
- **Real-headroom compaction guard** — automatic compaction now uses the next provider input-token count to detect a fixed system/tool floor. Two ineffective passes suppress a third automatic rewrite, while `/compact <focus>` remains available.
- **Interrupted-tool effect safety** — every tool attempt now records `none`, `confirmed`, or `unknown`; session restore preserves dangling mutations and requires state inspection instead of blindly replaying them. A redacted metadata receipt is kept in `.vanta/tool-effects.jsonl`.
- **Prompt presets and routed agents** — `/prompt` can switch the current operating role, while `delegate {agent_type}` spawns a worker from the same project/home markdown definition with a bounded prompt, narrowing-only tools, and an optional model default. The base Vanta safety prompt and kernel remain enforced.
- **Current-main audit** — compared Hermes Agent `4281151a` with Vanta production paths, kept only six material local gaps, and ordered effect disposition plus real-headroom compaction first.
- **Hermes workflow wave shipped** — persistent profiles and distributions, profile-routed Kanban, delegation receipts, corpus memory, typed context references, workflow blueprints, vault-backed secrets, credential pools, bounded plugin model calls, native deliverable attachments, and the public skill registry are now represented by shipped roadmap slices.
- **Honest release boundary** — the roadmap reports **1,177 shipped**, **2 remaining local cards**, and **10 parked external acceptance gates**. Parked provider, credential, and physical-device proofs are not reported as live.
- **Docs synchronized** — comparison, roadmap, generated command/tool reference, and Cloudflare deployment instructions now derive from the current repository state.

## 2026-06-24 — model freedom & creative ideation
- **Add any model provider with no code** — declare any OpenAI-compatible backend in `~/.vanta/providers.json` (`{baseURL, keyEnv, model}`); `VANTA_PROVIDER=<id>` just works. The secret stays in `.env` (the file holds only the env-var name); keyless local endpoints supported; a user entry can even override a built-in. See [Providers](./providers.md).
- **Routers reach every model** — pick `tokenrouter`/`openrouter` in `vanta setup` and free-type any model the token serves, instead of a pinned list.
- **Creative ideation, routed** — the `ideation-methods` skill grew to **22 named methods** from artists, scientists, and designers (Eno, Jarry, Cage, de Bono, Pólya, Alexander, Meadows, Vonnegut, Tharp…), with a feasibility↔creativity dial and a deterministic, tested router — so "give me a fresh angle" gets a deliberate method, not generic brainstorming. Fires automatically on ideation-intent prompts.

## 2026-06-22 — public launch (v0.2.0)
- **Open source** — the repo is public at [github.com/jpoindexter/Vanta](https://github.com/jpoindexter/Vanta) under the **MIT** license.
- **Zero-toolchain install** — only `git` is required. The Rust safety kernel ships as a prebuilt binary and a portable Node 22 is fetched automatically on first run (both checksum-verified); no Rust or system Node to install.
- **Messaging** — 20 adapters wired (Telegram · WhatsApp · Signal · Discord · Slack live today; the rest configurable).

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
- **Corpus compiler** — ingest note/transcript folders or guarded URLs, recall with keyword/semantic/entity fusion and source freshness receipts, refresh stale material, and preview/apply linked Obsidian exports.
- **MCP** both directions — mount external servers as tools; serve Vanta as an MCP server.

## v1 — feels like an operator
- Hook to **any model** (OpenAI/Ollama/Anthropic/Gemini/OpenRouter) via a first-run **setup wizard**.
- **Continuity** — age-gated resume, fork, handoff, session memory, standing loops.
- **Self-improvement loop**, bundled **skill library**.
- **Gateway** — run as a service, messaging (20 adapters wired; Telegram · WhatsApp · Signal · Discord · Slack live), webhooks.

## v0 — all the parts
- Rust **safety kernel** — risk classifier (allow/ask/block), approval queue, goal ledger, tamper-evident event log, HTTP sidecar.
- Core agent loop + the first tools (files, web, browser, vision, code, comms).
- Skills & per-goal memory; cron, subagents, operator modes.

> Dates and exact slice history are tracked in `roadmap.json`; this page summarizes the waves of capability as they landed.
