import { dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readStack } from "../task-stack/store.js";
import { selectNextTask } from "../task-stack/select.js";
import { formatSessionCost } from "../pricing.js";
import type { OperatorTask } from "../task-stack/types.js";
import type { SlashHandler } from "./types.js";

// /dashboard — live operator state at a glance: tasks, goals, repo, model, cost.

const execFileAsync = promisify(execFile);
const MAX_GIT_LINES = 8;
const MAX_PENDING_SHOWN = 3;

function header(title: string): string {
  return `── ${title} ──`;
}

function taskOneLiner(t: OperatorTask): string {
  const next = t.nextAction ? ` → ${t.nextAction}` : "";
  return `  ${t.title}${next}`;
}

async function renderTasks(dataDir: string): Promise<{
  activeSection: string;
  pendingSection: string;
  blockedSection: string;
  stack: import("../task-stack/types.js").TaskStack;
}> {
  const stack = await readStack(dataDir);
  const active = stack.tasks.filter((t) => t.status === "active");
  const pending = stack.tasks.filter((t) => t.status === "pending");
  const blocked = stack.tasks.filter((t) => t.status === "blocked");

  const activeSection = active.length
    ? active.map(taskOneLiner).join("\n")
    : "  (none)";

  const topPending = pending.slice(0, MAX_PENDING_SHOWN);
  const extra = pending.length - topPending.length;
  const pendingLines = topPending.map((t) => `  · ${t.title}`);
  if (extra > 0) pendingLines.push(`  … +${extra} more`);
  const pendingSection = pendingLines.length ? pendingLines.join("\n") : "  (none)";

  const blockedSection = blocked.length
    ? `  ${blocked.length} blocked: ${blocked.map((t) => t.title).join(", ")}`
    : "  (none)";

  return { activeSection, pendingSection, blockedSection, stack };
}

function renderGoals(active: import("../types.js").Goal[]): string {
  if (!active.length) return "  (none)";
  return active.map((g) => `  [${g.id}] ${g.text}`).join("\n");
}

async function renderApprovals(ctx: import("./types.js").ReplCtx): Promise<string> {
  try {
    const approvals = await ctx.setup.safety.getApprovals();
    if (!approvals.length) return "  (none pending)";
    return `  ${approvals.length} pending approval(s)`;
  } catch {
    return "  (unavailable)";
  }
}

async function renderGitStatus(repoRoot: string): Promise<{ output: string; clean: boolean }> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoRoot, "status", "--short"], {
      timeout: 1000,
    });
    const trimmed = stdout.trim();
    if (!trimmed) return { output: "  clean", clean: true };
    const lines = trimmed.split("\n").slice(0, MAX_GIT_LINES);
    const extra = trimmed.split("\n").length - lines.length;
    const tail = extra > 0 ? [`  … +${extra} more`] : [];
    return { output: lines.map((l) => `  ${l}`).concat(tail).join("\n"), clean: false };
  } catch {
    return { output: "  clean", clean: true };
  }
}

function renderNext(stack: import("../task-stack/types.js").TaskStack): string {
  const next = selectNextTask(stack);
  if (!next) return "  (no actionable tasks)";
  const action = next.nextAction ? `\n  Action: ${next.nextAction}` : "";
  return `  ${next.title}${action}`;
}

/** Build and return the full dashboard output string. */
export async function buildDashboard(ctx: import("./types.js").ReplCtx): Promise<string> {
  const repoRoot = dirname(ctx.dataDir);
  const allGoals = await ctx.setup.safety.getGoals().catch(() => []);
  const activeGoals = allGoals.filter((g) => g.status === "active");

  const [taskData, approvalsOut, gitData] = await Promise.all([
    renderTasks(ctx.dataDir),
    renderApprovals(ctx),
    renderGitStatus(repoRoot),
  ]);

  const { activeSection, pendingSection, blockedSection, stack } = taskData;
  const goalLines = renderGoals(activeGoals);
  const hasGoals = activeGoals.length > 0;

  const allClear = stack.tasks.length === 0 && !hasGoals && gitData.clean;
  if (allClear) {
    return "✓ all clear — no tasks, no goals, clean repo.";
  }

  const modelLine = `  ${ctx.setup.provider.modelId()}`;
  const costLine = `  ${formatSessionCost(ctx.state.sessionCost)}`;
  const nextLine = renderNext(stack);

  return [
    header("Active Task"),
    activeSection,
    "",
    header("Pending Tasks"),
    pendingSection,
    "",
    header("Blocked Tasks"),
    blockedSection,
    "",
    header("Goals"),
    goalLines,
    "",
    header("Pending Approvals"),
    approvalsOut,
    "",
    header("Repo Status"),
    gitData.output,
    "",
    header("Model"),
    modelLine,
    "",
    header("Session Cost"),
    costLine,
    "",
    header("Next Recommended"),
    nextLine,
  ].join("\n");
}

export const dashboard: SlashHandler = async (_arg, ctx) => {
  const output = await buildDashboard(ctx);
  return { output };
};
