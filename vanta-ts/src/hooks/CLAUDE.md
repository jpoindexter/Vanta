# CLAUDE.md — vanta-ts/src/hooks

Hook engine map.

- Config file: `.vanta/hooks.json`.
- Events: `Setup`, `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`.
- Types: `command`/`shell` (subprocess stdin JSON), `http` (POST context JSON + allowed env subset), `mcp_tool` (fresh MCP stdio call), `prompt` (provider prompt verdict), `agent` (tool-enabled worker verdict).
- Shared controls: `timeoutMs`, `once`, `statusMessage`; matchers live in `shell-hooks.ts`.

Key decision: agent hooks run through injected `AgentDeps` via `agent-hook-deps.ts`, not a static import from the shell hook runner. This prevents a circular dependency with the main agent loop.

Coverage: live `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, and `Stop` paths can run full `type:"agent"` workers. Early `Setup`/`SessionStart` lifecycle hooks run before `prepareRun`, so they stay shell/http/MCP-only unless a future card moves lifecycle execution later.
