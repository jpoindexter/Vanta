# First-class MCP connectors receipt

Date: 2026-07-17  
Roadmap card: `VANTA-MCP-FIRST-CLASS-CONNECTORS`

## Executed behavior

- Project `.mcp.json`, user `~/.vanta/mcp.json`, and explicit environment config resolve into one connector model with source ownership.
- Project trust, OAuth readiness, enablement policy, transport health, last redacted error, and tool/resource inventory appear in one registry record.
- `vanta mcp list|test|reconnect|enable|disable|trust|receipts|catalog|install|import-desktop|serve` uses the shared lifecycle.
- The TUI MCP connection layer reads shared enablement/auth state, persists probes, and receipts reconnects.
- Desktop loopback `GET/POST /api/connect/mcp` reads and changes the same project registry.
- Stdio test uses a real child MCP server and discovers one tool plus one resource. HTTP transport and OAuth token lifecycle remain exercised by their live loopback suites.
- MCP child diagnostics use the scoped MCP environment. Credentials are absent from registry state and receipts.
- Project connector enablement is enforced before session mounting. Project trust still gates mounting. Every mounted tool remains kernel assessed; connector actions do not provide a Block bypass.

## Verification

```text
npm run typecheck
npx vitest run src/cli/mcp-cmd.test.ts src/desktop/operator-api.test.ts src/mcp/registry.test.ts src/mcp/connect.test.ts src/mcp/client.test.ts src/mcp/mount.test.ts src/mcp/http-transport.test.ts src/mcp/auth-flow.test.ts src/ui/mcp-view.test.ts src/ui/mcp-panel.test.tsx --maxWorkers=1
npm run vanta -- lint src/mcp/registry.ts src/mcp/mount-config.ts src/mcp/mount.ts src/mcp/connect.ts src/mcp/client.ts src/ui/mcp-view.ts src/cli/mcp-cmd.ts src/cli/ops.ts src/desktop/mcp-connectors.ts src/desktop/server.ts
git diff --check
```

The exact command outputs are represented by the committed tests and final validation run. Desktop's visual install/auth/inventory control center is the dependent `DESKTOP-MCP-CONTROL-CENTER` card; this slice ships its canonical storage, API, and safety boundary.
