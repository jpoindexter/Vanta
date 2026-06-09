import {
  readStack,
  addTask,
  closeTask,
  blockTask,
  parkTask,
  reopenTask,
} from "../task-stack/store.js";
import { selectNextTask } from "../task-stack/select.js";
import type { OperatorTask } from "../task-stack/types.js";
import type { SlashHandler } from "./types.js";

// /tasks [add <title> | close <id> | block <id> <reason> | park <id> | reopen <id> | next]

function shortId(id: string): string {
  return id.slice(0, 8);
}

function taskLine(t: OperatorTask): string {
  const badge = { active: "▶", pending: "·", blocked: "✗", parked: "⏸", closed: "✓" }[t.status];
  const extra = t.blocker ? ` — blocked: ${t.blocker}` : t.nextAction ? ` → ${t.nextAction}` : "";
  return `  ${badge} [${shortId(t.id)}] ${t.title}${extra}`;
}

function listOutput(stack: import("../task-stack/types.js").TaskStack): string {
  const visible = stack.tasks.filter((t) => t.status !== "closed");
  if (!visible.length) return "  (no open tasks — /tasks add <title> to start one)";
  const groups: Record<string, OperatorTask[]> = { active: [], pending: [], blocked: [], parked: [] };
  for (const t of visible) groups[t.status]?.push(t);
  const parts: string[] = [];
  if (groups.active!.length) parts.push(`Active:\n${groups.active!.map(taskLine).join("\n")}`);
  if (groups.pending!.length) parts.push(`Pending:\n${groups.pending!.map(taskLine).join("\n")}`);
  if (groups.blocked!.length) parts.push(`Blocked:\n${groups.blocked!.map(taskLine).join("\n")}`);
  if (groups.parked!.length) parts.push(`Parked:\n${groups.parked!.map(taskLine).join("\n")}`);
  return parts.join("\n\n");
}

export const tasks: SlashHandler = async (arg, ctx) => {
  const dataDir = ctx.dataDir;
  const [sub, ...rest] = arg.trim().split(/\s+/);

  if (!sub || sub === "list") {
    return { output: listOutput(await readStack(dataDir)) };
  }

  if (sub === "add") {
    const titleRaw = rest.join(" ").trim();
    if (!titleRaw) return { output: "  Usage: /tasks add <title>" };
    const [title, ...whyParts] = titleRaw.split(/\s*--\s*/);
    const why = whyParts.join(" -- ").trim() || "added by user";
    const result = await addTask(dataDir, { title: title!.trim(), why, source: "user" });
    if (!result.ok) return { output: `  ✗ ${result.error}` };
    return { output: `  ✓ added [${shortId(result.value.id)}] ${result.value.title}` };
  }

  if (sub === "close") {
    const id = rest[0];
    if (!id) return { output: "  Usage: /tasks close <id>" };
    const stack = await readStack(dataDir);
    const task = stack.tasks.find((t) => t.id.startsWith(id));
    if (!task) return { output: `  ✗ no task matching '${id}'` };
    const result = await closeTask(task.id)(dataDir);
    if (!result.ok) return { output: `  ✗ ${result.error}` };
    return { output: `  ✓ closed: ${result.value.title}` };
  }

  if (sub === "block") {
    const [id, ...reasonParts] = rest;
    const reason = reasonParts.join(" ").trim();
    if (!id || !reason) return { output: "  Usage: /tasks block <id> <reason>" };
    const stack = await readStack(dataDir);
    const task = stack.tasks.find((t) => t.id.startsWith(id));
    if (!task) return { output: `  ✗ no task matching '${id}'` };
    const result = await blockTask(task.id, reason)(dataDir);
    if (!result.ok) return { output: `  ✗ ${result.error}` };
    return { output: `  ✓ blocked: ${result.value.title} — ${reason}` };
  }

  if (sub === "park") {
    const id = rest[0];
    if (!id) return { output: "  Usage: /tasks park <id>" };
    const stack = await readStack(dataDir);
    const task = stack.tasks.find((t) => t.id.startsWith(id));
    if (!task) return { output: `  ✗ no task matching '${id}'` };
    const result = await parkTask(task.id)(dataDir);
    if (!result.ok) return { output: `  ✗ ${result.error}` };
    return { output: `  ✓ parked: ${result.value.title}` };
  }

  if (sub === "reopen") {
    const id = rest[0];
    if (!id) return { output: "  Usage: /tasks reopen <id>" };
    const stack = await readStack(dataDir);
    const task = stack.tasks.find((t) => t.id.startsWith(id));
    if (!task) return { output: `  ✗ no task matching '${id}'` };
    const result = await reopenTask(task.id)(dataDir);
    if (!result.ok) return { output: `  ✗ ${result.error}` };
    return { output: `  ✓ reopened: ${result.value.title}` };
  }

  if (sub === "next") {
    const stack = await readStack(dataDir);
    const next = selectNextTask(stack);
    if (!next) return { output: "  (no actionable tasks — all blocked, parked, or stack is empty)" };
    const extra = next.nextAction ? `\n  Next action: ${next.nextAction}` : "";
    const blocker = next.blocker ? `\n  Blocker: ${next.blocker}` : "";
    return { output: `  ▶ [${shortId(next.id)}] ${next.title}\n  Why: ${next.why}${extra}${blocker}` };
  }

  return { output: `  Unknown subcommand '${sub}'. Use: list · add · close · block · park · reopen · next` };
};
