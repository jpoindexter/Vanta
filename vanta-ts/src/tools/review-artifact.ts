import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { resolveWritablePathAsk } from "./writable-zones.js";
import { diffArtifact, type ArtifactDiff } from "../ui/artifact-diff.js";

// REVIEW-ARTIFACT — present a generated file artifact for human review with an
// old-vs-new diff, then write it ONLY on approval. The diff is computed against
// the existing file (or "" when absent); the approve/reject decision routes
// through `ctx.requestApproval` so the human (or the host's approval UI) sees
// the diff summary before anything lands. Kernel-gated via `describeForSafety`
// (it surfaces only the path, never the content). FS is injected for testing.

const Args = z.object({ path: z.string().min(1), content: z.string() });

/** Injected filesystem seam — real `node:fs/promises` in prod, fakes in tests. */
export type ArtifactFs = {
  readFile: (abs: string) => Promise<string>;
  writeFile: (abs: string, content: string) => Promise<void>;
};

const realFs: ArtifactFs = {
  readFile: (abs) => readFile(abs, "utf8"),
  writeFile: async (abs, content) => {
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  },
};

/** Read existing content; a missing/unreadable file diffs against "" (new). Pure-ish. */
async function readExisting(fs: ArtifactFs, abs: string): Promise<string> {
  try {
    return await fs.readFile(abs);
  } catch {
    return "";
  }
}

/** One-line review summary: "+A -B in <path> (new file|edit)". Pure. */
function summarize(path: string, diff: ArtifactDiff): string {
  const kind = diff.isNew ? "new file" : "edit";
  return `+${diff.added} -${diff.removed} in ${path} (${kind})`;
}

/** Build the approve/reject decision against the computed diff. The injected
 *  `requestApproval` is the seam the human (or host UI) answers through. */
async function decide(
  ask: (action: string, reason: string, toolName?: string) => Promise<boolean>,
  path: string,
  diff: ArtifactDiff,
): Promise<boolean> {
  return ask(
    `Review and write artifact ${path}`,
    `${summarize(path, diff)} — approve to write the proposed file`,
    "review_artifact",
  );
}

async function runReview(o: { fs: ArtifactFs; abs: string; path: string; content: string; ask: ArtifactCtx["requestApproval"] }): Promise<ToolResult> {
  const oldContent = await readExisting(o.fs, o.abs);
  const diff = diffArtifact(oldContent, o.content);
  if (diff.unchanged) {
    return { ok: true, output: `${o.path} already matches the proposed artifact — nothing to write` };
  }
  const approved = await decide(o.ask, o.path, diff);
  if (!approved) {
    return { ok: false, output: `review of ${o.path} rejected — file left unchanged`, diff: toDiffLines(diff) };
  }
  try {
    await o.fs.writeFile(o.abs, o.content);
  } catch (err) {
    return { ok: false, output: `could not write ${o.path}: ${(err as Error).message.split("\n")[0]}` };
  }
  return { ok: true, output: `approved — wrote ${summarize(o.path, diff)}`, diff: toDiffLines(diff) };
}

/** Adapt the artifact diff to the transcript's `DiffLine[]` so the host renders it. */
function toDiffLines(diff: ArtifactDiff): ToolResult["diff"] {
  return diff.lines.map((l) =>
    l.kind === "added"
      ? ({ type: "add", text: l.text } as const)
      : l.kind === "removed"
        ? ({ type: "remove", text: l.text } as const)
        : ({ type: "context", text: l.text } as const),
  );
}

type ArtifactCtx = Parameters<Tool["execute"]>[1];

/** Build the tool over an injected fs (prod passes the real one). */
export function buildReviewArtifactTool(fs: ArtifactFs = realFs): Tool {
  return {
    schema: {
      name: "review_artifact",
      description:
        "Present a generated file artifact (its full proposed content) for human " +
        "review before writing. Computes an old-vs-new diff against the existing " +
        "file (or treats it as a new file), surfaces the change for approval, and " +
        "writes the file ONLY if the user approves — a rejection leaves it unchanged.",
      parameters: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string", description: "Path (relative to the project root, or a writable-zone path) to review and write." },
          content: { type: "string", description: "Full proposed file contents to review." },
        },
      },
    },
    describeForSafety: (a) => `review artifact ${String(a.path ?? "")}`,
    async execute(raw, ctx) {
      const parsed = Args.safeParse(raw);
      if (!parsed.success) return { ok: false, output: 'review_artifact needs "path" and "content"' };
      const { path, content } = parsed.data;
      const r = await resolveWritablePathAsk(path, ctx.root, process.env, ctx.requestApproval);
      if (!r.ok) return { ok: false, output: r.error };
      return runReview({ fs, abs: r.abs, path, content, ask: ctx.requestApproval });
    },
  };
}

export const reviewArtifactTool: Tool = buildReviewArtifactTool();
