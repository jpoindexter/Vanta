import { z } from "zod";
import type { Tool, ToolContext } from "./types.js";
import type { ToolRegistry } from "./registry.js";

// Deferred tool schema discovery.
// Vanta's prompt includes full schemas for all built-in tools.
// When VANTA_MCP_DEFER=1, MCP tool schemas are omitted from the prompt;
// the agent uses `tool_search` to fetch schemas on demand before calling.

const Args = z.object({
  query: z.string().min(1).describe("Search query — tool name substring or keyword"),
  maxResults: z.number().int().min(1).max(20).optional().describe("Max results (default 5)"),
});

/**
 * Build the `tool_search` tool, bound to a live registry reference.
 * The registry is read at call time so new MCP mounts are discoverable.
 */
export function buildToolSearchTool(
  registry: Pick<ToolRegistry, "schemas" | "get">,
): Tool {
  return {
    schema: {
      name: "tool_search",
      description:
        "Search for tools by name or description keyword. Returns matching tool names + full schemas. " +
        "Use before calling an unfamiliar tool to verify its parameter shape. " +
        "When VANTA_MCP_DEFER=1 is set, MCP tool schemas are deferred — call tool_search to fetch them.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (tool name substring or keyword)" },
          maxResults: { type: "number", description: "Max number of results to return (default 5, max 20)" },
        },
        required: ["query"],
      },
    },
    describeForSafety: () => "search tool schemas",
    async execute(raw: unknown, _ctx: ToolContext) {
      const parsed = Args.safeParse(raw);
      if (!parsed.success) return { ok: false, output: "tool_search needs a query string" };
      const { query, maxResults = 5 } = parsed.data;
      const q = query.toLowerCase().trim();
      // Tokenize: a multi-keyword query ("write file create edit shell") matches
      // tools containing ANY term, ranked by how many terms hit (full-phrase
      // match wins). Single-substring matching missed multi-word queries —
      // e.g. it failed to surface write_file, stalling the agent mid-task.
      const terms = q.split(/\s+/).filter(Boolean);
      const matches = registry.schemas()
        .map((s) => {
          const hay = `${s.name} ${s.description ?? ""}`.toLowerCase();
          const score = (hay.includes(q) ? 100 : 0) + terms.filter((t) => hay.includes(t)).length;
          return { s, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.s);
      if (!matches.length) return { ok: true, output: `(no tools matched "${query}")` };
      const shown = matches.slice(0, maxResults);
      const lines = shown.map((s) => `## ${s.name}\n${s.description ?? "(no description)"}\nSchema: ${JSON.stringify(s.parameters, null, 2)}`);
      const footer = matches.length > maxResults ? `\n(showing ${shown.length} of ${matches.length} matches)` : "";
      return { ok: true, output: lines.join("\n\n") + footer };
    },
  };
}

/**
 * Build abbreviated (name + description only) schemas for deferred MCP tools.
 * Used in the system prompt when VANTA_MCP_DEFER=1 — full schemas are fetched via tool_search.
 * Returns true when deferred mode is active.
 */
export function isMcpDeferred(env: NodeJS.ProcessEnv): boolean {
  return env.VANTA_MCP_DEFER === "1";
}
