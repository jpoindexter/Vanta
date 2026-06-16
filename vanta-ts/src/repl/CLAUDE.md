# CLAUDE.md — vanta-ts/src/repl

REPL and slash-command surface.

- `types.ts` defines `ReplCtx`, `ReplState`, and `SlashResult`.
- Individual `*-cmd.ts` files own focused slash behavior; `*-cmds.ts` files group several related handlers (e.g. `context-cmds.ts`, `media-cmds.ts`, `session-cmds.ts`).
- Command handlers should be pure aside from deliberate `ctx` mutation and filesystem work described by the command.
- Add co-located tests for new command helpers or state mutation.
