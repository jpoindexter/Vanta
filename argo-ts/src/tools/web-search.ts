import { z } from "zod";
import type { Tool } from "./types.js";
import type { SearchResult } from "../search/interface.js";
import { resolveSearchProvider } from "../search/index.js";

const Args = z.object({
  query: z.string().min(1),
  max_results: z.number().int().min(1).max(10).optional(),
});

/** Render one result block: numbered title, then indented url and snippet. */
function formatResult(r: SearchResult, i: number): string {
  return `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`;
}

export const webSearchTool: Tool = {
  schema: {
    name: "web_search",
    description:
      "Search the web and return a numbered list of result titles, URLs, and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        max_results: {
          type: "integer",
          description: "Maximum results to return (1-10). Defaults to 5.",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["query"],
    },
  },
  describeForSafety: (a) => `web search: ${String(a.query ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'web_search needs a "query" string' };
    }
    const { query, max_results: maxResults } = parsed.data;
    try {
      const provider = resolveSearchProvider(process.env);
      const results = await provider.search(query, { maxResults });
      if (results.length === 0) {
        return { ok: true, output: "(no results)" };
      }
      return { ok: true, output: results.map(formatResult).join("\n") };
    } catch (err) {
      return {
        ok: false,
        output: `web search failed: ${(err as Error).message}`,
      };
    }
  },
};
