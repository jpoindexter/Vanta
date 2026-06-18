# CLAUDE.md — vanta-ts/src/hooks

Hook engine map.

- Config file: `.vanta/hooks.json`.
- Events: the schema accepts the 30-event hook vocabulary: `SessionStart`, `Setup`, `InstructionsLoaded`, `UserPromptSubmit`, `UserPromptExpansion`, `MessageDisplay`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `SessionEnd`, `Elicitation`, `ElicitationResult`.
- Types: `command`/`shell` (subprocess stdin JSON), `http` (POST context JSON + allowed env subset), `mcp_tool` (fresh MCP stdio call), `prompt` (provider prompt verdict), `agent` (tool-enabled worker verdict).
- Shared controls: `timeoutMs`, `once`, `statusMessage`; matchers live in `shell-hooks.ts`.

Key decision: agent hooks run through injected `AgentDeps` via `agent-hook-deps.ts`, not a static import from the shell hook runner. This prevents a circular dependency with the main agent loop.

Coverage: live `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `PermissionRequest`, `PermissionDenied`, `UserPromptSubmit`, `UserPromptExpansion`, `MessageDisplay`, `Stop`, `SessionStart`, `SessionEnd`, `InstructionsLoaded`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, and CLI `ConfigChange` have firing points. `VANTA-HOOK-EVENTS` remains building until real owners exist for watcher-only `FileChanged`/`CwdChanged`, MCP `Elicitation`/`ElicitationResult`, `Notification`, `StopFailure`, and `TeammateIdle`.
