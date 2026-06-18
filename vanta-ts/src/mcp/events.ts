import { join } from "node:path";
import { fireHooks } from "../hooks/shell-hooks.js";
import type { McpClientEvents } from "./client.js";

export function mcpClientEvents(repoRoot: string, server: string): McpClientEvents {
  const dataDir = join(repoRoot, ".vanta");
  return {
    onNotification: (method, params) =>
      fireHooks(dataDir, "Notification", { type: "mcp_notification", server, method, params }, { cwd: repoRoot, matcherValue: "mcp_notification" }),
    onElicitation: async ({ method, params }) => {
      await fireHooks(dataDir, "Elicitation", { server, method, params }, { cwd: repoRoot, matcherValue: server });
      return { action: "cancel", content: {}, reason: "MCP elicitation UI is not available in this host" };
    },
    onElicitationResult: ({ method, result }) =>
      fireHooks(dataDir, "ElicitationResult", { server, method, result }, { cwd: repoRoot, matcherValue: server }),
  };
}
