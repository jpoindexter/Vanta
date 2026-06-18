# CLAUDE.md — cli operations

`ops.ts` contains top-level command handlers for gateway/service/MCP; `ops-app.ts` holds the desktop/factory/pairing/config handlers it re-exports; `roadmap-cmd.ts` the roadmap one.
`startup.ts` owns bootstrap + `startInteractive` (repo-root find, env load, TTY setup wizard, run-arg/startup-flag parsing).
`lifecycle.ts` owns startup lifecycle flags: `--init`, `--init-only`, and `--maintenance`.
`output-callbacks.ts` owns output-format callback wiring for `vanta run`.
`memory-cmd.ts`/`skills-cmd.ts`/`hooks-cmd.ts` hold the `vanta memory`/`skills`+`skill`/`hooks` handlers.
`fleet-cmd.ts` owns `vanta fleet run/status/review/accept` and delegates orchestration to `src/fleet/`.
`auto-research-cmd.ts` owns `vanta auto-research --objective --metric --bounds` and delegates the loop to `src/auto-research/`.
`meta-tune-cmd.ts` owns `vanta meta-tune instructions [--iters N] [--adopt]` and delegates tuning to `src/meta-tune/`.
`extra-cmds.ts`+`extra-cmds-2.ts` hold smaller command handlers (plugins/taste/models/acp/proxy; ref/settings/brief).
`loop-cmd.ts` owns loop CRUD (add/list/run); `loop-cmd-ops.ts` holds its state-mutation handlers (escalations/clear/pause/resume/kill/show).

Conventions:
- Lazy-import heavier subsystems inside command handlers.
- Keep `ops.ts` under the repo size discipline where possible; split by subsystem when it grows.
- Commands that execute agent work should reuse `prepareRun`/`runAgent`/`createConversation` so the kernel remains the boundary.
