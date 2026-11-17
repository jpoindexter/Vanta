---
name: context-doctor
description: Audit every instruction layer that reaches Vanta when context feels bloated, contradictory, duplicated, or stale after a model upgrade. Use for /doctor, context health, prompt cleanup, CLAUDE.md or AGENTS.md trimming, and reviewed cut lists. Read-only by default; never delete instructions or widen permissions without a separately approved exact diff.
created: 2026-07-29
updated: 2026-07-29
---

# Context Doctor

Audit the harness as a system. Preserve repository-specific gotchas and safety
boundaries while reducing irrelevant context.

## Workflow

1. Run `vanta harness-thickness --no-record --limit 12`.
2. Read every reported always-loaded source together. Do not assume one file is
   the full context.
3. Classify each candidate:
   - **conflict** — applicable instructions require incompatible behavior;
   - **duplicate** — equivalent guidance loads from more than one source;
   - **obvious** — generic advice adds no repository fact or enforceable boundary;
   - **model-handled** — old compensation with a verified replacement;
   - **gotcha** — non-obvious repository, safety, or operational knowledge;
   - **procedure** — situational multi-step work that belongs in a skill;
   - **deterministic** — behavior better enforced by code, schema, test, or hook.
4. Report the always-on estimate, keep list, conflicts, move-on-demand list,
   removal candidates, and anything unverified.
5. Stop after proposing a diff. Apply nothing until the operator approves that
   cleanup; handle permission changes separately.

## Guardrails

- Never target a fixed deletion percentage.
- Keep approval, destructive-action, scope, secret, and compliance boundaries
  unless an equivalent deterministic control is verified.
- Do not call a rule obsolete only because a newer model appears capable. Check
  failure history and the replacement control.
- Prefer executable tests, typed schemas, and canonical source files over
  repeated prose.
- After an approved cleanup, rerun the audit and the affected workflow.
