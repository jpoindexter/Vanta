import type { OperatorTask, TaskStack } from "./types.js";
import { selectNextTask } from "./select.js";

// Pure summary generation for prompt injection — no I/O.
// Compact: <10 lines under normal load; empty stack → one line.

const MAX_PENDING_SHOWN = 3;

function taskLine(t: OperatorTask): string {
  const next = t.nextAction ? ` Next: ${t.nextAction}.` : "";
  return `${t.title}${next}`;
}

/**
 * Compact multi-line task stack summary for system prompt injection.
 * Shows the active/next task, blocked count, and top pending tasks.
 * Returns a single descriptive line when the stack is empty.
 */
export function taskStackSummary(stack: TaskStack): string {
  const active = stack.tasks.filter((t) => t.status === "active");
  const pending = stack.tasks.filter((t) => t.status === "pending");
  const blocked = stack.tasks.filter((t) => t.status === "blocked");

  if (stack.tasks.length === 0) {
    return "Operator task stack: no active tasks.";
  }

  const lines: string[] = ["Operator task stack:"];

  // Active task(s)
  if (active.length === 0) {
    const next = selectNextTask(stack);
    if (next) {
      lines.push(`Active: (none) — next up: ${taskLine(next)}`);
    } else {
      lines.push("Active: none.");
    }
  } else if (active.length === 1) {
    lines.push(`Active: ${taskLine(active[0]!)}`);
  } else {
    lines.push(`Active (${active.length}): ${active.map((t) => t.title).join(", ")}`);
  }

  // Blocked
  if (blocked.length === 0) {
    lines.push("Blocked: none.");
  } else {
    const names = blocked.map((t) => t.title).join(", ");
    lines.push(`Blocked (${blocked.length}): ${names}`);
  }

  // Top pending
  if (pending.length === 0) {
    lines.push("Pending: none.");
  } else {
    const shown = pending.slice(0, MAX_PENDING_SHOWN).map((t) => t.title);
    const extra = pending.length - shown.length;
    const tail = extra > 0 ? ` (+${extra} more)` : "";
    lines.push(`Pending top ${shown.length}: ${shown.join(", ")}${tail}`);
  }

  return lines.join("\n");
}
