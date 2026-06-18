# AGENTS.md — vanta-ts/src/repl

Slash-command handlers and REPL-local session state.

- Keep handlers small and return `SlashResult` values; hosts decide how to print, resend, or exit.
- Mutate `ctx.state`, `ctx.setup`, and `ctx.env` only when the command is explicitly a live session setting.
- `/rewind` uses `../sessions/file-checkpoint.ts` to list/restore in-memory pre-edit snapshots; `/hooks` edits `.vanta/hooks.json`.
- `/recover` is pure failure-mode triage over the recent transcript: targeted bug → debug, polluted context → compact/restart, wrong assumption → revisit plan.
- `/goal blocks <blocker> <dependent>` and `/goal blocked_by <dependent> <blocker>` store graph edges via `../goals/deps.ts`; `/goal status` and `/goals` render derived blocked/wake state.
- Prefer direct handler tests for narrow command behavior and `repl-commands.test.ts` for dispatcher behavior.
