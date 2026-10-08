import { gitExecFile } from "../git/process.js";


export type CommitResult = { sha: string | null; summary: string };

export async function commitAll(cwd: string, message: string): Promise<CommitResult> {
  const status = await gitExecFile("git", ["status", "--porcelain"], { cwd });
  if (!status.stdout.trim()) return { sha: null, summary: "(no changes)" };
  await gitExecFile("git", ["add", "-A"], { cwd });
  await gitExecFile("git", ["commit", "-m", message], { cwd });
  const sha = (await gitExecFile("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  const summary = (await gitExecFile("git", ["diff", "HEAD~1..HEAD", "--stat"], { cwd })).stdout.trim() || "(committed changes)";
  return { sha, summary };
}
