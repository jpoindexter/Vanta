import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveInScope } from "../scope.js";
import { expandHome, resolveWritableZones, isInZone } from "./writable-zones.js";
import { computeDiff } from "../util/diff.js";

const Args = z.object({ path: z.string().min(1), content: z.string() });

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export const writeFileTool: Tool = {
  schema: {
    name: "write_file",
    description:
      "Write a UTF-8 text file. Inside the project: new files write directly. Outside the project: " +
      "allowed only in a writable zone (~/Desktop, ~/Downloads, or ARGO_WRITABLE_DIRS) and always " +
      "approval-gated. Overwriting an existing file requires approval. To put a file on the user's " +
      "Desktop, write directly to ~/Desktop/<name> — don't write in the repo and copy.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path relative to the project root, or an absolute / ~-prefixed path inside a writable zone (e.g. ~/Desktop/notes.md)",
        },
        content: { type: "string", description: "Full file contents to write" },
      },
      required: ["path", "content"],
    },
  },
  describeForSafety: (a) => `write file ${String(a.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'write_file needs "path" and "content"' };
    }
    const { content } = parsed.data;
    const path = expandHome(parsed.data.path);
    const { ok, path: abs } = resolveInScope(path, ctx.root);
    // Outside the project root: permitted only inside a configured writable zone.
    // The kernel has already returned Ask for any out-of-root path (so dispatch
    // prompted the human); the zone allowlist bounds where that approved write can land.
    if (!ok && !isInZone(abs, resolveWritableZones(process.env))) {
      return {
        ok: false,
        output: `refused: ${path} is outside the project and not in a writable zone (~/Desktop, ~/Downloads, or set ARGO_WRITABLE_DIRS)`,
      };
    }

    const isExisting = await exists(abs);
    let oldContent = "";
    if (isExisting) {
      try { oldContent = await readFile(abs, "utf8"); } catch { /* leave as "" on read error */ }
      const approved = await ctx.requestApproval(
        `Overwrite existing file ${path}`,
        "file already exists — overwriting is destructive",
      );
      if (!approved) {
        return { ok: false, output: `write to ${path} denied — file left unchanged` };
      }
    }

    try {
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
      const bytes = Buffer.byteLength(content);
      const kind = isExisting ? "overwritten" : "new file";
      const diff = computeDiff(oldContent, content);
      return { ok: true, output: `wrote ${bytes} bytes to ${path} (${kind})`, diff: diff.length ? diff : undefined };
    } catch (err) {
      return {
        ok: false,
        output: `could not write ${path}: ${(err as Error).message}`,
      };
    }
  },
};
