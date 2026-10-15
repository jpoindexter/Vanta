import { glob } from "node:fs/promises";
import { z } from "zod";
import type { Tool } from "./types.js";
import { expandHome } from "./writable-zones.js";
import { resolveInScope } from "../scope.js";

const Args = z.object({
  pattern: z.string().min(1),
  base_path: z.string().optional(),
});

export const globFilesTool: Tool = {
  schema: {
    name: "glob_files",
    description:
      "Find files matching a glob pattern (e.g. 'src/**/*.ts', '**/*.{json,yaml}'). " +
      "Returns matching paths sorted alphabetically. Read-only and project-scoped: " +
      "do not pass a base_path outside the active project. For an operator-named external path, use a foreground shell_cmd instead.",
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
    const scoped = resolveInScope(base_path ? expandHome(base_path) : ctx.root, ctx.root);
    if (!scoped.ok) {
      return {
        ok: false,
        output: `glob_files: base_path is outside project scope: ${scoped.path}\nRecovery: do not retry glob_files for this path. If the operator explicitly named it, inspect it with a foreground shell_cmd using the exact absolute path.`,
      };
    }
    const base = scoped.path;

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
