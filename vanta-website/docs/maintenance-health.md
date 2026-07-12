---
id: maintenance-health
title: Maintenance health
sidebar_position: 2
---

# Maintenance health

Vanta tracks whether its supporting infrastructure is helping finish work or becoming the work. The maintenance surface composes the existing ticket store, project-context loader, and usage accounting instead of introducing another issue system.

```bash
vanta maintenance
vanta maintenance queue
vanta maintenance docs
vanta maintenance budget
```

## Needs-human queue

Stopped failures, iteration exhaustion, missing configured capabilities, and explicit permission blockers create one unread ticket under `.vanta/tickets.json`. A blocker fingerprint prevents repeated attempts from creating duplicate tickets; recurrence adds evidence to the existing ticket.

For an unclear decision discovered during a turn, Vanta calls the existing `ticket` tool with `action:needs_human`, a concrete reason, and one next action.

```bash
vanta maintenance queue
vanta maintenance resolve <ticket-id>
```

Resolving marks the ticket done and archives it. If the same blocker later recurs, Vanta creates a fresh ticket rather than silently reopening a resolved decision.

## Documentation router health

Prompt assembly records top-level context documents and recursively imported `@path` files in `.vanta/doc-router-events.jsonl`. Completed turns record explicit filename or path references.

```bash
vanta maintenance docs
vanta maintenance docs --stale-days 60
vanta maintenance docs --json
```

The report distinguishes:

- **Loaded** — included during real system-prompt assembly.
- **Referenced** — explicitly named in the user instruction or completed response.
- **Never consulted** — loaded at least once but never explicitly referenced.
- **Stale** — older than the configured age threshold.
- **Missing import** — an `@path` import could not be read.
- **Contradiction** — exact positive and negative forms of the same instruction were found.

“Referenced” is evidence, not proof that a document caused a good result. The health command is read-only and never rewrites documentation.

## Maintenance budget

Every real session turn records elapsed time, reported tokens, tool count, outcome, and a conservative work class in `.vanta/work-ledger.jsonl`. Work defaults to `delivery`; only explicit documentation or harness-maintenance language is classified as `maintenance`.

```bash
vanta maintenance budget
vanta maintenance budget --since 2026-07-01
vanta maintenance budget --threshold 60 --min-turns 5
vanta maintenance budget --require-within-budget
```

After at least five turns, maintenance exceeding the threshold by time or tokens creates one needs-human ticket. `--require-within-budget` exits nonzero when the threshold is exceeded, so scheduled checks can enforce the budget.

Set `VANTA_WORK_CLASS=delivery|maintenance` to override classification for a run. Set `VANTA_MAINTENANCE_WARN_PCT` to change the default 60 percent threshold.
