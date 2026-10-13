import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { gitExecFile } from "../git/process.js";
import { MAX_CHANGED_FILES } from "./constants.js";
import type { RunWorkProduct } from "./types.js";

// What did the agent change? A snapshot of the working tree (HEAD plus a content
// hash of every modified or untracked file) is taken before the run and again
// after; the difference is the run's changed files. Files that were already dirty
// before the run only count when their content changed. Not a git repo: no diff.

export type TreeSnapshot = { head: string | null; files: Map<string, string> };

const SNAPSHOT_FILE_LIMIT = 5000;
const HASH_BATCH = 50;
const HASH_SIZE_LIMIT = 16 * 1024 * 1024;
const VANTA_STATE_DIR = ".vanta/";

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    return (await gitExecFile("git", args, { cwd, timeout: 20_000, maxBuffer: 8 * 1024 * 1024 })).stdout;
  } catch {
    return null;
  }
}

/** git's hash-object is outside the git process allow-list, so content is hashed here. */
async function hashFile(cwd: string, path: string): Promise<string> {
  const full = join(cwd, path);
  try {
    const info = await stat(full);
    if (!info.isFile()) return `special:${info.mode}`;
    if (info.size > HASH_SIZE_LIMIT) return `large:${info.size}:${info.mtimeMs}`;
    return createHash("sha256").update(await readFile(full)).digest("hex");
  } catch {
    return "deleted";
  }
}

async function hashFiles(cwd: string, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < paths.length; i += HASH_BATCH) {
    const batch = paths.slice(i, i + HASH_BATCH);
    const hashes = await Promise.all(batch.map((path) => hashFile(cwd, path)));
    batch.forEach((path, index) => out.set(path, hashes[index]!));
  }
  return out;
}

/** null when `cwd` is not inside a git work tree or the tree is too large to snapshot cheaply. */
export async function snapshotTree(cwd: string): Promise<TreeSnapshot | null> {
  if ((await git(cwd, ["rev-parse", "--is-inside-work-tree"]))?.trim() !== "true") return null;
  const listed = await git(cwd, ["ls-files", "-z", "-m", "-o", "--exclude-standard"]);
  if (listed === null) return null;
  const paths = [...new Set(listed.split("\0").filter(Boolean))];
  if (paths.length > SNAPSHOT_FILE_LIMIT) return null;
  const head = (await git(cwd, ["rev-parse", "--verify", "HEAD"]))?.trim() || null;
  return { head, files: await hashFiles(cwd, paths) };
}

function changedPaths(before: TreeSnapshot, after: TreeSnapshot): string[] {
  const changed = new Set<string>();
  for (const key of new Set([...before.files.keys(), ...after.files.keys()])) {
    if (key.startsWith(VANTA_STATE_DIR)) continue; // Vanta's own bookkeeping, written during the run
    if (before.files.get(key) !== after.files.get(key)) changed.add(key);
  }
  return [...changed].sort();
}

async function committedPaths(cwd: string, before: TreeSnapshot, after: TreeSnapshot): Promise<string[]> {
  if (!before.head || !after.head || before.head === after.head) return [];
  const out = await git(cwd, ["diff", "--name-only", `${before.head}..${after.head}`]);
  return (out?.split("\n").filter(Boolean) ?? []).filter((p) => !p.startsWith(VANTA_STATE_DIR));
}

async function statFor(cwd: string, files: string[]): Promise<string> {
  const stat = (await git(cwd, ["diff", "--stat", "HEAD", "--", ...files]))?.trim() ?? "";
  const status = (await git(cwd, ["status", "--porcelain=v1", "--", ...files]))?.trimEnd() ?? "";
  return [status, stat].filter(Boolean).join("\n\n");
}

/** The code work product for a run, or undefined when nothing changed (or no repo). */
export async function changesProduct(cwd: string, before: TreeSnapshot | null): Promise<RunWorkProduct | undefined> {
  if (!before) return undefined;
  const after = await snapshotTree(cwd);
  if (!after) return undefined;
  const files = [...new Set([...changedPaths(before, after), ...await committedPaths(cwd, before, after)])].sort();
  if (files.length === 0) return undefined;
  const shown = files.slice(0, MAX_CHANGED_FILES);
  const header = `Changed ${files.length} file${files.length === 1 ? "" : "s"} in ${cwd}${files.length > shown.length ? ` (first ${shown.length} listed)` : ""}`;
  return { kind: "code", source: "git-diff", content: `${header}\n\n${await statFor(cwd, shown) || shown.join("\n")}`, files: shown };
}
