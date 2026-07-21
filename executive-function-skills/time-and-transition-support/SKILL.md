---
name: time-and-transition-support
description: Externalize time, checkpoints, stopping rules, and context transitions. Use when estimates are uncertain, a task may expand indefinitely, the user is switching topics, or an interruption risks losing the current state.
---

# Time and Transition Support

Turn invisible time and context changes into visible state.

## Procedure

1. Give a range rather than a false point estimate. Include hidden costs.
2. Name the next checkpoint and the evidence expected there.
3. Set a stop condition for research, retries, or open-ended refinement.
4. Before a topic shift, save:
   - active outcome
   - last verified fact
   - current action
   - blocker or decision
   - exact re-entry step
5. Announce the transition in one line.
6. On return, resume from the saved re-entry step rather than reconstructing the conversation.

## Estimate Shape

```text
Best: ...
Realistic: ...
Worst: ...
Hidden costs: ...
Next checkpoint: ...
```

Use elapsed-time feedback to revise future estimates. A confident estimate without observed task data is a hypothesis.

## Guardrails

Do not convert estimates into promises. Do not repeatedly interrupt focused work with reminders. Do not erase unfinished work when shifting topics. Do not claim a transition is complete until the saved state can actually restart the task.

## Source Basis

Synthesized from Dawson and Guare's time-management and flexibility supports, Kolberg and Nadeau's externalized time and launch points, and neurodivergent transition guidance in Neff and NESTL.
