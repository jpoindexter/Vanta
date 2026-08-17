---
id: mcp
title: MCP integration
sidebar_position: 1
---

# MCP integration

Vanta speaks the Model Context Protocol both directions — it mounts other MCP
servers as tools, and it can expose a bounded allowlist as an MCP server.
Mounted calls, connector launches, configuration effects, and the bounded
read-only server path are classified by the shared effect gateway and kernel.
The checked effect inventory is the coverage boundary; a new transport or tool
must be classified and tested before it is considered mediated.

## Connector lifecycle

Vanta resolves project `.mcp.json`, user `~/.vanta/mcp.json`, and the explicit `VANTA_MCP_SERVERS` override into one project-scoped connector registry. Configured connectors stay dormant during normal startup: they do not spawn processes, print mount noise, or add their schemas to every model call. CLI, TUI, and Desktop use the registry on demand for transport, source, trust, OAuth state, project enablement, discovered tools/resources, health, and the last redacted error.

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

The registry does not weaken the standard execution path. Trust decides whether
a connector may mount; mounted calls are assessed by the shared gateway and
kernel, and connector settings cannot loosen a kernel `Block`. Connector
configuration, launch, operation, and receipts are included in the checked
effect inventory.

To deliberately mount enabled connectors at every session start, set
`mcp.autoMount` to `true` in Vanta settings or export
`VANTA_MCP_AUTO_MOUNT=1`. The environment override can also force it off with
`VANTA_MCP_AUTO_MOUNT=0`.

## As a client — mount external servers

List servers in `.mcp.json` (project-level) or `~/.vanta/mcp.json` (user-level); project config merges over user config. Configuration alone does not start a server. Use the MCP panel, `vanta mcp test/reconnect`, the `mount_mcp` tool, or the explicit auto-mount setting when its tools are needed. Registered tools remain gated by `assess()`.

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

### Optional Scrapling fallback

Vanta's catalog includes Scrapling for sites that need stronger extraction than
`web_fetch`. Keep it in an isolated user-owned environment, then install the
read-mostly connector:

```bash
python3 -m venv ~/.vanta/tools/scrapling
~/.vanta/tools/scrapling/bin/pip install 'scrapling[ai]==0.4.14'
~/.vanta/tools/scrapling/bin/scrapling install
mkdir -p ~/.local/bin
ln -sf ~/.vanta/tools/scrapling/bin/scrapling ~/.local/bin/scrapling
vanta mcp install scrapling
vanta mcp trust scrapling allow
vanta mcp test scrapling
```

The default allowlist exposes only `get`, `fetch`, and `stealthy_fetch`.
Bulk variants require an explicit `--with-tool`; every target, proxy, and CDP URL
passes Vanta's public-network SSRF guard before Scrapling receives it.

## As a server — expose Vanta

```bash
vanta mcp serve
```

This runs Vanta as an MCP server (mirror of the client). Every incoming call is gated by `assess()`: `block` / `ask` → an `isError` result (headless, no human present), only `allow` executes. A bounded allowlist (`VANTA_MCP_SERVE_TOOLS`, default 9 read-only tools) limits exposure.

## MCP resources

`list_mcp_resources` and `read_mcp_resource` tools read resources exposed by mounted servers.

See [Extending Vanta](./extending.md) for plugins and other extension points.
