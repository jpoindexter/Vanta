import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveCodeIntel } from "../code-intel/index.js";

const Args = z.object({ task: z.string().min(1) });

export const codeContextTool: Tool = {
  schema: {
    name: "code_context",
    description:
      "Build focused code context for a task from the code-intelligence index (relevant symbols, call edges, files). Use before editing unfamiliar code to avoid acting blind.",
    parameters: {
      type: "object",
      properties: { task: { type: "string", description: "What you are about to work on." } },
      required: ["task"],
    },
  },
  describeForSafety: () => "read code intelligence context",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "code_context needs a non-empty task string" };
    const r = await resolveCodeIntel(ctx.root).context(parsed.data.task);
    return r.ok ? { ok: true, output: r.value } : { ok: false, output: r.error };
  },
};
