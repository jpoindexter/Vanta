---
id: mcp
title: MCP integration
sidebar_position: 1
---

# MCP integration

Vanta speaks the Model Context Protocol both directions — it mounts other MCP servers as tools, and it can expose itself as an MCP server. Either way, every call stays kernel-gated.

## Connector lifecycle

Vanta resolves project `.mcp.json`, user `~/.vanta/mcp.json`, and the explicit `VANTA_MCP_SERVERS` override into one project-scoped connector registry. CLI, TUI, and Desktop use that registry for transport, source, trust, OAuth state, project enablement, discovered tools/resources, health, and the last redacted error.

```bash
vanta mcp list
vanta mcp test <server>
vanta mcp trust <server> allow
vanta mcp disable <server>
vanta mcp enable <server>
vanta mcp reconnect <server>
vanta mcp receipts
```

A connector is not **Ready** until its transport test passes and project trust is explicit. OAuth connectors report **Needs setup** until authorization completes. Disabling writes the project-local MCP policy, so every Vanta host sees the same decision. Test, reconnect, trust, enable/disable, install, and import actions write credential-free receipts under `.vanta/mcp/`.

The registry does not weaken execution safety. Trust decides whether a connector may mount; every MCP tool call still passes through the kernel, and a kernel `Block` cannot be overridden by connector settings.

## As a client — mount external servers

List servers in `.mcp.json` (project-level) or `~/.vanta/mcp.json` (user-level); project config merges over user config. Each server's tools are discovered and registered as normal Vanta tools, gated by `assess()`.

```json
{
  "mcpServers": {
    "my-server": { "command": "npx", "args": ["my-mcp-server"] }
  }
}
```

The client is a dependency-free stdio and remote HTTP JSON-RPC implementation (`initialize`, tool and resource discovery, calls/reads, concurrent-request correlation). It also accepts a `VANTA_MCP_SERVERS` inline env override and supports remote OAuth without placing access tokens in registry state or receipts.

### Mount at runtime

The `mount_mcp` tool spawns an MCP server mid-session and registers its tools into the live registry. The spawn itself is gated by the kernel.

## As a server — expose Vanta

```bash
vanta mcp serve
```

This runs Vanta as an MCP server (mirror of the client). Every incoming call is gated by `assess()`: `block` / `ask` → an `isError` result (headless, no human present), only `allow` executes. A bounded allowlist (`VANTA_MCP_SERVE_TOOLS`, default 9 read-only tools) limits exposure.

## MCP resources

`list_mcp_resources` and `read_mcp_resource` tools read resources exposed by mounted servers.

See [Extending Vanta](./extending.md) for plugins and other extension points.
