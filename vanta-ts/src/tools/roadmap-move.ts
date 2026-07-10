import { z } from "zod";
import { STATUS } from "../roadmap/schema.js";
import type { Tool } from "./types.js";

const Args = z.object({
  id: z.string().min(1),
  status: z.enum(STATUS),
});

export const roadmapMoveTool: Tool = {
  schema: {
    name: "roadmap_move",
    description:
      "Move a roadmap item to a new status. Updates roadmap.json and regenerates roadmap.html. " +
      `Valid statuses: ${STATUS.join(", ")}.`,
    parameters: {
      type: "object",
      required: ["id", "status"],
      properties: {
        id: {
          type: "string",
          description: "The roadmap item ID (e.g. 'ND2', 'KANBAN').",
        },
        status: {
          type: "string",
          enum: [...STATUS],
          description: "The target status.",
        },
      },
    },
  },
  describeForSafety: (args) =>
    `move roadmap item ${String(args.id ?? "")} to ${String(args.status ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `Invalid args: ${parsed.error.message}` };
    }
    const { id, status } = parsed.data;
    if (status === "building") {
      const ok = await ctx.requestApproval(
        `move roadmap item ${id} to building (Now)`,
        "Now is operator-gated — only Jason decides what's actively in flight.",
        "roadmap_move",
      );
      if (!ok) return { ok: false, output: "Move to Now blocked — operator approval required." };
    }
    try {
      const { moveRoadmapItem } = await import("../roadmap/move.js");
      const item = await moveRoadmapItem(ctx.root, id, status);
      return { ok: true, output: `Moved ${item.id} → ${status}: ${item.title}` };
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : String(err) };
    }
  },
};
