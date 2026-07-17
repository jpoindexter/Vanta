import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";
import { listRepoFiles } from "../term/at-context.js";

export type DesktopFileContext = { files: string[]; changed: string[]; recent: string[] };
type FileContextDeps = {
  list?: () => Promise<string[]>;
  changed?: () => Promise<string[]>;
  modifiedAt?: (path: string) => Promise<number>;
};

const exec = promisify(execFile);
const PRIVATE_FILE = /(^|\/)(?:\.DS_Store|\.env(?:\.[^/]*)?|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|[^/]+\.(?:pem|key|p12|pfx))$/i;
const PRIVATE_DIR = /(^|\/)(?:\.git|\.vanta|\.ssh|\.aws|\.gnupg)(?:\/|$)/i;

export function isSafeProjectFile(path: string): boolean {
  return !PRIVATE_FILE.test(path) && !PRIVATE_DIR.test(path);
}

export function parseChangedFiles(output: string): string[] {
  const entries = output.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (path) paths.push(path);
    if (/[RC]/.test(status)) index++;
  }
  return paths;
}

async function gitChanged(root: string): Promise<string[]> {
  const result = await exec("git", ["-C", root, "status", "--porcelain=v1", "-z", "--untracked-files=all"]).catch(() => ({ stdout: "" }));
  return parseChangedFiles(result.stdout);
}

export async function buildDesktopFileContext(root: string, deps: FileContextDeps = {}): Promise<DesktopFileContext> {
  const listed = await (deps.list?.() ?? listRepoFiles(root, 3, true));
  const files = [...new Set(listed.filter(isSafeProjectFile))].sort((a, b) => a.localeCompare(b)).slice(0, 400);
  const changedSet = new Set(await (deps.changed?.() ?? gitChanged(root)));
  const changed = files.filter((path) => changedSet.has(path));
  const modifiedAt = deps.modifiedAt ?? (async (path: string) => (await stat(join(root, path))).mtimeMs);
  const dated = await Promise.all(files.map(async (path) => ({ path, time: await modifiedAt(path).catch(() => 0) })));
  const recent = dated.sort((a, b) => b.time - a.time || a.path.localeCompare(b.path)).slice(0, 12).map((entry) => entry.path);
  return { files, changed, recent };
}
