import type { PermissionOption } from "./session.js";

// EXT-ACP-EDIT-DIFF — pre-exec edit-diff approval policy. A file mutation
// surfaces an old/new diff to the ACP client; "Allow edits this session"
// auto-approves LATER file edits — except on sensitive paths, which ALWAYS
// prompt (secrets/VCS/keys never ride a blanket grant). Pure policy; the
// session manager applies it. The kernel gate is untouched upstream — this
// only decides how an ask-tier file action is PROMPTED.

/** Tools whose ask carries an edit diff + the session auto-approve option. */
export const FILE_TOOLS: ReadonlySet<string> = new Set(["write_file", "edit_file"]);

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /(^|\/)\.env(\.|$)/i, // .env, .env.local, …
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.ssh(\/|$)/,
  /id_(rsa|ed25519|ecdsa|dsa)/i,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)credentials(\.|$)/i,
  /(^|\/)\.aws(\/|$)/,
  /(^|\/)\.npmrc$/,
  /secrets?\.(json|ya?ml|toml)$/i,
];

/** True for paths a session-wide auto-approve must never cover. Pure. */
export function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(path));
}

/** Extract the path from a file tool's kernel action ("write file <p>" / "edit file <p>"). Pure. */
export function pathFromAction(action: string): string {
  const m = /^(?:write|edit) file (.+)$/.exec(action.trim());
  return m ? m[1]! : "";
}

/** The file-edit permission menu: allow once / allow for the session / reject. */
export const EDIT_PERMISSION_OPTIONS: PermissionOption[] = [
  { optionId: "allow", name: "Allow", kind: "allow_once" },
  { optionId: "allow_always", name: "Allow edits this session", kind: "allow_always" },
  { optionId: "reject", name: "Reject", kind: "reject_once" },
];

/** Whether an ask-tier file action may skip the prompt under the session grant. Pure. */
export function decideEditPrompt(opts: { autoApproveEdits: boolean; path: string }): "auto-allow" | "prompt" {
  return opts.autoApproveEdits && !isSensitivePath(opts.path) ? "auto-allow" : "prompt";
}

const DIFF_CAP_LINES = 80;

/**
 * Minimal line diff: trim the common prefix/suffix, render the changed block
 * as `- old` / `+ new` with one context line each side, capped. Pure — no dep.
 */
export function buildLineDiff(oldText: string, newText: string): string {
  if (oldText === newText) return "(no changes)";
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const { start, endA, endB } = changedRange(a, b);
  const lines: string[] = [];
  if (start > 0) lines.push(`  ${a[start - 1]}`);
  for (const l of a.slice(start, endA)) lines.push(`- ${l}`);
  for (const l of b.slice(start, endB)) lines.push(`+ ${l}`);
  if (endA < a.length) lines.push(`  ${a[endA]}`);
  if (lines.length <= DIFF_CAP_LINES) return lines.join("\n");
  return `${lines.slice(0, DIFF_CAP_LINES).join("\n")}\n…(${lines.length - DIFF_CAP_LINES} more lines)`;
}

/** The changed line range after trimming common prefix + suffix. Pure. */
function changedRange(a: string[], b: string[]): { start: number; endA: number; endB: number } {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  return { start, endA, endB };
}
