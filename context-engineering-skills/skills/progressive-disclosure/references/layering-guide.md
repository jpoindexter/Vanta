# Context layering guide

| Material | Preferred layer |
| --- | --- |
| Authority, destructive-action, secret, and approval boundaries | Always-on core |
| Repository layout, canonical build/test commands, non-obvious conventions | Root project instructions |
| Directory- or language-specific conventions | Path-scoped instructions |
| Multi-step release, review, migration, or design workflow | Skill |
| Long examples, rubrics, specifications, and API tables | Skill reference |
| Mechanical validation or blocking policy | Script, schema, test, or hook |
| Personal preference that should persist across repositories | User-level instructions or memory |
| Historical transcript or evidence | Linked artifact, loaded for the relevant task |

The entry point should explain what exists and when to load it. It should not
summarize every branch. One authoritative location per constraint is the goal.
