---
name: agent-fanout
description: "Fan work out across sub-agents with the delegate tool: background specialists, one-agent-per-repo, cross-discipline routing, overnight batches - each returns proof, no context bloat."
created: 2026-06-07
updated: 2026-06-07
tags: [agents, delegate, subagents, parallel, fan-out, overnight, routing]
---

# Agent Fan-out

"Ask Claude to use a bunch of sub-agents." Boris runs hundreds per session, thousands overnight. In Vanta this is the **`delegate`** tool — each call spawns a scoped worker that runs its own loop (same tools, minus `delegate`) and returns only its result, so your context stays clean.

## When to use

Work that splits into **independent** chunks: audit N repos, one specialist per concern, an overnight batch of separable tasks. Not for tightly-coupled work that needs shared state — that's one session.

## The tool

`delegate { goal, instruction, max_iterations?, provider?, model? }`. Call it **multiple times** to fan out. Route a chunk to a cheaper/different backend with `provider`/`model` — e.g. `provider:"ollama"` for a free local pass, `provider:"openai" model:"gpt-4o"` for a hard reasoning step. For 2-10 typed steps with synthesis/verification, use `compose_workflow` instead (see `parallel-verify-workflows`).

## Patterns

**One-off background specialist** — a worker while you keep going:
```
delegate goal:"Audit <repo>/src for files >300 lines and fns >50"
  instruction:"Return a ranked table, worst first. Read-only — don't edit."
```

**One agent per repo** — fan the same job across repos (one `delegate` call each):
```
delegate x4, one per repo (indx, brutal, hashmark, prova):
  "find dead code + unused exports -> delete-list with file:line + why. No edits."
```

**Cross-discipline routing** — set the discipline in each worker's goal (Vanta has no named agent-type registry; the discipline lives in the prompt):
```
delegate -> goal:"As a UI reviewer, critique hierarchy + spacing of <page>"
delegate -> goal:"As a security reviewer, check the form handler in <file>"
delegate -> goal:"As a copy editor, tighten the hero copy"
```
One report each; you merge.

**Overnight batch** — queue separable long tasks, one `delegate` each, each must return **proof**. Triage in the morning.

## Guardrails

- Each worker returns **proof** — a diff, a test result, a file:line list. "Done" is not proof.
- Default workers to **read-only / no-push**; the parent applies changes after review unless the task is explicitly safe.
- Independent only — Vanta's `delegate` workers **share the working tree**, so if two would touch the same files, run them sequentially, not concurrently.

## Attribution

Adapted from Boris Cherny, *Why Coding Is Solved* (Anthropic, 07:43-09:56), §3 "Agents", via the build-catalog extraction. Mapped to Vanta's `delegate` tool.
