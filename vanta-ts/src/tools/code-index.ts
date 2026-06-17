import { z } from "zod";
import type { Tool } from "./types.js";
import type { CodeIntelProvider } from "../code-intel/index.js";
import { withCodeIntel } from "./code-intel-run.js";

const Args = z.object({
  action: z.enum(["status", "index", "sync"]).optional(),
  force: z.boolean().optional(),
});

/** Dispatch the chosen action to the provider. */
function runAction(
  p: CodeIntelProvider,
  action: "status" | "index" | "sync",
  root: string,
  force: boolean,
): Promise<string> {
  if (action === "index") return p.index({ root, force });
  if (action === "sync") return p.sync({ root });
  return p.status({ root });
}

export const codeIndexTool: Tool = {
  schema: {
    name: "code_index",
    description:
      "Manage the code-intelligence index for the current project: 'status' (default) shows index stats, 'index' builds/refreshes it, 'sync' applies incremental changes. Run 'index' once before using code_context/code_search on an unindexed repo.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "status | index | sync (default status)", enum: ["status", "index", "sync"] },
        force: { type: "boolean", description: "For action=index: force a full re-index" },
      },
      required: [],
    },
  },
  describeForSafety: (a) => `code intelligence index: ${String(a.action ?? "status")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `code_index: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
    }
    const action = parsed.data.action ?? "status";
    const force = parsed.data.force ?? false;
    return withCodeIntel("code_index", (p) => runAction(p, action, ctx.root, force));
  },
};
