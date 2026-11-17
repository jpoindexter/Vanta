import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, parse, resolve, sep } from "node:path";
import { buildLineDiff } from "../acp/edit-policy.js";
import type { ApprovalDetail } from "../permissions/request.js";
import type { FileWriteTarget } from "./file-write-target.js";
import type { ToolContext, ToolResult } from "./types.js";
import { expandHome } from "./writable-zones.js";

type Replacement = { path: string; root: string; target: FileWriteTarget; content: string; controlPlane: boolean };
type Confirmation =
  | { ok: false; error: string }
  | { ok: true; action: string; reason: string; detail: ApprovalDetail };

/** Inspect the raw request before lexical normalization can hide an alias. */
function assertRawComponents(requested: string, root: string): void {
  let component = isAbsolute(requested) ? parse(requested).root : root;
  for (const part of requested.split(sep)) {
    if (!part || part === ".") continue;
    component = join(component, part);
    if (lstatSync(component).isSymbolicLink()) throw new Error("symlink aliases are not an ordinary replacement target");
  }
}

function assertOrdinaryTarget(o: Replacement): void {
  const requested = expandHome(o.path);
  if (requested.split(sep).includes("..")) throw new Error("raw path traversal is not an ordinary replacement target");
  const root = realpathSync(o.root);
  if (resolve(root, requested) !== o.target.abs) throw new Error("use the canonical file path, not a symlink alias");
  if (!o.target.previous || !o.target.stat) throw new Error("replacement target was not captured");
  if (o.target.stat.nlink > 1n) throw new Error("multiple hard links are not an ordinary replacement target");
  assertRawComponents(requested, root);
}

/** Bind a fresh human preview to the bytes captured before any approval await.
 * The action must remain exactly prefix + canonical path: the kernel parses it.
 * Commit/revalidation still belongs exclusively to FileWriteTarget.
 */
export function ordinaryOverwriteConfirmation(o: Replacement): Confirmation | null {
  if (o.controlPlane || o.target.previous === null) return null;
  try { assertOrdinaryTarget(o); }
  catch (error) { return { ok: false, error: `refused ordinary replacement: ${(error as Error).message}` }; }
  const before = o.target.previous!;
  const fingerprint = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const after = Buffer.from(o.content, "utf8");
  return {
    ok: true,
    action: `Overwrite existing file ${o.target.abs}`,
    reason: "file already exists — replacement requires a fresh one-time approval",
    detail: {
      fresh: true,
      canRemember: false,
      diff: [
        `Target: ${o.target.abs}`,
        `Before: ${before.length} bytes; SHA-256 ${fingerprint(before)}`,
        `After: ${after.length} bytes; SHA-256 ${fingerprint(after)}`,
        "",
        buildLineDiff(before.toString("utf8"), o.content),
      ].join("\n"),
    },
  };
}

export async function requestOrdinaryOverwrite(
  confirmation: Confirmation | null,
  ctx: ToolContext,
  displayPath: string,
): Promise<ToolResult | null> {
  if (!confirmation?.ok) return null;
  if (await ctx.requestApproval(confirmation.action, confirmation.reason, "write_file", confirmation.detail)) return null;
  return { ok: false, output: `write to ${displayPath} denied — file left unchanged`, effectDisposition: "denied" };
}
