import type { McpToolDef } from "../mcp/client.js";

// Pure view-shaping for the MCP management panel. No IO — takes plain server/tool
// data and produces display rows + status badges + a tool-detail block. Kept
// separate from the panel component and the live gather layer so the shaping
// logic is unit-testable without Ink or spawning MCP servers.

export type McpServerStatus = "connected" | "error";

/** One configured MCP server's connection result + discovered tools. */
export type McpServerView = {
  name: string;
  transport: "stdio" | "http";
  status: McpServerStatus;
  /** Failure detail when status is "error". */
  error?: string;
  tools: McpToolDef[];
};

export type McpServerRow = {
  name: string;
  badge: string;
  badgeOk: boolean;
  detail: string;
};

/** Status badge for a server: ✓ connected (n tools) / ✗ error (reconnectable). */
export function serverRows(servers: McpServerView[]): McpServerRow[] {
  return servers.map((s) => {
    const ok = s.status === "connected";
    const detail = ok
      ? `${s.tools.length} tool${s.tools.length === 1 ? "" : "s"} · ${s.transport}`
      : clip(s.error ?? "connection failed");
    return { name: s.name, badge: ok ? "✓" : "✗", badgeOk: ok, detail };
  });
}

export type McpToolRow = { name: string; desc: string };

/** Tool list for one server — name + first-line description. */
export function toolRows(server: McpServerView | undefined): McpToolRow[] {
  if (!server) return [];
  return server.tools.map((t) => ({ name: t.name, desc: firstLine(t.description ?? "") }));
}

export type McpToolDetail = { name: string; description: string; schema: string };

/** Detail block for a single tool: name, full description, pretty JSON schema. */
export function toolDetail(tool: McpToolDef | undefined): McpToolDetail | null {
  if (!tool) return null;
  return {
    name: tool.name,
    description: tool.description ?? "(no description)",
    schema: formatSchema(tool.inputSchema),
  };
}

/** Whether a server row can be reconnected (only errored servers offer it). */
export function canReconnect(server: McpServerView | undefined): boolean {
  return server?.status === "error";
}

function formatSchema(schema: Record<string, unknown> | undefined): string {
  if (!schema || Object.keys(schema).length === 0) return "(no input schema)";
  try {
    return JSON.stringify(schema, null, 2);
  } catch {
    return "(unserializable schema)";
  }
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return clip(line.trim());
}

const MAX = 64;
function clip(text: string): string {
  return text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text;
}
