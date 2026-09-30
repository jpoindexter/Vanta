# AGENTS.md — vanta-ts/src/permissions

Permission policy helpers layered above the Rust kernel.

- `rules.ts` is the user rule table over `~/.vanta/permissions.tsv`; rules may tighten or auto-confirm kernel asks, never loosen kernel blocks.
- `auto-mode.ts` is the `VANTA_AUTO_MODE` / `--permission-mode auto` classifier: default read-only allows, soft-deny presets, and `settings.autoMode.rules` overrides. The shared Auto operating mode also inherits the bounded routine file-tool approvals from `../modes/permission-mode.ts`.
- `request.ts` builds per-tool approval request view models for Ink + desktop; it never changes the safety decision.
- `decision.ts` is the shared Desktop/TUI decision contract: persistence failures deny with a safe error, and fresh approvals cannot become persistent allows. Hosts own presentation and settling the waiting request.
- `grant.ts` persists tool-scoped allow/deny rules for Always/Never approval outcomes.
- Tests in this folder should be pure and table-like; dispatch integration belongs in `../agent/permission-gate.test.ts`.
