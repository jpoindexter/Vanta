import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveCodeIntel } from "../code-intel/index.js";

const Args = z.object({}).passthrough();

export const codeIndexTool: Tool = {
  schema: {
    name: "code_index",
    description:
      "Build or refresh the code-intelligence index for the operating root so code_context/code_search/code_affected have current data. Run once before using them on a new repo.",
    parameters: { type: "object", properties: {} },
  },
  describeForSafety: () => "build code intelligence index",
  async execute(raw, ctx) {
    Args.safeParse(raw); // no required args; tolerate extras
    const r = await resolveCodeIntel(ctx.root).ensureIndexed();
    return r.ok ? { ok: true, output: r.value } : { ok: false, output: r.error };
  },
};
