# CLAUDE.md — vanta-ts/src/hooks

Hook engine map.

- Config file: `.vanta/hooks.json`.
- Events: the schema accepts the 30-event hook vocabulary: `SessionStart`, `Setup`, `InstructionsLoaded`, `UserPromptSubmit`, `UserPromptExpansion`, `MessageDisplay`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `SessionEnd`, `Elicitation`, `ElicitationResult`.
- Types: `command`/`shell` (subprocess stdin JSON), `http` (POST context JSON + allowed env subset), `mcp_tool` (fresh MCP stdio call), `prompt` (provider prompt verdict), `agent` (tool-enabled worker verdict).
- Shared controls: `timeoutMs`, `once`, `statusMessage`; matchers live in `shell-hooks.ts`.

Key decision: agent hooks run through injected `AgentDeps` via `agent-hook-deps.ts`, not a static import from the shell hook runner. This prevents a circular dependency with the main agent loop.

Coverage: `VANTA-HOOK-EVENTS` is shipped. Core agent/session/tool events fire from readline, TUI, and one-shot hosts where applicable; `Notification` fires through `term/notify.ts`; `StopFailure` fires from host catch paths; `TeammateIdle` fires when fleet workers finish; `FileChanged` uses an opt-in watcher started only when hooks are configured; `CwdChanged` fires when `vanta room <name> "<instruction>"` switches run roots; MCP `Elicitation`/`ElicitationResult` and MCP notifications are surfaced by `mcp/events.ts`.
