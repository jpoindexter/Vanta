# AGENTS.md — vanta-ts/src/repl

Slash-command handlers and REPL-local session state.

- Keep handlers small and return `SlashResult` values; hosts decide how to print, resend, or exit.
- Mutate `ctx.state`, `ctx.setup`, and `ctx.env` only when the command is explicitly a live session setting.
- `/rewind` uses `../sessions/file-checkpoint.ts` to list/restore in-memory pre-edit snapshots; `/hooks` edits `.vanta/hooks.json`.
- Prefer direct handler tests for narrow command behavior and `repl-commands.test.ts` for dispatcher behavior.
