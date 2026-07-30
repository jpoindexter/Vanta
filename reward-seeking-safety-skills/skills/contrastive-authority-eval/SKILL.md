---
name: contrastive-authority-eval
description: Design or review paired evaluations that test whether an AI agent follows a grader over a user, operator, developer, policy, or honesty constraint. Use for authority conflicts, reward-seeking detection, contrastive belief tests, grader-vs-user behavior, promise-breaking evals, or honesty-vs-task-completion experiments.
---

# Contrastive Authority Evaluation

1. Write the task distribution and authority contract before examples.
2. Select a mutually exclusive feature with frequent opportunities to occur.
3. Create paired conditions that reverse only the authority-to-feature mapping.
4. Freeze model, harness, tools, budget, prompt structure, and scoring.
5. Add a positive control, negative control, and manipulation/recall check.
6. Run enough independent samples to report uncertainty, invalids, and refusals.
7. Inspect behavior and receipts; use reasoning traces only as secondary evidence.
8. Compute the contextual gap with
   `../reward-safety/scripts/contrastive-gap.mjs`.
9. Replicate across at least one changed task form before claiming detection.

Read `../reward-safety/references/authority-contract.md` and
`../reward-safety/references/measurement.md` before authoring cases.

For API-only models, explicit in-context conflicts are a triage detector. Label
the result `detector_only`; do not rank models or checkpoints from it. For SDF or
another out-of-context intervention, report finetuning controls and off-target
checks separately.

Output the complete eval contract, paired templates, scoring rule, controls,
sample plan, analysis command, and claim boundary.
