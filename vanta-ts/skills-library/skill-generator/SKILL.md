---
name: skill-generator
description: Use when asked to create, generate, author, or bootstrap a NEW skill from a natural-language description. Turns "make me a skill that does X" into a stored SKILL.md by drafting valid frontmatter + body and writing it with the existing write_skill tool — dogfooding the skill system.
---

# Skill Generator

Generate a new, reusable skill from a description and store it. The skill system
already owns storage (`write_skill` → `~/.vanta/skills/<slug>/SKILL.md`); this
skill is the authoring discipline that feeds it. Do NOT hand-roll a file write.

## When to use

The user describes a capability they want captured as a skill: "create a skill
that summarizes PRs", "make a skill for our deploy checklist", "bootstrap a skill
from this description".

## Steps

1. **Read the description.** Extract the skill's purpose and WHEN it should fire.
2. **Draft three fields:**
   - `name` — a short **kebab-case** slug (lowercase, hyphens, no spaces). This
     becomes the directory; keep it slug-safe (no `/`, no `..`).
   - `description` — ONE sentence stating when to use the skill. This is what
     `recall` matches against, so lead with the trigger ("Use when …").
   - `body` — a Markdown how-to: a `# Title`, then concise numbered steps or
     rules. Write the procedure, not prose about it.
3. **Write it with the existing tool.** Call `write_skill` with
   `{ name, description, body }` (and optional `tags`). That persists and commits
   the `SKILL.md` and wires it into the registry — it appears in `/skills` and is
   recallable next session. Never write the file by hand.
4. **Confirm.** Report the stored slug and path from the tool result.

## Rules

- One concern per skill. A description spanning several jobs → several skills.
- The `description` is the index entry — make it specific and trigger-first.
- The `body` must let an agent reproduce the behavior WITHOUT re-asking. No TODOs
  or placeholders.
- Reuse existing skills before generating a near-duplicate (`recall` first).

## Reference

- `write_skill` tool — the storage path (do not reimplement it).
- `skills/skill-gen.ts` — pure `buildSkillFromDescription` /
  `parseSkillModelOutput` (prompt builder + JSON→`{name, description, body}`
  validator, kebab-validated so the path can't escape) if generating
  programmatically rather than authoring inline.
- `skills/store.ts` `writeSkill` — preserves `created`, bumps `updated`.

## Verification

- After `write_skill`, the new skill shows in `/skills` and `recall` finds it by
  its description.
- The stored frontmatter has `name`, `description`, `created`, `updated`, `tags`.
