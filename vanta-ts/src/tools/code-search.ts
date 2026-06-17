import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveCodeIntel } from "../code-intel/index.js";

const Args = z.object({ symbol: z.string().min(1) });

export const codeSearchTool: Tool = {
  schema: {
    name: "code_search",
    description:
      "Find a symbol (function/class/type/variable) by name in the code-intelligence index — kind, location, and signature in one lookup. Faster and more precise than grep for symbols.",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string", description: "Symbol name or query." } },
      required: ["symbol"],
    },
  },
  describeForSafety: () => "search code intelligence index",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "code_search needs a non-empty symbol string" };
    const r = await resolveCodeIntel(ctx.root).search(parsed.data.symbol);
    return r.ok ? { ok: true, output: r.value } : { ok: false, output: r.error };
  },
};
