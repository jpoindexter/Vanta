import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveWritablePath } from "./writable-zones.js";
import { computeDiff } from "../util/diff.js";

const Args = z.object({
  path: z.string().min(1),
  old_string: z.string().min(1),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
});

export const editFileTool: Tool = {
  schema: {
    name: "edit_file",
    description:
      "Targeted string replacement in a file — replace old_string with new_string. " +
      "Fails if old_string is not found or appears more than once (unless replace_all is true). " +
      "Safer than write_file for precise edits to large files; does not require a full rewrite.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to project root, or absolute / ~-prefixed",
        },
        old_string: {
          type: "string",
          description: "Exact string to find and replace (must be unique unless replace_all is true)",
        },
        new_string: {
          type: "string",
          description: "Replacement string",
        },
        replace_all: {
          type: "boolean",
          description: "Replace every occurrence instead of failing on duplicates (default: false)",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  describeForSafety: (a) => `edit file ${String(a.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `edit_file: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
    }
    const { old_string, new_string, replace_all = false } = parsed.data;
    const path = parsed.data.path;
    const r = resolveWritablePath(path, ctx.root, process.env);
    if (!r.ok) return { ok: false, output: r.error };
    const abs = r.abs;

    let content: string;
    try {
      content = await readFile(abs, "utf8");
    } catch (err) {
      return { ok: false, output: `could not read ${path}: ${(err as Error).message}` };
    }

    if (!content.includes(old_string)) {
      return { ok: false, output: `old_string not found in ${path}` };
    }

    if (!replace_all) {
      const first = content.indexOf(old_string);
      if (content.indexOf(old_string, first + 1) !== -1) {
        return {
          ok: false,
          output:
            `old_string appears more than once in ${path} — add more surrounding context to make it unique, or set replace_all`,
        };
      }
    }

    const approved = await ctx.requestApproval(
      `Edit file ${path}`,
      "modifying existing file content",
      "edit_file",
    );
    if (!approved) return { ok: false, output: `edit to ${path} denied — file left unchanged` };

    const updated = replace_all
      ? content.split(old_string).join(new_string)
      : content.replace(old_string, new_string);

    const diff = computeDiff(content, updated);
    try {
      await writeFile(abs, updated, "utf8");
      const occurrences = replace_all
        ? content.split(old_string).length - 1
        : 1;
      return {
        ok: true,
        output: `edited ${path} — replaced ${occurrences} occurrence${occurrences === 1 ? "" : "s"}`,
        diff: diff.length ? diff : undefined,
      };
    } catch (err) {
      return { ok: false, output: `could not write ${path}: ${(err as Error).message}` };
    }
  },
};
