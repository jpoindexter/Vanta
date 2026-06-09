import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "./types.js";

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
const CommitArgs = z.object({ message: z.string().min(1) });
const PushArgs = z.object({
  remote: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
});
const BranchArgs = z.object({ name: z.string().min(1).optional() });
const CheckoutArgs = z.object({ ref: z.string().min(1) });

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

export const gitCommitTool: Tool = {
  schema: {
    name: "git_commit",
    description: "Stage all changes and commit with a message. Requires approval.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Commit message" },
      },
      required: ["message"],
    },
  },
  describeForSafety: () => "git commit",
  async execute(raw, ctx) {
    const parsed = CommitArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'git_commit needs a "message" string' };
    }
    const approved = await ctx.requestApproval(
      "git commit",
      "commits stage and record changes in history",
    );
    if (!approved) return { ok: false, output: "denied" };

    const add = await runGit(["add", "-A"], ctx.root);
    if (add.code !== 0) return { ok: false, output: add.out || "(no output)" };
    const { code, out } = await runGit(
      ["commit", "-m", parsed.data.message],
      ctx.root,
    );
    return { ok: code === 0, output: out || "(no output)" };
  },
};

export const gitPushTool: Tool = {
  schema: {
    name: "git_push",
    description: "Push commits to a remote. Requires approval.",
    parameters: {
      type: "object",
      properties: {
        remote: { type: "string", description: "Optional remote name" },
        branch: { type: "string", description: "Optional branch name" },
      },
      required: [],
    },
  },
  describeForSafety: () => "git push",
  async execute(raw, ctx) {
    const parsed = PushArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "git_push remote/branch must be strings" };
    }
    const approved = await ctx.requestApproval(
      "git push",
      "pushes local commits to a remote",
    );
    if (!approved) return { ok: false, output: "denied" };

    const args = ["push"];
    if (parsed.data.remote) args.push(parsed.data.remote);
    if (parsed.data.branch) args.push(parsed.data.branch);
    const { code, out } = await runGit(args, ctx.root);
    return { ok: code === 0, output: out || "(no output)" };
  },
};

export const gitBranchTool: Tool = {
  schema: {
    name: "git_branch",
    description: "Create a branch by name, or list branches when no name given. Requires approval.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Optional new branch name" },
      },
      required: [],
    },
  },
  describeForSafety: () => "git branch",
  async execute(raw, ctx) {
    const parsed = BranchArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "git_branch name must be a non-empty string" };
    }
    const approved = await ctx.requestApproval(
      "git branch",
      "creates or lists branches",
    );
    if (!approved) return { ok: false, output: "denied" };

    const args = parsed.data.name
      ? ["branch", parsed.data.name]
      : ["branch", "--list"];
    const { code, out } = await runGit(args, ctx.root);
    return { ok: code === 0, output: out || "(no output)" };
  },
};

export const gitCheckoutTool: Tool = {
  schema: {
    name: "git_checkout",
    description: "Check out a branch, tag, or commit ref. Requires approval.",
    parameters: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Branch, tag, or commit to check out" },
      },
      required: ["ref"],
    },
  },
  describeForSafety: () => "git checkout",
  async execute(raw, ctx) {
    const parsed = CheckoutArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'git_checkout needs a "ref" string' };
    }
    const approved = await ctx.requestApproval(
      "git checkout",
      "switching refs changes the working tree",
    );
    if (!approved) return { ok: false, output: "denied" };

    const { code, out } = await runGit(["checkout", parsed.data.ref], ctx.root);
    return { ok: code === 0, output: out || "(no output)" };
  },
};
