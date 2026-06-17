import { z } from "zod";
import type { Tool } from "./types.js";
import { withCodeIntel } from "./code-intel-run.js";

const KINDS = [
  "function",
  "method",
  "class",
  "interface",
  "type",
  "variable",
  "route",
  "component",
] as const;

const Args = z.object({
  query: z.string().min(1),
  kind: z.enum(KINDS).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const codeSearchTool: Tool = {
  schema: {
    name: "code_search",
    description:
      "Locate symbols (functions, classes, types…) by name across the codebase via its knowledge graph — faster and more precise than grep for 'where is X defined'. Read-only.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Symbol name or partial name (e.g. 'resolveProvider')" },
        kind: { type: "string", description: `Filter by kind: ${KINDS.join(", ")}`, enum: [...KINDS] },
        limit: { type: "integer", description: "Maximum results (1-100). Defaults to 10.", minimum: 1, maximum: 100 },
      },
      required: ["query"],
    },
  },
  describeForSafety: (a) => `search code symbols: ${String(a.query ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `code_search: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
    }
    const { query, kind, limit } = parsed.data;
    return withCodeIntel("code_search", (p) => p.search(query, { root: ctx.root, kind, limit }));
  },
};
