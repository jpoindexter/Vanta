---
name: reward-process-integrity
description: Audit and harden the reward path around an AI agent. Use when an agent might read or modify graders, hidden tests, verifier code, score files, budgets, model selection, monitors, audit logs, release thresholds, or other evaluation machinery; also use for reward hacking and grader gaming controls.
---

# Reward Process Integrity

Map the complete path:

```text
task generation -> agent observation/action -> evidence capture -> verifier ->
score aggregation -> release decision
```

For each boundary, record owner, read access, write access, indirect influence,
failure behavior, and receipt. Assume the plan failed because the agent obtained
a passing score without completing the intended task; identify the exact path.

Apply these controls:

- Separate principals for generation, execution, verification, and release.
- Keep holdouts, expected outputs, and condition labels unavailable to the agent.
- Make verifier, budgets, model selection, logs, and thresholds immutable from the
  evaluated workspace.
- Detect indirect influence through tools, network calls, environment, generated
  reports, and skipped checks.
- Log denied attempts and preserve them even if the task later passes.
- Make errors actionable values; do not let verifier failure become a pass.
- Require independent evidence before release.

Read `../reward-safety/references/deployment-guardrails.md`. Return a data-flow
map, access matrix, demonstrated attack paths, blocked paths, residual risks, and
the smallest executable proof that the boundary holds.
