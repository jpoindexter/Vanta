---
id: operator-systems
title: Operator systems
sidebar_position: 1
---

# Operator systems

Beyond code and research, Vanta carries a set of operator subsystems — durable, source-cited stores with kernel-gated tools and `/`-command views. Each follows the same shape: a `~/.vanta/*.jsonl` (or per-project) store + a tool + a command.

## World model
`world` tool · `/world` — entities and relations across your systems. Recall is cited and flags contradictions (same subject + predicate, different object); `merge` / `duplicates` consolidate and re-point relations. Confidence is surfaced as `[likely · 62% · source:…]`.

## Money OS
`money` tool · `/money` — offers, prospects, revenue. Suggests a price band, runs a weekly review, and records deliverables + follow-ups. Scored opportunities promote from the radar into prospects.

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
