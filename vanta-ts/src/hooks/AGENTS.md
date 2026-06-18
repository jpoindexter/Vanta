# AGENTS.md — vanta-ts/src/hooks

Shell/lifecycle hook config and execution for `.vanta/hooks.json`.

- `shell-hooks.ts` owns the 30-event zod schema, matcher rules, and barrel exports.
- `shell-hook-run.ts` dispatches matching hooks, applies `timeoutMs`/`once`/`statusMessage`, and returns block reasons for `PreToolUse`.
- `runtime-events.ts` owns shared `StopFailure` classification and `CwdChanged` dispatch helpers.
- `file-watch.ts` starts the opt-in `FileChanged` watcher only when that event is configured.
- `http-hook-run.ts`, `mcp-hook-run.ts`, `prompt-hook-run.ts`, and `agent-hook-run.ts` are the hook type adapters.
- `agent-hook-deps.ts` builds the injected hook dependencies from live `AgentDeps`; use it from hosts instead of importing the agent loop into `shell-hook-run.ts`.
- Prompt hooks require an injected provider. Agent hooks require injected `AgentDeps` and are wired where the host has live agent deps; early lifecycle, worktree, file-watch, and notification paths stay providerless or prompt-only by design.
- `VANTA-HOOK-EVENTS` is shipped: all 30 event names have schema support and a Vanta-owned firing point.
- Add one focused test per adapter and keep files under the size gate.
