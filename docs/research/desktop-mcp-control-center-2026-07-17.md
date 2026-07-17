# Desktop MCP control center receipt

Date: 2026-07-17
Roadmap card: `DESKTOP-MCP-CONTROL-CENTER`

## Shipped behavior

- Connect now has a first-class MCP master/detail surface backed by Vanta's shared MCP registry.
- Installed, imported, and catalog servers show ready, needs setup, blocked, disabled, or error state without exposing credentials.
- The desktop can install vetted catalog entries, import Claude Desktop servers, approve project trust, store connector auth locally, and remove user-owned entries.
- Connector details show tool and resource inventory plus redacted lifecycle receipts.
- Test, Reconnect, Enable/Disable, Remove, and resource-read actions use the shared desktop MCP API.
- Work shows active MCP server and tool counts in the composer so task capability is visible before sending.
- Source development uses the verified debug kernel; packaged Vanta uses only its embedded signed kernel. Selecting an external project no longer changes runtime ownership.

MCP tools still become ordinary Vanta tools through `mcpToolToVantaTool`. Their server, tool name, and arguments feed `describeForSafety`; the normal kernel verdict and desktop approval channel remain the only path to execution. The proof suite executed the desktop allow/deny approval UI and separately exercised MCP tool discovery/test. It did not perform a destructive live MCP write.

## Executed verification

```text
npm run typecheck -- --pretty false
npm run desktop:renderer:typecheck -- --pretty false
npm run desktop:host:test
npx vitest run src/cli/mcp-cmd.test.ts src/cli/startup.test.ts src/desktop/operator-api.test.ts src/mcp/desktop-import.test.ts src/mcp/mount.test.ts desktop-app/src/mcp-connectors-view.test.tsx desktop-app/src/chat.test.tsx --maxWorkers=1
npm run desktop:flow:proof
npm run vanta -- lint src/mcp/config-store.ts src/desktop/mcp-control.ts desktop-app/src/mcp-state.ts desktop-app/src/mcp-connectors-view.tsx
git diff --check
```

The final flow receipt returned `ok: true` for source and packaged targets. Both targets proved install, Claude import, trust approval, OAuth-needed state, tool test, resource read, reconnect failure, disabled-server behavior, and Work composer MCP context at 1440x960, 1024x640, and 760x700.
