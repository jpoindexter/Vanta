import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { RoadmapSchema } from "../roadmap/schema.js";
import { formatRoadmapOpenWork, formatRoadmapStatus } from "../roadmap/status-summary.js";
import type { Tool } from "./types.js";

const Args = z.object({
  view: z.enum(["summary", "open", "actionable"]).default("summary"),
});

export const roadmapStatusTool: Tool = {
  schema: {
    name: "roadmap_status",
    description:
      "Read the authoritative project roadmap and its open work. Use this for EVERY roadmap, backlog, " +
      "or what-is-left question. Do not use inspect_state for roadmap questions: it reports only session goals. " +
      "This is read-only and does not open the roadmap board.",
    parameters: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["summary", "open", "actionable"],
          description: "summary = counts plus actionable work; open = every open card; actionable = only unblocked work.",
        },
      },
    },
  },
  describeForSafety: () => "read roadmap status",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: `Invalid args: ${parsed.error.message}` };
    try {
      const data = RoadmapSchema.parse(JSON.parse(await readFile(join(ctx.root, "roadmap.json"), "utf8")));
      if (parsed.data.view === "open") return { ok: true, output: formatRoadmapOpenWork(data.items) };
      if (parsed.data.view === "actionable") return { ok: true, output: formatRoadmapOpenWork(data.items, { actionableOnly: true }) };
      return {
        ok: true,
        output: `${formatRoadmapStatus(data.items)}\n\n${formatRoadmapOpenWork(data.items, { actionableOnly: true })}`,
      };
    } catch (err) {
      return { ok: false, output: `Roadmap unavailable: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};
