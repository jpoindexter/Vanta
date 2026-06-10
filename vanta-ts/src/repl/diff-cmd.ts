import { dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SlashHandler } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * `/diff`
 * Shows uncommitted changes: working-tree diff stat + staged diff stat.
 * Runs git in the repo root (derived from dataDir, matching the /update pattern).
 */
export const diff: SlashHandler = async (_arg, ctx) => {
  const repoRoot = dirname(ctx.dataDir); // dataDir = <repoRoot>/.vanta

  const run = async (args: string[]): Promise<string> => {
    try {
      const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
      return stdout.trim();
    } catch (err: unknown) {
      // git diff exits non-zero only on real errors, not on empty diff
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      return `(git error: ${msg})`;
    }
  };

  const [unstaged, staged] = await Promise.all([
    run(["diff", "--stat", "HEAD"]),
    run(["diff", "--cached", "--stat"]),
  ]);

  if (!unstaged && !staged) {
    return { output: "  (working tree and staging area are clean)" };
  }

  const parts: string[] = [];
  if (unstaged) parts.push(`  unstaged (working tree vs HEAD):\n${unstaged.split("\n").map((l) => `    ${l}`).join("\n")}`);
  if (staged) parts.push(`  staged (index vs HEAD):\n${staged.split("\n").map((l) => `    ${l}`).join("\n")}`);

  return { output: parts.join("\n\n") };
};
