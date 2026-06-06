import { z } from "zod";
import type { Tool } from "./types.js";
import { graphQuery } from "../graph/store.js";

const ArgsSchema = z.object({
  query: z.string().min(1),
  type: z.enum(["person","project","tool","decision","goal","concept","file"]).optional(),
  maxResults: z.number().int().min(1).max(20).optional(),
});

export const graphQueryTool: Tool = {
  schema: {
    name: "graph_query",
    description: "Query the knowledge graph for entities and their relationships. Returns matching entities with their direct connections (worked-on, decided, depends-on, related-to, etc.).",
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Entity name substring to search" },
        type: { type: "string", description: "Filter by entity type (person/project/tool/decision/goal/concept/file)" },
        maxResults: { type: "number", description: "Maximum results (default 10)" },
      },
    },
  },
  describeForSafety: (args) => `query knowledge graph: ${JSON.stringify(args).slice(0, 80)}`,
  async execute(args) {
    const parsed = ArgsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, output: `Invalid args: ${parsed.error.message}` };
    const results = await graphQuery(parsed.data.query, {
      type: parsed.data.type,
      maxResults: parsed.data.maxResults,
    });
    if (!results.length) return { ok: true, output: `No entities found matching "${parsed.data.query}"` };
    const lines = results.map((r) => {
      const rels = r.relations.map((rel) => `  → ${rel.rel} ${rel.target.name} (${rel.target.type}, str:${rel.strength.toFixed(2)})`).join("\n");
      return `**${r.entity.name}** [${r.entity.type}]\n${rels || "  (no relations)"}`;
    });
    return { ok: true, output: lines.join("\n\n") };
  },
};
