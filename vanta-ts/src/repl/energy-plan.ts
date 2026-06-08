// ENERGY-PLAN: when executive function is the bottleneck, offer next actions
// binned by cognitive load so Jason can always pick an entry point.
// Each tier is a concrete, named step — not vague guidance.

import type { OperatorTask } from "../task-stack/types.js";

export type EnergyTier = "2-min" | "low-energy" | "deep-work" | "admin";

export type EnergizedAction = {
  tier: EnergyTier;
  label: string;  // "2-min" / "low-energy" / "deep-work" / "admin"
  action: string; // the concrete next step
  why: string;    // why this fits the tier
};

const TIER_LABELS: Record<EnergyTier, string> = {
  "2-min":       "2-min   ",
  "low-energy":  "low     ",
  "deep-work":   "deep    ",
  "admin":       "admin   ",
};

/**
 * Classify a task into an energy tier based on its metadata. Pure.
 * Heuristics: size/priority/title keywords.
 */
export function classifyEnergyTier(task: OperatorTask): EnergyTier {
  const text = (task.title + " " + (task.nextAction ?? "") + " " + (task.why ?? "")).toLowerCase();

  // 2-min: tiny chores that need no context loading
  if (/\b(update|rename|move|delete|add comment|bump|tag|label|close|mark)\b/.test(text) && task.size !== "L") {
    return "2-min";
  }

  // admin: review, triage, decision, meeting, email, invoice
  if (/\b(review|triage|decide|meeting|email|invoice|respond|approve|deny|check in)\b/.test(text)) {
    return "admin";
  }

  // deep-work: architecture, design, implement, refactor — needs sustained focus
  if (
    /\b(implement|architect|design|refactor|migrate|build|write|debug|integrate)\b/.test(text) ||
    task.priority === "high" ||
    task.size === "L"
  ) {
    return "deep-work";
  }

  // low-energy: everything else — light reads, small fixes, docs
  return "low-energy";
}

/**
 * Given a task, produce an EnergizedAction for its natural tier.
 * Pure — called per-task by energyPlan.
 */
export function taskToAction(task: OperatorTask): EnergizedAction {
  const tier = classifyEnergyTier(task);
  const action = task.nextAction ?? `Work on: ${task.title}`;
  return { tier, label: TIER_LABELS[tier].trim(), action, why: task.why };
}

/**
 * Build an energy-binned action plan from an ordered task list.
 * Returns up to one action per tier, prioritising active tasks.
 * Pure.
 */
export function energyPlan(tasks: OperatorTask[]): EnergizedAction[] {
  const actionable = tasks.filter((t) => t.status === "active" || t.status === "pending");
  const seen = new Set<EnergyTier>();
  const result: EnergizedAction[] = [];
  for (const task of actionable) {
    const action = taskToAction(task);
    if (!seen.has(action.tier)) {
      seen.add(action.tier);
      result.push(action);
    }
    if (seen.size === 4) break; // all tiers covered
  }
  return result;
}

/** Format the energy plan as a readable prompt-safe string. Pure. */
export function formatEnergyPlan(actions: EnergizedAction[]): string {
  if (!actions.length) return "  (no actionable tasks — add one with /tasks add)";
  return actions
    .map((a) => `  [${a.label.padEnd(10)}] ${a.action}`)
    .join("\n");
}
