import { z } from "zod";
import type { Tool } from "./types.js";

const Args = z.object({ what: z.enum(["goals", "approvals"]).optional() });

export const inspectStateTool: Tool = {
  schema: {
    name: "inspect_state",
    description:
      "Inspect Argo operating state: active goals or the approval queue. Use this to know what you are working toward.",
    parameters: {
      type: "object",
      properties: {
        what: {
          type: "string",
          enum: ["goals", "approvals"],
          description: "Which state to inspect (default: goals)",
        },
      },
    },
  },
  describeForSafety: () => "inspect operating state",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    const what = parsed.success ? (parsed.data.what ?? "goals") : "goals";
    if (what === "approvals") {
      const approvals = await ctx.safety.getApprovals();
      return { ok: true, output: JSON.stringify(approvals, null, 2) };
    }
    const goals = await ctx.safety.getGoals();
    return { ok: true, output: JSON.stringify(goals, null, 2) };
  },
};
