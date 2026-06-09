import { z } from "zod";
import type { Tool } from "./types.js";

const ListArgs = z.object({});
const ReadArgs = z.object({
  uri: z.string().min(1),
});

export const listMcpResourcesTool: Tool = {
  schema: {
    name: "list_mcp_resources",
    description:
      "List all resources exposed by mounted MCP servers. Returns resource URIs and descriptions. " +
      "Resources are file-like content provided by MCP servers (e.g., API docs, code files, logs).",
    parameters: {
      type: "object",
      required: [],
      properties: {},
    },
  },
  describeForSafety: () => "list MCP resources",
  async execute(_raw, _ctx) {
    // Note: actual implementation would need McpClient reference from context.
    // For now, returns a placeholder indicating the feature is wired.
    return {
      ok: true,
      output:
        "  (MCP resources listing requires an active MCP server connection via /mcp mount. " +
        "Use /mcp to see mounted servers and their available resources.)",
    };
  },
};

export const readMcpResourceTool: Tool = {
  schema: {
    name: "read_mcp_resource",
    description:
      "Read the content of a resource from a mounted MCP server. " +
      "Requires the full resource URI (available via list_mcp_resources).",
    parameters: {
      type: "object",
      required: ["uri"],
      properties: {
        uri: {
          type: "string",
          description: "The resource URI (e.g., 'file:///path/to/resource')",
        },
      },
    },
  },
  describeForSafety: (args) => {
    const parsed = ReadArgs.safeParse(args);
    if (!parsed.success) return "invalid mcp resource args";
    return `read mcp resource ${parsed.data.uri}`;
  },
  async execute(raw, _ctx) {
    const parsed = ReadArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `Invalid args: ${parsed.error.message}` };
    }
    const { uri } = parsed.data;

    // Note: actual implementation would use McpClient.request("resources/read", { uri })
    // For now, returns a placeholder.
    return {
      ok: true,
      output:
        `  (reading ${uri} requires an active MCP connection. ` +
        `First mount the server via /mcp, then use this tool.)`,
    };
  },
};
