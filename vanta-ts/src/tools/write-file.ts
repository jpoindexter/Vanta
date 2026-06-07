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

// CODE-SIZE-GATE in the agent loop: a TS/TSX write that breaks the size limits
// surfaces the violations in the tool result (file:line + limit + fix) so the
// agent writes born-small or self-corrects next turn. Advisory — never blocks
// the write. Tests + .d.ts are exempt (same rule as `vanta lint`).
async function sizeNoteFor(displayPath: string, abs: string, content: string): Promise<string> {
  if (!/\.tsx?$/.test(abs) || /\.(d|test)\.tsx?$/.test(abs)) return "";
  try {
    const { analyzeSource, formatViolation } = await import("../lint/size.js");
    const violations = analyzeSource(displayPath, content);
    if (!violations.length) return "";
    return `\n⚠ size gate: ${violations.length} violation(s) — keep it born-small:\n${violations.map(formatViolation).join("\n")}`;
  } catch {
    return "";
  }
}

export const writeFileTool: Tool = {
  schema: {
    name: "write_file",
    description:
      "Write a UTF-8 text file. Inside the project: new files write directly. Outside the project: " +
      "allowed only in a writable zone (~/Desktop, ~/Downloads, or VANTA_WRITABLE_DIRS) and always " +
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
        output: `refused: ${path} is outside the project and not in a writable zone (~/Desktop, ~/Downloads, or set VANTA_WRITABLE_DIRS)`,
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
      // ACTION-PROOF: re-read the file and confirm the write actually landed —
      // post-action proof, not an assumed success. The diff is the "before".
      let proof: string;
      try {
        const after = await readFile(abs, "utf8");
        proof =
          after === content
            ? ` · verified ${after.split("\n").length} lines, ${Buffer.byteLength(after)} bytes on disk`
            : ` · ⚠ on-disk content differs from what was written`;
      } catch (e) {
        proof = ` · ⚠ could not re-read to verify: ${(e as Error).message.split("\n")[0]}`;
      }
      const sizeNote = await sizeNoteFor(path, abs, content);
      return { ok: true, output: `wrote ${bytes} bytes to ${path} (${kind})${proof}${sizeNote}`, diff: diff.length ? diff : undefined };
    } catch (err) {
      return {
        ok: false,
        output: `could not write ${path}: ${(err as Error).message}`,
      };
    }
  },
};
