# CLAUDE.md — vanta-ts/src/hooks

Hook engine map.

- Config file: `.vanta/hooks.json`.
- Events: `Setup`, `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`.
- Types: `command`/`shell` (subprocess stdin JSON), `http` (POST context JSON + allowed env subset), `mcp_tool` (fresh MCP stdio call), `prompt` (provider prompt verdict), `agent` (tool-enabled worker verdict).
- Shared controls: `timeoutMs`, `once`, `statusMessage`; matchers live in `shell-hooks.ts`.

Key decision: agent hooks run through an injected callback from `agent/dispatch-tool.ts`, not a static import from the hook runner. This prevents a circular dependency with the main agent loop.
