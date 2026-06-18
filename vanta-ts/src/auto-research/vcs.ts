import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type CommitResult = { sha: string | null; summary: string };

export async function commitAll(cwd: string, message: string): Promise<CommitResult> {
  const status = await run("git", ["status", "--porcelain"], { cwd });
  if (!status.stdout.trim()) return { sha: null, summary: "(no changes)" };
  await run("git", ["add", "-A"], { cwd });
  await run("git", ["commit", "-m", message], { cwd });
  const sha = (await run("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  const summary = (await run("git", ["diff", "HEAD~1..HEAD", "--stat"], { cwd })).stdout.trim() || "(committed changes)";
  return { sha, summary };
}
