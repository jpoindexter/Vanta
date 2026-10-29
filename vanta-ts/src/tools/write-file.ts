import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { resolveWritablePathAsk } from "./writable-zones.js";
import { isShellStartupFile, shellStartupWarning } from "./shell-startup-guard.js";
import { isGitHooksPath, gitHooksWarning } from "./git-hooks-guard.js";
import { beginDiagnosticDelta } from "../lsp/diagnostic-note.js";
import { computeDiff } from "../util/diff.js";
import { globalFileCheckpointStore } from "../sessions/file-checkpoint.js";
import { projectControlPlaneConfirmation } from "./project-security-path.js";
import { assertWriteParent, captureWriteTarget, commitFileWrite, type FileWriteTarget } from "./file-write-target.js";
import { ordinaryOverwriteConfirmation, requestOrdinaryOverwrite } from "./write-file-overwrite.js";

const Args = z.object({ path: z.string().min(1), content: z.string() });

/**
 * Extra confirm for a dangerous in-zone path class (shell startup / git hooks) —
 * both run code automatically (new shell / git op). Checks the requested path and
 * the resolved abs so ~/relative forms match. Returns a denial result to abort, or
 * null to proceed. Defense-in-depth: never weakens the kernel/overwrite gates.
 */
async function confirmDangerousPath(
  path: string,
  abs: string,
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const guards: { hit: boolean; warning: string; reason: string; noun: string }[] = [
    { hit: isShellStartupFile(path) || isShellStartupFile(abs), warning: shellStartupWarning(path), reason: "shell startup file — code runs on every new shell (persistence vector)", noun: "shell startup file" },
    { hit: isGitHooksPath(path) || isGitHooksPath(abs), warning: gitHooksWarning(path), reason: "git-hooks file — script runs automatically on git operations (code-execution-on-commit vector)", noun: "git-hooks file" },
  ];
  for (const g of guards) {
    if (!g.hit) continue;
    if (!(await ctx.requestApproval(g.warning, g.reason, "write_file"))) {
      return { ok: false, output: `write to ${path} denied — ${g.noun} left unchanged`, effectDisposition: "denied" };
    }
  }
  return null;
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

/** ACTION-PROOF: re-read the file and confirm the write landed. */
function verifyWrite(
  abs: string,
  content: string,
  verified: boolean,
): { note: string; status: "unverified" | "verified"; evidence: string } {
  return verified
    ? {
        note: ` · verified ${content.split("\n").length} lines, ${Buffer.byteLength(content)} bytes on disk`,
        status: "verified",
        evidence: `readback matched ${Buffer.byteLength(content)} bytes at ${abs}`,
      }
    : {
        note: " · ⚠ on-disk content differs from what was written",
        status: "unverified",
        evidence: `readback mismatch at ${abs}`,
      };
}

/** Write the file then report: byte count + ACTION-PROOF re-read + CODE-SIZE-GATE note. */
async function writeAndReport(o: { abs: string; displayPath: string; content: string; target: FileWriteTarget }): Promise<ToolResult> {
  try {
    const isExisting = o.target.previous !== null;
    const oldContent = o.target.previous?.toString("utf8") ?? "";
    const finishDiag = await beginDiagnosticDelta(o.abs, isExisting); // diagnostic baseline (opt-in)
    assertWriteParent(o.target);
    await mkdir(dirname(o.abs), { recursive: true });
    const verified = commitFileWrite(o.target, o.content, () => globalFileCheckpointStore.save({
      path: o.displayPath,
      absPath: o.abs,
      content: isExisting ? oldContent : null,
    }));
    const kind = isExisting ? "overwritten" : "new file";
    const diff = computeDiff(oldContent, o.content);
    const proof = verifyWrite(o.abs, o.content, verified);
    const sizeNote = await sizeNoteFor(o.displayPath, o.abs, o.content);
    const diagNote = await finishDiag();
    return {
      ok: true,
      output: `wrote ${Buffer.byteLength(o.content)} bytes to ${o.displayPath} (${kind})${proof.note}${sizeNote}${diagNote}`,
      diff: diff.length ? diff : undefined,
      effectDisposition: "confirmed",
      verification: { status: proof.status, evidence: proof.evidence },
    };
  } catch (err) {
    return { ok: false, output: `could not write ${o.displayPath}: ${(err as Error).message}` };
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
  // EXT-ACP-EDIT-DIFF — old/new preview attached to the approval ask.
  describeDiff: async (a, root) => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const { buildLineDiff } = await import("../acp/edit-policy.js");
    const path = String(a.path ?? "");
    if (!path || typeof a.content !== "string") return undefined;
    const old = await readFile(resolve(root, path), "utf8").catch(() => "");
    return buildLineDiff(old, a.content);
  },
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'write_file needs "path" and "content"' };
    }
    const { content } = parsed.data;
    const path = parsed.data.path;
    const r = await resolveWritablePathAsk(path, ctx.root, process.env, ctx.requestApproval);
    if (!r.ok) return { ok: false, output: r.error };
    const abs = r.abs;
    let target: FileWriteTarget;
    try { target = captureWriteTarget(abs, ctx.delegatedWritePath); }
    catch (error) { return { ok: false, output: `could not prepare ${path}: ${(error as Error).message}`, effectDisposition: "denied" }; }

    const controlPlane = projectControlPlaneConfirmation({ abs, root: ctx.root, displayPath: path, content });
    if (controlPlane && !(await ctx.requestApproval(
      controlPlane.action,
      controlPlane.reason,
      "write_file",
      controlPlane.detail,
    ))) {
      return { ok: false, output: `write to ${path} denied — project control-plane state left unchanged`, effectDisposition: "denied" };
    }

    const overwrite = ordinaryOverwriteConfirmation({ path, root: ctx.root, target, content, controlPlane: Boolean(controlPlane) });
    if (overwrite?.ok === false) return { ok: false, output: overwrite.error, effectDisposition: "denied" };

    const dangerous = await confirmDangerousPath(path, abs, ctx);
    if (dangerous) return dangerous;

    const denied = await requestOrdinaryOverwrite(overwrite, ctx, path);
    if (denied) return denied;

    return writeAndReport({ abs, displayPath: path, content, target });
  },
};
