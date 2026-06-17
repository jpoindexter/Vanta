import { z } from "zod";
import type { Tool } from "./types.js";
import { withCodeIntel } from "./code-intel-run.js";

const Args = z.object({
  files: z.array(z.string().min(1)).min(1),
});

export const codeAffectedTool: Tool = {
  schema: {
    name: "code_affected",
    description:
      "Given changed source files, return the test files and symbols affected (blast radius) via the dependency graph. Use after edits to scope which tests to run instead of the whole suite. Read-only.",
    parameters: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: { type: "string" },
          description: "Changed source file paths (relative to project root)",
        },
      },
      required: ["files"],
    },
  },
  describeForSafety: (a) => `find tests affected by ${Array.isArray(a.files) ? a.files.length : 0} changed file(s)`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `code_affected: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
    }
    return withCodeIntel("code_affected", (p) => p.affected(parsed.data.files, { root: ctx.root }));
  },
};
