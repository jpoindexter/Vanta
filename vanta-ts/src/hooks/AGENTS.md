# AGENTS.md — vanta-ts/src/hooks

Shell/lifecycle hook config and execution for `.vanta/hooks.json`.

- `shell-hooks.ts` owns the zod schema, event list, matchers, and barrel exports.
- `shell-hook-run.ts` dispatches matching hooks, applies `timeoutMs`/`once`/`statusMessage`, and returns block reasons for `PreToolUse`.
- `http-hook-run.ts`, `mcp-hook-run.ts`, `prompt-hook-run.ts`, and `agent-hook-run.ts` are the hook type adapters.
- `agent-hook-deps.ts` builds the injected hook dependencies from live `AgentDeps`; use it from hosts instead of importing the agent loop into `shell-hook-run.ts`.
- Prompt hooks require an injected provider. Agent hooks require injected `AgentDeps` and are wired for live tool, prompt-submit, and stop events; early lifecycle events run before `prepareRun` and stay providerless.
- Add one focused test per adapter and keep files under the size gate.
