# CLAUDE.md — vanta-ts/src/permissions

Permission policy modules. The kernel remains the security boundary; this folder only adds tighter or prompt-skipping behavior around non-blocked verdicts.

- `rules.ts`: deterministic permission rules from `permissions.tsv`.
- `auto-mode.ts`: local classifier config used when `VANTA_AUTO_MODE=1`, `--permission-mode auto`, or `settings.autoMode.enabled` is active.
- `request.ts`: maps `{toolName, action, reason}` to bash/file/web/computer/sandbox/skill approval UI sections.
- `grant.ts`: Always/Never helpers that persist tool-scoped allow/deny rules.
- Tests here stay pure/table-like; dispatch integration belongs in `../agent/permission-gate.test.ts`.

Invariant: `block` from the kernel is never changed to `ask` or `allow`.
