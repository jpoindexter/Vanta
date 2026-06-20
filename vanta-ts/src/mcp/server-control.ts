// VANTA-MCP-RECONNECT-TOGGLE — the pure control model behind a live `/mcp` toggle.
//
// A mounted MCP server is one of three states: `connected` (tools live in the
// registry), `disabled` (deliberately off, no tools), or `error` (a connect
// attempt failed). The operator can request three actions — enable, disable,
// reconnect — and this module resolves each request into a concrete plan the
// live layer executes:
//
//   plan "connect"    → mount.ts mounts the server + registers its tools
//   plan "disconnect" → mount.ts kills the child + unregisters its tools
//   plan "reconnect"  → disconnect then connect (drops stale tools, re-lists)
//   plan "noop"       → already in the requested state; nothing to do
//
// This file is PURE (state + action + format only): no spawn, no kernel, no IO.
// A future `/mcp <server> enable|disable|reconnect` handler (in repl/handlers.ts
// alongside the other `mcp_*` surfaces) calls `resolveMcpAction(status, action)`
// then dispatches the returned plan to the live mount/unmount path in mount.ts
// (`mountOneServer` to connect, the child `kill()` + registry-unregister to
// disconnect). That execution wiring is deliberately out of scope this round —
// this is the tested model the handler resolves against.

/** A mounted MCP server's lifecycle state. */
export type McpServerState = "connected" | "disabled" | "error";

/** A snapshot of one mounted server's state for the control model + display. */
export type McpServerStatus = {
  name: string;
  state: McpServerState;
  toolCount: number;
  lastError?: string;
};

/** An operator-requested transition. */
export type McpServerAction = "enable" | "disable" | "reconnect";

/** What the live layer should do to satisfy a requested action. */
export type McpPlan = "connect" | "disconnect" | "reconnect" | "noop";

/** The resolution of a requested action against a server's current state. */
export type McpActionPlan = {
  plan: McpPlan;
  reason: string;
};

/**
 * Resolve a requested action against a server's current state into a concrete
 * plan + a human-readable reason. Pure: legal-transition logic only, no IO.
 *
 *   enable  a disabled/error server → connect  (bring its tools up)
 *   enable  a connected server      → noop     (already up)
 *   disable a connected/error server→ disconnect
 *   disable a disabled server       → noop     (already off)
 *   reconnect (any state)           → reconnect (drop stale tools, re-list)
 */
export function resolveMcpAction(
  status: McpServerStatus,
  action: McpServerAction,
): McpActionPlan {
  const { name, state } = status;
  switch (action) {
    case "reconnect":
      return { plan: "reconnect", reason: `reconnect ${name}` };
    case "enable":
      return state === "connected"
        ? { plan: "noop", reason: `${name} already connected` }
        : { plan: "connect", reason: `enable ${name} (${state} → connected)` };
    case "disable":
      return state === "disabled"
        ? { plan: "noop", reason: `${name} already disabled` }
        : { plan: "disconnect", reason: `disable ${name} (${state} → disabled)` };
  }
}

/** The glyph that leads a status line for a given state. */
function stateGlyph(state: McpServerState): string {
  if (state === "connected") return "●";
  if (state === "disabled") return "○";
  return "✘";
}

/** Render one server status as a compact one-line summary. */
export function formatMcpServer(status: McpServerStatus): string {
  const glyph = stateGlyph(status.state);
  if (status.state === "connected") {
    return `${glyph} ${status.name} (connected, ${status.toolCount} tools)`;
  }
  if (status.state === "disabled") {
    return `${glyph} ${status.name} (disabled)`;
  }
  return `${glyph} ${status.name} (error: ${status.lastError ?? "unknown"})`;
}

/** Render the compact status list for `/mcp` (one line per server). */
export function formatMcpServers(statuses: McpServerStatus[]): string {
  if (statuses.length === 0) return "(no mcp servers mounted)";
  return statuses.map(formatMcpServer).join("\n");
}
