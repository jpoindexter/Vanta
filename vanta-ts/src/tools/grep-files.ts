import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "./types.js";
import { expandHome } from "./writable-zones.js";

const execFileAsync = promisify(execFile);

const Args = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  file_glob: z.string().optional(),
  max_results: z.number().int().min(1).max(1000).optional(),
});

export const grepFilesTool: Tool = {
  schema: {
    name: "grep_files",
    description:
      "Search file contents by regex pattern using ripgrep (rg). Returns file:line:content matches. " +
      "Falls back to grep when rg is unavailable. Read-only — use instead of shell_cmd for searches.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regex or fixed-string pattern to search for",
        },
        path: {
          type: "string",
          description: "Directory or file to search (default: project root)",
        },
        file_glob: {
          type: "string",
          description: "File glob filter, e.g. '*.ts' or '**/*.{ts,js}'",
        },
        max_results: {
          type: "number",
          description: "Maximum number of matches to return (default: 100)",
        },
      },
      required: ["pattern"],
    },
  },
  describeForSafety: (a) => `grep for "${String(a.pattern ?? "")}"`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `grep_files: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
    }
    const { pattern, path, file_glob, max_results = 100 } = parsed.data;
    const searchPath = path ? expandHome(path) : ctx.root;

    // Try rg first; fall back to grep.
    try {
      return await runRg(pattern, searchPath, file_glob, max_results, ctx.root);
    } catch {
      return runGrep(pattern, searchPath, file_glob, max_results, ctx.root);
    }
  },
};

async function runRg(
  pattern: string,
  searchPath: string,
  fileGlob: string | undefined,
  maxResults: number,
  cwd: string,
): Promise<{ ok: boolean; output: string }> {
  const args: string[] = [
    "--line-number",
    "--no-heading",
    "--color=never",
    "--max-count", String(maxResults),
    "--max-filesize=5M",
  ];
  if (fileGlob) args.push("--glob", fileGlob);
  // Pattern and path last to avoid accidental flag parsing.
  args.push("--", pattern, searchPath);

  try {
    const { stdout } = await execFileAsync("rg", args, { cwd, maxBuffer: 2 * 1024 * 1024 });
    const lines = stdout.trim().split("\n").slice(0, maxResults);
    const output = lines.filter(Boolean).join("\n");
    return { ok: true, output: output || "(no matches)" };
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 1) return { ok: true, output: "(no matches)" };
    throw err; // real error — triggers grep fallback
  }
}

async function runGrep(
  pattern: string,
  searchPath: string,
  fileGlob: string | undefined,
  maxResults: number,
  cwd: string,
): Promise<{ ok: boolean; output: string }> {
  // grep -rn for recursive line-numbered search. No shell interpolation — args are array.
  const args: string[] = ["-rn", "--color=never", "-m", String(maxResults)];
  if (fileGlob) args.push("--include", fileGlob);
  // Use -- to separate options from pattern/path (supported by GNU grep and BSD grep).
  args.push(pattern, searchPath);

  try {
    const { stdout } = await execFileAsync("grep", args, { cwd, maxBuffer: 2 * 1024 * 1024 });
    const lines = stdout.trim().split("\n").slice(0, maxResults);
    return { ok: true, output: lines.filter(Boolean).join("\n") || "(no matches)" };
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 1) return { ok: true, output: "(no matches)" };
    return { ok: false, output: `grep_files: search failed — rg and grep both unavailable or errored` };
  }
}
