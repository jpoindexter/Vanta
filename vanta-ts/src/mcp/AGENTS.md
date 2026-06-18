# AGENTS.md — vanta-ts/src/mcp

MCP client/server/mount layer.

- `client.ts` is the JSON-RPC client; it correlates requests, surfaces server notifications, and answers server elicitation requests with a safe cancel fallback.
- `events.ts` maps MCP notifications/elicitation into `.vanta/hooks.json` events.
- `mount.ts` reads `VANTA_MCP_SERVERS`, `./.mcp.json`, and `~/.vanta/mcp.json`; mounts tools relative to the caller cwd/root.
- `server.ts` exposes a bounded allowlist of Vanta tools over MCP and still kernel-gates calls.
- Keep transports injectable and tests offline; no live MCP server should be required for unit tests.
