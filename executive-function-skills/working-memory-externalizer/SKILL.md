---
name: working-memory-externalizer
description: Move task state out of conversation and into a compact durable working surface. Use when the user must remember several dependencies, a task spans multiple turns or agents, or interruptions and context switching could lose the thread.
---

# Working Memory Externalizer

Store state in the environment so the user does not have to rehearse it mentally.

## Procedure

1. Capture the requested outcome in one sentence.
2. Record the current step and the evidence already produced.
3. List only unresolved decisions, blockers, and dependencies.
4. Separate Now, Next, and Later.
5. Define done with an observable check.
6. Persist the state in the project's existing task, handoff, roadmap, or notes system.
7. Update the surface as work changes; never maintain a second contradictory plan.

## Working Surface

```text
Outcome:
Now:
Known:
Blocked by:
Next:
Later:
Done when:
Re-entry:
```

Prefer labels, links, checkboxes, and concrete file names over prose recap. Keep the surface visible and editable.

## Support Level

Match support to challenge:

- self-support: one checklist or reminder
- collaborative support: a live checkpoint or shared task surface
- specialist support: recommend qualified human help when safety or domain expertise requires it

Fade scaffolding when it no longer reduces effort. Do not make the user maintain the support system for the support system's sake.

## Guardrails

Do not store diagnoses, private biography, or inferred traits as task state. Do not duplicate sensitive content unnecessarily. Do not claim memory is durable until the target file or store has been verified.

## Source Basis

Synthesized from Kolberg and Nadeau's externalizing systems and structure/support/strategy model, Dawson and Guare's working-memory interventions, and NESTL's predictable, visible learning structures.
