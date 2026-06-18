# AGENTS.md — vanta-ts/src/hooks

Shell/lifecycle hook config and execution for `.vanta/hooks.json`.

- `shell-hooks.ts` owns the 30-event zod schema, matcher rules, and barrel exports.
- `shell-hook-run.ts` dispatches matching hooks, applies `timeoutMs`/`once`/`statusMessage`, and returns block reasons for `PreToolUse`.
- `http-hook-run.ts`, `mcp-hook-run.ts`, `prompt-hook-run.ts`, and `agent-hook-run.ts` are the hook type adapters.
- `agent-hook-deps.ts` builds the injected hook dependencies from live `AgentDeps`; use it from hosts instead of importing the agent loop into `shell-hook-run.ts`.
- Prompt hooks require an injected provider. Agent hooks require injected `AgentDeps` and are wired for live tool, prompt-submit, stop, display, subagent, and task events where a host has `AgentDeps`; early lifecycle and worktree events stay providerless.
- `VANTA-HOOK-EVENTS` is building, not shipped: schema + many Vanta-owned firing points exist; file/cwd watchers, MCP elicitation, and teammate idle still need real lifecycle owners before the card can ship.
- Add one focused test per adapter and keep files under the size gate.
