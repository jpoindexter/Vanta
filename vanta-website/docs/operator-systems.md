---
id: operator-systems
title: Operator systems
sidebar_position: 1
---

# Operator systems

Beyond code and research, Vanta carries a set of operator subsystems — durable, source-cited stores with kernel-gated tools and `/`-command views. Each follows the same shape: a `~/.vanta/*.jsonl` (or per-project) store + a tool + a command.

## Profile-routed Kanban

Kanban cards can declare a persistent profile owner, required skills, dependencies,
evidence, wake policy, and fallback profile. Boards remain under the project `.vanta`
store and survive restarts.

```bash
vanta kanban create "ship the research brief"
vanta kanban add research "Research sources" --instruction "Find primary evidence" --skills research,citations --after understand --wake immediate --fallback research-backup
vanta kanban route research
vanta kanban handoff research research-backup --reason "primary unavailable"
vanta kanban update research blocked --detail "provider timeout"
vanta kanban retry research
vanta kanban update research done --detail finished --evidence receipts/research.json
```

`route` selects the first non-archived profile whose isolated skill directory satisfies
the card. Claim is refused while dependencies are open or required skills are missing.
Closure is refused without receipt evidence. Blocked cards print exact retry and fallback
actions, and Operator Home summarizes active and blocked lanes.

## Delegation receipts

Subagents keep isolated raw transcripts under `.vanta/sidechains/`, while the parent receives
only their compact final summary. Every delegated child also appends a node under
`.vanta/delegations/` with parent task, child prompt, model, tools, verification, time,
token/cost evidence, and the raw sidechain path.

```bash
vanta agents delegations
vanta agents delegations <tree-id>
vanta agents delegation replay <child-id>
vanta agents delegation follow-up <child-id> "inspect the unresolved item"
```

Replay and follow-up create tracked assigned work; they do not silently execute. Operator
Home reports tree, child-run, and failed/blocked counts. `vanta lifesearch <query>` includes
bounded raw sidechains as the `delegation` source.

## World model
`world` tool · `/world` — entities and relations across your systems. Recall is cited and flags contradictions (same subject + predicate, different object); `merge` / `duplicates` consolidate and re-point relations. Confidence is surfaced as `[likely · 62% · source:…]`.

## Money OS
`money` tool · `/money` — offers, prospects, revenue. Suggests a price band, runs a weekly review, and records deliverables + follow-ups. Scored opportunities promote from the radar into prospects. Backed by a **life-OS** schema store (`~/.vanta/life-os/`) that builds a CFO-style brief (revenue / expenses / opportunities ranked by value) and tracks **Escape Ladder** milestones — the operator's path from current income to target.

## Opportunity radar
`radar` tool · `/radar` — scored opportunities ranked by composite pain × signal. `scan_web` runs live search, extracts and scores candidates; `offer` drafts an offer; `promote` pushes a winner into Money OS.

## Background teams
`team` tool · `/team` — a named worker roster with a task-assignment + legal-transition status ledger. `run` actually spawns a worker for a dispatched task (child registry excludes recursive fan-out; every worker tool call is kernel-gated). Managed from the CLI via `vanta agents`.

## Life-wide search
`life_search` tool · `/lifesearch` — source-cited search across the local stores, with a dependency-free relevance ranker and an optional local-embedding `semantic` mode (Ollama, zero new dep, lexical fallback).

## Self-repair compartments
`self_repair` tool · `/compartments` — a body map with per-compartment max-autonomy. Detects broken compartments from real capability checks, tracks last-known-good git shas, and proposes rollback — **never auto-executed**; protected compartments refuse rollback (Rule Zero).

## Verification organ
`regression_lock` tool · `/locks` — `lock {claim, command, expect}` records a regression case; `check` re-runs the locked commands (each approval-gated) and flags a regression if the expectation is gone or a command fails. A debugged failure becomes a re-runnable proof.

## Reach
`/reach` doctor + channel tools — Vanta's internet-reach layer: each channel is a set of real-probed backends with a health doctor (web, search, RSS, Reddit), plus a shared `0600` cookie store for login-walled channels.
