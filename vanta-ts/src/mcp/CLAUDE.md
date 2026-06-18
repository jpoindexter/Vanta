# CLAUDE.md — vanta-ts/src/mcp

MCP support for Vanta.

- `client.ts`: minimal JSON-RPC client over injectable transports. Server requests containing `elicitation` are answered with `{action:"cancel"}` unless a host callback supplies another result.
- `events.ts`: hook adapter for `Notification`, `Elicitation`, and `ElicitationResult`.
- `mount.ts`: config merge + runtime tool registration. Pass the active repo/root cwd so project `.mcp.json` and hook data directories line up.
- `http-transport.ts`: remote MCP over HTTP with bearer-token resolution from explicit token or `VANTA_MCP_TOKEN_<SERVER>`.
- `server.ts`: Vanta-as-MCP-server; default exposure is read-only and kernel-gated.

Tests stay transport-injected; do not require external MCP binaries.
