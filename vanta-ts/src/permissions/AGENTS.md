# AGENTS.md — vanta-ts/src/permissions

Permission policy helpers layered above the Rust kernel.

- `rules.ts` is the user rule table over `~/.vanta/permissions.tsv`; rules may tighten or auto-confirm kernel asks, never loosen kernel blocks.
- `auto-mode.ts` is the `VANTA_AUTO_MODE` / `--permission-mode auto` classifier: default read-only allows, soft-deny presets, and `settings.autoMode.rules` overrides.
- Tests in this folder should be pure and table-like; dispatch integration belongs in `../agent/permission-gate.test.ts`.
