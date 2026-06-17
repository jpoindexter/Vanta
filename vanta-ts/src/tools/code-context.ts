import { z } from "zod";
import type { Tool } from "./types.js";
import { withCodeIntel } from "./code-intel-run.js";

const Args = z.object({
  task: z.string().min(1),
  max_nodes: z.number().int().min(1).max(100).optional(),
});

export const codeContextTool: Tool = {
  schema: {
    name: "code_context",
    description:
      "Build a focused code map (markdown) for a task or bug: entry points, related symbols, and key source — from the codebase's knowledge graph. Use BEFORE editing unfamiliar code so you act with structure, not blind. Read-only.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The task, bug, or feature to build code context for",
        },
        max_nodes: {
          type: "integer",
          description: "Maximum symbols to include (1-100). Defaults to the engine's default.",
          minimum: 1,
          maximum: 100,
        },
      },
      required: ["task"],
    },
  },
  describeForSafety: (a) => `read code context: ${String(a.task ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `code_context: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
    }
    const { task, max_nodes: maxNodes } = parsed.data;
    return withCodeIntel("code_context", (p) =>
      p.context(task, { root: ctx.root, maxNodes }),
    );
  },
};
