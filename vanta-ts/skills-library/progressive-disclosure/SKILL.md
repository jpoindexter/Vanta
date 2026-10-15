---
name: progressive-disclosure
description: Refactor oversized Vanta instructions, rules, specifications, and skills into a thin always-loaded entry point plus on-demand branches. Use when AGENTS.md or CLAUDE.md is long, unrelated guidance loads for every task, one skill covers multiple workflows, a context audit recommends lazy loading, or a monorepo needs path-scoped instructions.
created: 2026-07-29
updated: 2026-07-29
---

# Progressive Disclosure

Move detail closer to the decision that needs it while preserving one obvious
route to every branch.

## Refactor

1. Inventory each instruction and its trigger.
2. Assign one authoritative home:
   - always-on core: authority, approval, scope, secrets, destructive actions;
   - root instructions: layout, canonical commands, non-obvious conventions;
   - path-scoped instructions: directory or language conventions;
   - skill: situational multi-step workflow;
   - reference: long examples, rubrics, specifications, and API tables;
   - script/schema/test/hook: deterministic validation or blocking policy.
3. Keep the entry point to identity, non-negotiable boundaries, gotchas, and
   precise routing descriptions.
4. Avoid reference chains deeper than one hop unless branches are independent.
5. Verify every required original constraint has exactly one authoritative home.
6. Compare before/after weight and run the affected workflow. Smaller alone is
   not success.

Do not lazy-load destructive-action, approval, secret, or scope boundaries, or
the routing descriptions required to discover deeper material.
