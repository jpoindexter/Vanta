---
name: prod-watch
description: "Watch production errors: pull live logs (Vercel + Supabase via MCP), cluster new errors with a likely cause + file:line, triage only. Never deploy or change data."
created: 2026-06-07
updated: 2026-06-07
tags: [production, errors, logs, vercel, supabase, mcp, triage, monitoring, loop]
---

# Prod Watch

"It's just MCP." Poll your live logs and triage new errors while you build elsewhere. Read-only. Read `standing-loops` first.

## When to use

"Watch prod", "what's erroring in production", or as a scheduled eyes-on-prod job for a deployed project.

## Prerequisites

The relevant MCP servers connected — Vercel + Supabase are the common pair. If they aren't mounted, mount them with `mount_mcp` (or use the session's connected MCPs). No MCP for a source -> say so; don't guess at logs.

## Procedure

1. **Pull since the last run:** Vercel runtime logs + build logs for `<project>`; Supabase logs (and `get_advisors` for security/perf if available). Track a high-water mark so each run only sees new errors.
2. **Cluster new errors.** Per cluster: count, a representative message, **likely cause + file:line**, and the table / route / policy it points at.
3. **Triage only.** Rank clusters by impact.

## Never (surface instead)

- Deploy, roll back, change data/schema, or run migrations. Triage produces a *report*, not a fix. If a fix is obvious, propose it — don't apply it.

## Report

`new-error count · top 3 clusters (cause + file:line) · anything urgent`. Quiet -> "quiet", end.

## Run it

- Recurring: `vanta schedule "watch prod errors on <project>: pull Vercel + Supabase logs, cluster new errors, triage only" --cron "*/30 * * * *"`.

## Attribution

Adapted from Boris Cherny, *Why Coding Is Solved* (Anthropic, 22:43 "it's just MCP"), via the build-catalog extraction.
