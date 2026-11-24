# A comment saying "blocked upstream" is not a gate: test the mode against a saved Always rule

Date: 2026-10-14 · Area: access modes / plan gate

`PLAN_MODE_ALLOWED_TOOLS` listed `edit_file` with the comment "write-path is blocked by this gate upstream". Nothing upstream
blocked it. With an Always rule saved for `edit_file` (what the done-path creates in step b), Plan mode edited the file with no
card. Reproduced with a real conversation before changing anything.

## Pattern

1. When proving a restrictive mode (Plan, read-only), drive the real tool through the real conversation with the permissive
   state present (saved Always rule, kernel verdict "ask"), not only the clean state. A restriction that holds only while no
   rule is saved is not a restriction.
2. A default-deny allowlist must not carry an entry whose justification is a comment about another layer. Read the other layer.
3. Add the control: the same call under the permissive mode must run or ask, otherwise "refused" proves nothing.
4. A project-wide setting held in per-chat state needs a fan-out: each chat client has its own state object, so a mode set in
   one chat was ignored by the others until restart.
