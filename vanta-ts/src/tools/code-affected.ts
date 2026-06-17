import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveCodeIntel } from "../code-intel/index.js";

const Args = z.object({ files: z.array(z.string().min(1)).min(1) });

export const codeAffectedTool: Tool = {
  schema: {
    name: "code_affected",
    description:
      "Find the files and tests affected by changes to the given source files (blast radius) via the code-intelligence index. Use to know what to re-check before/after an edit.",
    parameters: {
      type: "object",
      properties: {
        files: { type: "array", items: { type: "string" }, description: "Changed source file paths." },
      },
      required: ["files"],
    },
  },
  describeForSafety: () => "read code intelligence blast radius",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "code_affected needs a non-empty files array" };
    const r = await resolveCodeIntel(ctx.root).affected(parsed.data.files);
    return r.ok ? { ok: true, output: r.value } : { ok: false, output: r.error };
  },
};
