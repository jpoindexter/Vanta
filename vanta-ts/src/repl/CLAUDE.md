# CLAUDE.md — vanta-ts/src/repl

REPL and slash-command surface.

- `types.ts` defines `ReplCtx`, `ReplState`, and `SlashResult`.
- Individual `*-cmd.ts` files own focused slash behavior; `*-cmds.ts` files group several related handlers (e.g. `context-cmds.ts`, `media-cmds.ts`, `session-cmds.ts`).
- `recover-cmd.ts` owns `/recover`: a pure classifier over recent `Message[]` signals that returns the corrective route (`debug`, `compact-or-restart`, `revisit-plan`) without model calls.
- `context-cmds.ts`'s `usage` handler: bare `/usage` is the unchanged session-scoped view; `/usage breakdown [--since <ISO>]` (PCLIP-COST-ATTRIBUTION) reads the persisted `.vanta/spend-ledger.jsonl` via `cost/ledger.ts`/`cost/attribution.ts` for a cross-session breakdown by goal/agent/provider/model.
- `goal-cmd.ts` owns `/goal`: show/set/clear/done plus dependency verbs `blocks` and `blocked_by`; graph persistence/derivation lives in `../goals/deps.ts`.
- `hooks-cmd.ts` owns `/hooks`: add/remove command hooks and list all `.vanta/hooks.json` hook types (`command`/`shell`, `http`, `mcp_tool`, `prompt`, `agent`).
- Command handlers should be pure aside from deliberate `ctx` mutation and filesystem work described by the command.
- Add co-located tests for new command helpers or state mutation.
