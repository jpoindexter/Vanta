import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "./types.js";
export { gitCommitTool, gitPushTool, gitBranchTool, gitCheckoutTool } from "./git-write.js";

const run = promisify(execFile);

const TIMEOUT_MS = 15_000;
const MAX_OUTPUT = 1024 * 1024;

/** Run git, normalizing both success and non-zero/spawn failure into a value. */
export async function runGit(
  args: string[],
  cwd: string,
): Promise<{ code: number; out: string }> {
  try {
    const { stdout, stderr } = await run("git", args, {
      cwd,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT,
    });
    return { code: 0, out: [stdout, stderr].filter(Boolean).join("\n").trim() };
  } catch (err) {
    // execFile throws on non-zero exit; e.code is a string (e.g. ENOENT) on spawn failure.
    const e = err as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message: string;
    };
    const out = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
    return { code: typeof e.code === "number" ? e.code : 1, out: out || e.message };
  }
}

const StatusArgs = z.object({});
const DiffArgs = z.object({ path: z.string().min(1).optional() });

export const gitStatusTool: Tool = {
  schema: {
    name: "git_status",
    description: "Show working-tree status (porcelain) with branch info.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  describeForSafety: () => "git status",
  async execute(raw, ctx) {
    const parsed = StatusArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "git_status takes no arguments" };
    }
    const { code, out } = await runGit(["status", "--porcelain", "-b"], ctx.root);
    return { ok: code === 0, output: out || "(no output)" };
  },
};

export const gitDiffTool: Tool = {
  schema: {
    name: "git_diff",
    description: "Show unstaged changes, optionally limited to one path.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional path to diff" },
      },
      required: [],
    },
  },
  describeForSafety: () => "git diff",
  async execute(raw, ctx) {
    const parsed = DiffArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "git_diff path must be a non-empty string" };
    }
    const args = ["diff"];
    if (parsed.data.path) args.push(parsed.data.path);
    const { code, out } = await runGit(args, ctx.root);
    return { ok: code === 0, output: out || "(no output)" };
  },
};

