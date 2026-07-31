import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, relative, resolve, sep } from "node:path";

export type ProjectPathPolicy =
  | { kind: "ordinary" }
  | { kind: "control-plane"; reason: string }
  | { kind: "denied"; reason: string };

const KERNEL_PRIVATE_FILES = new Set([
  "api-token",
  "audit.key",
  "audit.head",
  "events.jsonl",
]);

function normalizedProjectRelative(abs: string, root: string): string | null {
  const canonicalRoot = (() => {
    try { return realpathSync(resolve(root)); } catch { return resolve(root); }
  })();
  const rel = relative(canonicalRoot, resolve(abs));
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) return rel === "" ? "" : null;
  return rel.split(sep).join("/");
}

/** Classify paths whose ordinary file-tool access would cross the trust boundary. */
export function projectPathPolicy(abs: string, root: string): ProjectPathPolicy {
  const rel = normalizedProjectRelative(abs, root);
  if (rel === null) return { kind: "ordinary" };
  if (/^\.env(?:\.|$)/i.test(basename(rel))) {
    return { kind: "denied", reason: "a protected project credential file" };
  }
  if (rel.startsWith(".vanta/") && KERNEL_PRIVATE_FILES.has(rel.slice(".vanta/".length))) {
    return { kind: "denied", reason: "protected kernel authentication or audit state" };
  }
  if (rel === ".mcp.json" || rel.startsWith(".vanta/") || rel.startsWith(".git/hooks/")) {
    return { kind: "control-plane", reason: "project control-plane state" };
  }
  return { kind: "ordinary" };
}

export function projectControlPlaneConfirmation(o: {
  abs: string;
  root: string;
  displayPath: string;
  content: string;
}): { action: string; reason: string; detail: { fresh: true } } | null {
  const policy = projectPathPolicy(o.abs, o.root);
  if (policy.kind !== "control-plane") return null;
  const digest = createHash("sha256").update(o.content).digest("hex");
  return {
    action: `Modify project control-plane file ${o.displayPath} (${Buffer.byteLength(o.content)} bytes, sha256 ${digest})`,
    reason: `${policy.reason} can change trusted execution or authority and requires a fresh exact confirmation`,
    detail: { fresh: true },
  };
}

/**
 * Existing project paths hidden from shell/code/hook sandboxes. Direct file
 * tools apply the more precise policy above; subprocesses receive no ambient
 * control-plane access at all.
 */
export function projectSandboxDeniedPaths(root: string): Array<{ path: string; directory: boolean }> {
  const candidates = [
    join(root, ".vanta"),
    join(root, ".mcp.json"),
    join(root, ".git", "hooks"),
    ...projectEnvFiles(root),
  ];
  return candidates.flatMap((path) => {
    if (!existsSync(path)) return [];
    try {
      return [{ path: realpathSync(path), directory: statSync(path).isDirectory() }];
    } catch {
      return [];
    }
  });
}

function projectEnvFiles(root: string): string[] {
  try {
    return readdirSync(root)
      .filter((name) => /^\.env(?:\.|$)/i.test(name))
      .map((name) => join(root, name));
  } catch {
    return [];
  }
}
