import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveInScope } from "../scope.js";

const Args = z.object({ path: z.string().min(1) });

export const readFileTool: Tool = {
  schema: {
    name: "read_file",
    description:
      "Read a UTF-8 text file inside the project scope. Returns the file contents.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to the project root",
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
    const { ok, path: abs } = resolveInScope(parsed.data.path, ctx.root);
    if (!ok) {
      return {
        ok: false,
        output: `refused: path is outside project scope: ${parsed.data.path}`,
      };
    }
    try {
      const content = await readFile(abs, "utf8");
      return { ok: true, output: content };
    } catch (err) {
      return {
        ok: false,
        output: `could not read ${parsed.data.path}: ${(err as Error).message}`,
      };
    }
  },
};
