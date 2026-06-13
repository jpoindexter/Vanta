import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { gatherLifeBlobs, searchBlobs } from "../search/life.js";

const Args = z.object({ q: z.string() });

export const lifeSearchTool: Tool = {
  schema: {
    name: "life_search",
    description:
      "Search Vanta's own local stores (world/money/radar/team JSONL + ERRORS.md) " +
      "for a keyword and return source-cited snippets. Local only — no external or web access.",
    parameters: {
      type: "object",
      properties: {
        q: { type: "string", description: "keyword or phrase to search (case-insensitive)" },
      },
      required: ["q"],
    },
  },
  describeForSafety: (a) => `life_search ${String(a.q ?? "")}`,
  async execute(raw): Promise<ToolResult> {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: "life_search needs q: string" };
    const { q } = p.data;
    const blobs = await gatherLifeBlobs(process.env, process.cwd());
    const hits = searchBlobs(blobs, q);
    if (!hits.length) return { ok: true, output: `no local hits for "${q}"` };
    const lines = hits.map((h) => `${h.source}: ${h.snippet}`).join("\n");
    return { ok: true, output: lines };
  },
};
