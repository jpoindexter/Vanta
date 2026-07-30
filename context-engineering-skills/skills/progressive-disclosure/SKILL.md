---
name: progressive-disclosure
description: Refactor oversized agent instructions, rules, specifications, and SKILL.md files into a thin always-loaded entry point plus on-demand branches. Use when AGENTS.md or CLAUDE.md is too long, unrelated guidance loads for every task, one skill covers multiple workflows, a context audit recommends lazy loading, or a monorepo needs path-specific instructions. Preserve required safety and repository gotchas while reducing irrelevant context.
---

# Progressive Disclosure

Move detail closer to the decision that needs it. Preserve discoverability with
a short router and load workflow bodies, references, and examples only on demand.

## Refactor

1. Inventory each instruction and its trigger.
2. Assign it to one layer using
   [layering-guide.md](references/layering-guide.md).
3. Keep the always-on entry point limited to identity, non-negotiable boundaries,
   repository-specific gotchas, and routing descriptions.
4. Move multi-step procedures into skills, directory conventions into
   path-scoped files, deterministic checks into hooks/scripts/tests, and long
   examples into references.
5. Add precise trigger text and direct links from the entry point. Avoid nested
   chains deeper than one hop unless the branch is genuinely independent.
6. Verify every original required constraint has exactly one authoritative home.
7. Compare before/after line count and estimated context weight. Run the affected
   workflow; size reduction alone is not success.

## Do not move on demand

- destructive-action and approval boundaries;
- secrets and data-handling constraints;
- scope and authority limits that apply to every action;
- the minimum routing descriptions needed to discover the deeper material.

## Output

Report the new layer map, preserved constraints, moved material, before/after
weight, and the workflow used to verify behavior.
