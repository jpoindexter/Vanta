# Approval persistence (2026-10-13)

## What "Always allow this tool" / "Never" persist

- Store: `$VANTA_HOME/permissions.tsv` (default `~/.vanta/permissions.tsv`), one rule per line: `action<TAB>tool<TAB>pattern[<TAB>root]`.
- Before this change a choice was tool-only and global: `allow<TAB>shell_cmd<TAB>` applied to every project on the Mac.
- Now a choice made in Desktop or the TUI carries the project root (symlink-resolved) as the fourth column and applies only in that project. Old three-column rules keep applying everywhere. At equal specificity a project rule outranks a global one.
- Every approval goes through `matchRule(rules, tool, descriptor, root)` in `src/agent/decision-chain.ts` (outer gate) and `src/agent/execution-context.ts` (exact inner approval), so Desktop, TUI and `vanta run` read the same file on every call. Nothing is cached in memory, so a new task or a restarted process sees saved rules and revocations (`/permissions remove`).
- Writes go through a single in-process queue and a write-then-rename, so concurrent choices cannot drop each other and a crash cannot truncate the file.

## What is never remembered

- Requests marked `fresh` (standing-instruction files, publication, payments, replay) and policies with `canRemember: false`: the host refuses to save, and the saved rule is not consulted.
- Inner approvals whose action differs from the approved outer action (for example the `write_file` overwrite prompt) are made fresh by `src/effects/tool-effect-approval.ts`; a saved `write_file` rule does not cover them. This is intentional and covered by a test.
- The kernel `block` verdict is unchanged: `tighten()` still cannot loosen it.
- Task-scope grants ("Yes - go ahead with this task") remain in memory for one turn.
