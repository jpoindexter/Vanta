---
name: parallel-verify-workflows
description: "Run a deterministic multi-agent workflow with compose_workflow: fan-out -> synthesize -> adversarial-verify (plus tournament / loop-until-done). For batch parallelism and verification-as-bottleneck. Opt-in; spawns multiple billed agents."
created: 2026-06-07
updated: 2026-06-07
tags: [workflow, compose_workflow, parallel, adversarial-verify, fan-out, synthesize, verification]
---

# Parallel-Verify Workflows

As output volume explodes, **verification becomes the bottleneck**. When you need structured parallelism *with checking* — not just one background agent — use **`compose_workflow`**: typed steps, each spawning sub-agents, aggregated into one result.

## When to use

- Fan many agents over a list, then **synthesize** one answer.
- Find -> **adversarially verify** each finding (refute, don't rubber-stamp).
- **Tournament**: N approaches from different angles, pick the winner.
- **Loop-until-done** toward a stop condition.

For a single background specialist, use `delegate` (`agent-fanout`) — lighter. `compose_workflow` is for typed, multi-step orchestration.

## The tool

`compose_workflow { spec }`, spec = `{ name, description, steps:[{ id, type, instruction, agents?, budget?, stopCondition? }], tokenBudget? }`. `type` is one of `fan-out | synthesize | adversarial-verify | tournament | loop`. `agents` is 1-16 per step. It plans the fan-out; workers run via `delegate`.

## The canonical shape — find, then refute

```
compose_workflow spec:
  name: "secret-audit"
  steps:
    - id: find,   type: fan-out,            instruction: "find hardcoded secrets in <repo>",  agents: 4
    - id: verify, type: adversarial-verify, instruction: "try to REFUTE each finding; default: not a leak"
    - id: report, type: synthesize,         instruction: "return only confirmed leaks: file:line + type"
  tokenBudget: 50000
```

## Verification discipline (the point of this skill)

- **Adversarial by default.** A verify step *refutes* a finding, it doesn't confirm it. Default to "not real" when uncertain — that's what kills plausible-but-wrong output.
- **Diverse lenses** beat N identical checkers — give each verifier a distinct angle (correctness · security · does-it-reproduce).
- **Set a `tokenBudget`.** Workflows spawn billed agents; bound them (default is 50k if unset).

## Opt-in / cost

`compose_workflow` is a deliberate, billed escalation — it can spawn many agents. Use it when the task genuinely needs parallelism or adversarial checking; a single `delegate`, or a plain "split this and verify" prompt, is often enough.

## Attribution

Adapted from Boris Cherny, *Why Coding Is Solved* (Anthropic, 14:37, 19:12-20:01), §4 "Workflows", via the build-catalog extraction. Mapped to Vanta's `compose_workflow` tool.
