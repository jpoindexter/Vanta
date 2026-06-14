# CLAUDE.md — cli operations

`ops.ts` contains top-level command handlers for gateway/service/MCP/roadmap/factory/desktop.
`lifecycle.ts` owns startup lifecycle flags: `--init`, `--init-only`, and `--maintenance`.
`output-callbacks.ts` owns output-format callback wiring for `vanta run`.

Conventions:
- Lazy-import heavier subsystems inside command handlers.
- Keep `ops.ts` under the repo size discipline where possible; split by subsystem when it grows.
- Commands that execute agent work should reuse `prepareRun`/`runAgent`/`createConversation` so the kernel remains the boundary.
