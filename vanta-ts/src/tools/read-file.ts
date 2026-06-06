import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveInScope } from "../scope.js";
import { expandHome, resolveReadableZones, isInZone } from "./writable-zones.js";

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
    const path = expandHome(parsed.data.path);
    const { ok, path: abs } = resolveInScope(path, ctx.root);
    // Outside the project root: permitted only inside a configured readable zone.
    if (!ok && !isInZone(abs, resolveReadableZones(process.env, ctx.root))) {
      return {
        ok: false,
        output: `refused: ${path} is outside the project and not in a readable zone (set VANTA_READABLE_DIRS to allow more)`,
      };
    }
    try {
      const content = await readFile(abs, "utf8");
      return { ok: true, output: content };
    } catch (err) {
      return {
        ok: false,
        output: `could not read ${path}: ${(err as Error).message}`,
      };
    }
  },
};
