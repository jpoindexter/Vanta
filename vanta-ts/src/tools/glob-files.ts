import { glob } from "node:fs/promises";
import { z } from "zod";
import type { Tool } from "./types.js";
import { expandHome } from "./writable-zones.js";

const Args = z.object({
  pattern: z.string().min(1),
  base_path: z.string().optional(),
});

export const globFilesTool: Tool = {
  schema: {
    name: "glob_files",
    description:
      "Find files matching a glob pattern (e.g. 'src/**/*.ts', '**/*.{json,yaml}'). " +
      "Returns matching paths sorted alphabetically. Read-only.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern, e.g. 'src/**/*.ts' or '**/*.{json,yaml}'",
        },
        base_path: {
          type: "string",
          description: "Base directory to search from (default: project root)",
        },
      },
      required: ["pattern"],
    },
  },
  describeForSafety: (a) => `glob "${String(a.pattern ?? "")}"`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `glob_files: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
    }
    const { pattern, base_path } = parsed.data;
    const base = base_path ? expandHome(base_path) : ctx.root;

    try {
      const matches: string[] = [];
      for await (const entry of glob(pattern, { cwd: base })) {
        matches.push(entry);
      }
      matches.sort();
      return { ok: true, output: matches.length ? matches.join("\n") : "(no matches)" };
    } catch (err) {
      return { ok: false, output: `glob_files: ${(err as Error).message}` };
    }
  },
};
