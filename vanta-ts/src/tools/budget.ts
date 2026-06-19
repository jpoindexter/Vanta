import { z } from "zod";
import { join } from "node:path";
import type { Tool, ToolResult } from "./types.js";
import { setBudgetLimit, clearBudget, getBudget, listBudgets } from "../budget/store.js";
import { remainingUsd, type Budget } from "../budget/types.js";

// budget tool — operator-facing surface for the budget hard-stop rail. Set a USD
// limit on a scope before walking away; enforcement is automatic (overspend
// auto-pauses the scope; a loop scope also cancels its queued wakes).

const ArgsSchema = z.object({
  action: z.enum(["set", "status", "clear"]),
  scope: z.string().min(1).optional(),
  limit_usd: z.number().positive().optional(),
  warn_fraction: z.number().min(0).max(1).optional(),
});

function fmt(b: Budget): string {
  const pct = Math.round((b.spentUsd / b.limitUsd) * 100);
  const tail = b.status === "exceeded" ? " — PAUSED (budget)" : `, $${remainingUsd(b).toFixed(2)} left`;
  return `${b.scope}: $${b.spentUsd.toFixed(2)} / $${b.limitUsd.toFixed(2)} (${pct}%, ${b.status})${tail}`;
}

async function runStatus(dataDir: string, scope?: string): Promise<ToolResult> {
  if (scope) {
    const b = await getBudget(dataDir, scope);
    return { ok: true, output: b ? fmt(b) : `no budget set for scope "${scope}"` };
  }
  const all = await listBudgets(dataDir);
  return { ok: true, output: all.length ? all.map(fmt).join("\n") : "no budgets set" };
}

export const budgetTool: Tool = {
  schema: {
    name: "budget",
    description:
      'Set, inspect, or clear a scoped spend budget (USD). On overspend the scope auto-pauses; a loop scope ("loop:<id>") also cancels its queued wakes. Scopes: "loop:<id>", "goal:<id>", "session", "agent:<id>".',
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["set", "status", "clear"], description: "set a limit, show status, or clear a budget" },
        scope: { type: "string", description: 'budget scope key, e.g. "loop:nightly" or "session". Omit on status to list all.' },
        limit_usd: { type: "number", description: "hard-stop limit in USD (required for set)" },
        warn_fraction: { type: "number", description: "fraction of the limit that flips to warning (default 0.8)" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (args) => `manage spend budget (${String(args.action ?? "")})`,
  async execute(rawArgs, ctx): Promise<ToolResult> {
    const parsed = ArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, output: `invalid budget args: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
    }
    const a = parsed.data;
    const dataDir = join(ctx.root, ".vanta");
    if (a.action === "status") return runStatus(dataDir, a.scope);
    if (!a.scope) return { ok: false, output: `budget ${a.action} needs a "scope"` };
    if (a.action === "clear") {
      const removed = await clearBudget(dataDir, a.scope);
      return { ok: true, output: removed ? `cleared budget for "${a.scope}"` : `no budget set for "${a.scope}"` };
    }
    if (a.limit_usd === undefined) return { ok: false, output: 'budget set needs "limit_usd"' };
    const b = await setBudgetLimit(dataDir, { scope: a.scope, limitUsd: a.limit_usd, warnFraction: a.warn_fraction });
    return { ok: true, output: `budget set — ${fmt(b)}` };
  },
};
