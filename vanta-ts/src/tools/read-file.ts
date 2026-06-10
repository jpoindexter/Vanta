import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveReadablePath } from "./writable-zones.js";

const Args = z.object({ path: z.string().min(1) });

export const readFileTool: Tool = {
  schema: {
    name: "read_file",
    description:
      "Read a UTF-8 text file. Reads inside the project freely; outside the project, reads are " +
      "allowed in a readable zone — by default the project's parent dir (so sibling repos in the " +
      "same workspace are readable) plus ~/Desktop and ~/Downloads. Override with VANTA_READABLE_DIRS. " +
      "Use an absolute or ~-prefixed path for files outside the repo.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path relative to the project root, or an absolute / ~-prefixed path inside a readable zone",
        },
      },
      required: ["path"],
    },
  },
  describeForSafety: (a) => `read file ${String(a.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'read_file needs a "path" string' };
    }
    const r = resolveReadablePath(parsed.data.path, ctx.root, process.env);
    if (!r.ok) return { ok: false, output: r.error };
    try {
      const content = await readFile(r.abs, "utf8");
      return { ok: true, output: content };
    } catch (err) {
      return {
        ok: false,
        output: `could not read ${parsed.data.path}: ${(err as Error).message}`,
      };
    }
  },
};
