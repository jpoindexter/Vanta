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

## Integration correction and real-path proof (lead)

- Scoping saved rules to a project exposed a second lookup that still ignored the root:
  `savedExactChoice` in `vanta-ts/src/agent/execution-context.ts` (the inner-approval path used by
  `edit_file`). Project rules never matched there, so the Desktop card re-prompted every time.
  `src/agent/saved-exact-choice-scope.test.ts` failed on the worker's commits (2 of 3) and passes
  after the root is passed through.
- Desktop copy now says remembered choices apply "in this project, including future tasks".
- Executed in the real Electron app (source `main.mjs`, disposable `VANTA_HOME`/profile, fixture
  provider): `node scripts/desktop-approval-persistence-proof.mjs` — Always allow in project A,
  full app restart, new chat in A applies without a card; project B still asks and Reject leaves
  its file unchanged. All six assertions passed.
- Does NOT establish: the CLI/TUI path end to end, packaged-app behavior, real provider tools
  (only the fixture's `edit_file`), or `shell_cmd` grants. Existing global rules stay global.
- Open decision: a project-scoped Always outranks an unscoped Never for the same tool.
