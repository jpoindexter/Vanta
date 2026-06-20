import { dirname } from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolveInScope } from "../scope.js";
import type { SlashHandler } from "./types.js";

/**
 * `/describe <path>` — generate a short LLM summary of a file or directory.
 *
 * The path-gathering (`gatherTarget`) and prompt-building (`buildDescribePrompt`)
 * are pure and unit-tested; the LLM call is injected via `DescribeDeps.complete`,
 * so no real provider is needed under test. Errors are returned as values.
 */

/** Max entries listed for a directory target, and max bytes read from a file head. */
export const MAX_DIR_ENTRIES = 100;
export const MAX_FILE_BYTES = 4000;

/** A directory entry with just enough shape for the prompt. */
export type DirEntry = { name: string; isDir: boolean };

/** What `gatherTarget` resolved the path to. */
export type DescribeTarget =
  | { kind: "dir"; path: string; entries: DirEntry[]; truncated: boolean }
  | { kind: "file"; path: string; content: string; truncated: boolean };

/** Errors-as-values result for the gather + describe pipeline. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Injectable filesystem port — the real adapter uses node:fs/promises. */
export type DescribeFs = {
  stat: (path: string) => Promise<{ isDirectory: () => boolean }>;
  readdir: (path: string) => Promise<DirEntry[]>;
  readFile: (path: string) => Promise<string>;
};

/** Injected dependencies for `describe`: the fs port plus the LLM call. */
export type DescribeDeps = {
  fs: DescribeFs;
  complete: (prompt: string) => Promise<string>;
};

/** Read a path (already scope-checked) into a `DescribeTarget`, as a value. */
export async function gatherTarget(path: string, fs: DescribeFs): Promise<Result<DescribeTarget>> {
  let info: { isDirectory: () => boolean };
  try {
    info = await fs.stat(path);
  } catch {
    return { ok: false, error: `path not found: ${path}` };
  }
  try {
    return { ok: true, value: info.isDirectory() ? await gatherDir(path, fs) : await gatherFile(path, fs) };
  } catch (e) {
    return { ok: false, error: `could not read ${path}: ${(e as Error).message}` };
  }
}

async function gatherDir(path: string, fs: DescribeFs): Promise<DescribeTarget> {
  const all = (await fs.readdir(path)).sort((a, b) => a.name.localeCompare(b.name));
  const entries = all.slice(0, MAX_DIR_ENTRIES);
  return { kind: "dir", path, entries, truncated: all.length > entries.length };
}

async function gatherFile(path: string, fs: DescribeFs): Promise<DescribeTarget> {
  const full = await fs.readFile(path);
  const content = full.slice(0, MAX_FILE_BYTES);
  return { kind: "file", path, content, truncated: full.length > content.length };
}

/** Build the LLM prompt for a gathered target (pure). */
export function buildDescribePrompt(target: DescribeTarget): string {
  const head = "Write a concise (2-4 sentence) description of the following";
  if (target.kind === "dir") {
    const lines = target.entries.map((e) => `- ${e.name}${e.isDir ? "/" : ""}`).join("\n");
    const more = target.truncated ? `\n(…more entries omitted)` : "";
    return `${head} directory based on its entries. Say what it appears to contain and how it is organized.\n\nDirectory: ${target.path}\nEntries:\n${lines}${more}`;
  }
  const more = target.truncated ? `\n(…file truncated)` : "";
  return `${head} file based on its contents. Say what it does and its role.\n\nFile: ${target.path}\nContents:\n${target.content}${more}`;
}

/** Gather → prompt → inject the LLM call → description string. Errors as values. */
export async function describe(path: string, deps: DescribeDeps): Promise<Result<string>> {
  const gathered = await gatherTarget(path, deps.fs);
  if (!gathered.ok) return gathered;
  const text = (await deps.complete(buildDescribePrompt(gathered.value))).trim();
  return { ok: true, value: text || "(no description returned)" };
}

/** Real node:fs/promises adapter for the `DescribeFs` port. */
const nodeFs: DescribeFs = {
  stat: (p) => stat(p),
  readdir: async (p) =>
    (await readdir(p, { withFileTypes: true })).map((d) => ({ name: d.name, isDir: d.isDirectory() })),
  readFile: (p) => readFile(p, "utf8"),
};

/** `/describe <path>` slash handler — scope-checks the path, then describes it. */
export const describeCmd: SlashHandler = async (arg, ctx) => {
  const target = arg.trim();
  if (!target) return { output: "  usage: /describe <path>" };
  const root = dirname(ctx.dataDir); // dataDir = <repoRoot>/.vanta
  const scoped = resolveInScope(target, root);
  if (!scoped.ok) return { output: `  ✘ outside scope: ${target}` };

  const result = await describe(scoped.path, {
    fs: nodeFs,
    complete: async (prompt) => (await ctx.setup.provider.complete([{ role: "user", content: prompt }], [])).text,
  });
  return { output: result.ok ? `  ⊙ ${target}\n  ${result.value}` : `  ✘ ${result.error}` };
};
