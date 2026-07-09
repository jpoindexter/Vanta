import { z } from "zod";
import { join } from "node:path";
import type { Tool } from "./types.js";
import { runGit } from "./git.js";
import { loadSettings } from "../settings/store.js";
import { resolveAttribution } from "../settings/git-settings.js";
import { withTrailers } from "../agents/attribution.js";
import { trailersForSession } from "../agents/attribution-store.js";

/** Append the resolved attribution line as a trailer, when one is configured.
 *  Unset attribution → message unchanged (today's behavior). */
function withAttribution(message: string, line: string | undefined): string {
  if (!line) return message;
  return `${message.trimEnd()}\n\n${line}`;
}

// Approval-gated git write tools. Extracted from git.ts (size gate).
// runGit + read tools (status, diff) stay in git.ts.

const CommitArgs = z.object({ message: z.string().min(1) });
const PushArgs = z.object({
  remote: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  /** Force-push. Surfaced to describeForSafety so the kernel's DATA_LOSS net blocks it. */
  force: z.boolean().optional(),
});
const BranchArgs = z.object({ name: z.string().min(1).optional() });
const CheckoutArgs = z.object({ ref: z.string().min(1) });

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
    const settings = await loadSettings(ctx.root, process.env);
    const baseMessage = withAttribution(parsed.data.message, resolveAttribution(settings));
    const sessionTrailers = ctx.sessionId ? await trailersForSession(join(ctx.root, ".vanta"), ctx.sessionId) : [];
    const message = withTrailers(baseMessage, sessionTrailers);
    const { code, out } = await runGit(["commit", "-m", message], ctx.root);
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
        force: { type: "boolean", description: "Force-push (overwrites remote history)" },
      },
      required: [],
    },
  },
  // Surface the real args (incl. --force) so the kernel can see a destructive
  // force-push instead of a generic "git push". A constant string would hide
  // --force from assess() and let DATA_LOSS slip through as a mere Ask.
  describeForSafety: (a) =>
    `git push ${String(a["remote"] ?? "")} ${String(a["branch"] ?? "")} ${a["force"] ? "--force" : ""}`.trim(),
  async execute(raw, ctx) {
    const parsed = PushArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "git_push remote/branch must be strings, force a boolean" };
    }
    const approved = await ctx.requestApproval(
      "git push",
      "pushes local commits to a remote",
    );
    if (!approved) return { ok: false, output: "denied" };

    const args = ["push"];
    if (parsed.data.force) args.push("--force");
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
