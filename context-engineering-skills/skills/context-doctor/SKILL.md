---
name: context-doctor
description: Audit the instruction layers that reach an AI coding agent, including AGENTS.md, CLAUDE.md, GEMINI.md, repository rules, hooks, and installed SKILL.md files. Use when context feels bloated or contradictory, a model upgrade makes old guardrails suspect, instructions are duplicated across layers, or the user asks for /doctor, checkup, prompt cleanup, context weight, or a reviewed cut list. Read-only by default; never delete or rewrite instructions without a separately approved diff.
---

# Context Doctor

Audit context as a system, not one file at a time. Produce evidence and a
reviewable reduction plan while preserving repository-specific gotchas and
safety boundaries.

## Workflow

1. Run the deterministic inventory from the repository root:

   ```bash
   node <skill-directory>/scripts/audit-context.mjs .
   ```

2. Read every reported always-on instruction source together. Load on-demand
   skill bodies only when their descriptions overlap the audit target.
3. Classify candidate instructions using
   [classification.md](references/classification.md). Treat semantic labels as
   judgment, not deterministic fact.
4. Report:
   - estimated always-on context weight;
   - conflicts and exact duplicates, with both source locations;
   - generic guidance that the current model or repository already supplies;
   - repository-specific gotchas worth retaining;
   - procedures that should move to an on-demand skill or path-scoped rule;
   - a proposed diff, separated from permission or policy changes.
5. Stop after the report unless the user explicitly authorizes cleanup. When
   authorized, apply only the reviewed diff and rerun the inventory.

## Guardrails

- Do not target a fixed deletion percentage. Reduction is an outcome of evidence.
- Keep safety, compliance, destructive-action, approval, and scope rules unless
  an equivalent deterministic control is verified.
- Never widen permissions while decluttering context. Ask separately.
- Prefer executable tests, schemas, and canonical files over repeated prose.
- Do not call a rule obsolete only because a newer model appears capable. Check
  the failure history, owner, and replacement control.
- Do not persist file contents, tool arguments, credentials, or private prompts
  in analytics.

## Output

Use this compact structure:

```text
Context health: healthy | review | overloaded
Always-on estimate: N tokens across N sources
Keep: source:line — reason
Move on demand: source:line → destination
Remove candidate: source:line — duplicate/obvious/replaced
Conflict: source:line ↔ source:line
Unverified: what could not be inspected
Next: reviewed diff or no change
```
