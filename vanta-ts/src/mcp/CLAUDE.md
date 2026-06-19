# CLAUDE.md — vanta-ts/src/mcp

MCP support for Vanta.

- `client.ts`: minimal JSON-RPC client over injectable transports. `listTools`/`callTool` plus the prompts capability (`listPrompts`/`getPrompt`). Server requests containing `elicitation` are answered with `{action:"cancel"}` unless a host callback supplies another result.
- `events.ts`: hook adapter for `Notification`, `Elicitation`, and `ElicitationResult`.
- `mount.ts`: config merge + runtime tool registration. Pass the active repo/root cwd so project `.mcp.json` and hook data directories line up.
- `skills.ts`: MCP-SKILLS pure mapper — maps a server's declared prompts (the MCP prompts capability) to Vanta skill/command descriptors. `invoke(arg, assess)` gates through the kernel then renders via `getPrompt`; errors-as-values. Testable with a mocked client; no spawn, no kernel.
- `mount-skills.ts`: registers MCP-provided skills into the existing `PluginCommandRegistry` (not a fork) so they appear in `/skills` and are invokable as `/mcp-<server>-<prompt>`. Gated behind `VANTA_MCP_SKILLS` (default off). Skill command names are hyphenated to satisfy the registry name rule.
- `http-transport.ts`: remote MCP over HTTP with bearer-token resolution from explicit token or `VANTA_MCP_TOKEN_<SERVER>`.
- `server.ts`: Vanta-as-MCP-server; default exposure is read-only and kernel-gated.

Tests stay transport-injected; do not require external MCP binaries.
