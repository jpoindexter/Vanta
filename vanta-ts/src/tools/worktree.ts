import { z } from "zod";
import { join } from "node:path";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import {
  createWorktree,
  cleanupWorktree,
  worktreeStatus,
} from "../worktree/manager.js";

// enter_worktree / exit_worktree — kernel-gated wrappers over the worktree
// manager. enter_worktree creates an isolated git worktree (its own branch +
// directory) for parallel work; exit_worktree removes one, auto-cleaning when
// it has no uncommitted changes and SURFACING (never silently discarding) when
// it does. Worktrees live under `.vanta/worktrees` so worker edits stay inside
// the repo-scoped kernel boundary (same convention the fleet uses).

const WORKTREE_DIR = ".vanta/worktrees";

const EnterArgs = z.object({
  branch_prefix: z.string().min(1).max(64).optional(),
});

const ExitArgs = z.object({
  path: z.string().min(1),
  branch: z.string().min(1),
  force: z.boolean().optional(),
});

function worktreeBaseDir(root: string): string {
  return join(root, WORKTREE_DIR);
}

export const enterWorktreeTool: Tool = {
  schema: {
    name: "enter_worktree",
    description:
      "Create an isolated git worktree (its own branch + directory) for parallel " +
      "work without touching the main checkout. Returns the worktree path and " +
      "branch; clean it up afterwards with exit_worktree.",
    parameters: {
      type: "object",
      properties: {
        branch_prefix: {
          type: "string",
          description: "Optional branch-name prefix (default: agent-worktree)",
        },
      },
      required: [],
    },
  },
  describeForSafety: (a) =>
    `git worktree add (new branch ${String(a.branch_prefix ?? "agent-worktree")}/*)`,
  async execute(raw, ctx: ToolContext): Promise<ToolResult> {
    const parsed = EnterArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "enter_worktree: branch_prefix must be a 1-64 char string" };
    }
    try {
      const handle = await createWorktree(
        ctx.root,
        parsed.data.branch_prefix ?? "agent-worktree",
        worktreeBaseDir(ctx.root),
      );
      return {
        ok: true,
        output: `Entered worktree.\n  path:   ${handle.path}\n  branch: ${handle.branch}\nExit with exit_worktree (auto-cleans if unchanged).`,
      };
    } catch (err) {
      return { ok: false, output: `enter_worktree failed: ${(err as Error).message}` };
    }
  },
};

export const exitWorktreeTool: Tool = {
  schema: {
    name: "exit_worktree",
    description:
      "Remove a git worktree created by enter_worktree. Auto-cleans (drops the " +
      "worktree directory and its branch) only when it has NO uncommitted " +
      "changes. If it is dirty, refuses and surfaces the changes — pass " +
      "force:true to discard them and remove anyway.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Worktree directory path (from enter_worktree)" },
        branch: { type: "string", description: "Worktree branch name (from enter_worktree)" },
        force: {
          type: "boolean",
          description: "Discard uncommitted changes and remove anyway (default false)",
        },
      },
      required: ["path", "branch"],
    },
  },
  describeForSafety: (a) => `git worktree remove ${String(a.path ?? "")}`,
  async execute(raw, ctx: ToolContext): Promise<ToolResult> {
    const parsed = ExitArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "exit_worktree: path and branch are required strings" };
    }
    const { path, branch, force } = parsed.data;
    try {
      if (!force) {
        const { clean, status } = await worktreeStatus(path);
        if (!clean) {
          return {
            ok: false,
            output:
              `exit_worktree refused: worktree has uncommitted changes (not discarded).\n` +
              `  path: ${path}\n${status}\n` +
              `Commit or stash them, or re-run with force:true to discard and remove.`,
          };
        }
      }
      await cleanupWorktree(ctx.root, path, branch);
      const note = force ? " (forced — uncommitted changes discarded)" : "";
      return { ok: true, output: `Exited worktree ${path} and deleted branch ${branch}${note}.` };
    } catch (err) {
      return { ok: false, output: `exit_worktree failed: ${(err as Error).message}` };
    }
  },
};
