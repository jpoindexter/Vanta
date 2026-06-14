# CLAUDE.md — vanta-ts/src/permissions

Permission policy modules. The kernel remains the security boundary; this folder only adds tighter or prompt-skipping behavior around non-blocked verdicts.

- `rules.ts`: deterministic permission rules from `permissions.tsv`.
- `auto-mode.ts`: local classifier config used when `VANTA_AUTO_MODE=1`, `--permission-mode auto`, or `settings.autoMode.enabled` is active.
- `auto-mode.test.ts` and `rules.test.ts`: pure safety matrix coverage.

Invariant: `block` from the kernel is never changed to `ask` or `allow`.
