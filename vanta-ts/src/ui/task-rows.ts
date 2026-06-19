import type { TaskStatus, WorkerTask } from "../team/tasks.js";

// Pure data-shaping for the /agents task panel: worker-task records → display
// rows, type/status badges, and elapsed time. No I/O, no React — unit-tested.

export type TaskType = "agent" | "shell" | "remote";

export type TaskRow = {
  id: string;
  type: TaskType;
  typeBadge: string;
  status: TaskStatus;
  statusGlyph: string;
  statusColor: string;
  elapsed: string;
  title: string;
};

const TITLE_MAX = 48;

/** Classify a worker's task type from its id convention. Pure.
 * `shell-*` workers are background shell tasks, `remote-*` are remote-triggered,
 * everything else is an LLM agent worker (the common team/fleet case). */
export function classifyTaskType(workerId: string): TaskType {
  const id = workerId.toLowerCase();
  if (id.startsWith("shell-") || id.startsWith("shell:")) return "shell";
  if (id.startsWith("remote-") || id.startsWith("remote:")) return "remote";
  return "agent";
}

const TYPE_BADGES: Record<TaskType, string> = { agent: "◆ agent", shell: "» shell", remote: "⇄ remote" };

export function typeBadge(type: TaskType): string {
  return TYPE_BADGES[type];
}

type Glyph = { glyph: string; color: string };

const STATUS_GLYPHS: Record<TaskStatus, Glyph> = {
  assigned: { glyph: "○", color: "white" },
  running: { glyph: "▶", color: "#ffb86b" },
  done: { glyph: "✓", color: "#83f2b0" },
  blocked: { glyph: "⚠", color: "#ffb86b" },
  stopped: { glyph: "■", color: "white" },
  removed: { glyph: "✗", color: "#ff6b7a" },
};

export function statusGlyph(status: TaskStatus): Glyph {
  return STATUS_GLYPHS[status];
}

/** Human elapsed between created and updated (terminal) or now (still open). Pure. */
export function formatElapsed(createdISO: string, updatedISO: string, now: Date): string {
  const start = Date.parse(createdISO);
  const open = updatedISO === createdISO || Number.isNaN(Date.parse(updatedISO));
  const end = open ? now.getTime() : Date.parse(updatedISO);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  return humanizeMs(end - start);
}

function humanizeMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Shape one worker task into a display row. Pure. */
export function toTaskRow(task: WorkerTask, now: Date): TaskRow {
  const type = classifyTaskType(task.workerId);
  const { glyph, color } = statusGlyph(task.status);
  return {
    id: task.id,
    type,
    typeBadge: typeBadge(type),
    status: task.status,
    statusGlyph: glyph,
    statusColor: color,
    elapsed: formatElapsed(task.created, task.updated, now),
    title: clip(task.title, TITLE_MAX),
  };
}

export const STOPPABLE: ReadonlySet<TaskStatus> = new Set(["assigned", "running", "blocked"]);
export const RESPAWNABLE: ReadonlySet<TaskStatus> = new Set(["done", "stopped", "blocked"]);

export type TasksKey = { escape?: boolean; return?: boolean; upArrow?: boolean; downArrow?: boolean };
export type TasksKeyAction =
  | { kind: "close" }
  | { kind: "openDetail" }
  | { kind: "closeDetail" }
  | { kind: "move"; to: number }
  | { kind: "stop" }
  | { kind: "respawn" }
  | { kind: "rejectStop"; status: TaskStatus }
  | { kind: "rejectRespawn"; status: TaskStatus }
  | { kind: "noop" };

export type TasksKeyCtx = { detail: boolean; sel: number; count: number; current?: { status: TaskStatus } };

/** Pure key→action mapping for the tasks panel. The component applies the action;
 * this stays unit-testable (the harness can't assert post-input re-renders). */
export function tasksKeyAction(input: string, key: TasksKey, ctx: TasksKeyCtx): TasksKeyAction {
  if (ctx.detail) return key.escape || key.return ? { kind: "closeDetail" } : { kind: "noop" };
  if (key.escape) return { kind: "close" };
  const nav = navAction(key, ctx);
  if (nav) return nav;
  if (input === "s") return resolveAction("stop", ctx.current);
  if (input === "r") return resolveAction("respawn", ctx.current);
  return { kind: "noop" };
}

/** List-mode arrow/enter navigation; null if the key isn't a nav key. */
function navAction(key: TasksKey, ctx: TasksKeyCtx): TasksKeyAction | null {
  if (key.upArrow) return { kind: "move", to: Math.max(0, ctx.sel - 1) };
  if (key.downArrow) return { kind: "move", to: Math.min(ctx.count - 1, ctx.sel + 1) };
  if (key.return) return ctx.current ? { kind: "openDetail" } : { kind: "noop" };
  return null;
}

function resolveAction(kind: "stop" | "respawn", current?: { status: TaskStatus }): TasksKeyAction {
  if (!current) return { kind: "noop" };
  const allowed = kind === "stop" ? STOPPABLE : RESPAWNABLE;
  if (allowed.has(current.status)) return { kind };
  return kind === "stop" ? { kind: "rejectStop", status: current.status } : { kind: "rejectRespawn", status: current.status };
}

/** The full output log lines for the detail dialog. Pure. */
export function detailLines(task: WorkerTask): string[] {
  const lines = [
    `id       ${task.id}`,
    `worker   ${task.workerId} · ${classifyTaskType(task.workerId)}`,
    `status   ${task.status}`,
    `title    ${task.title}`,
    `created  ${task.created}`,
    `updated  ${task.updated}`,
  ];
  if (task.result) lines.push("", "result:", ...task.result.split("\n"));
  if (task.blocker) lines.push("", "blocker:", ...task.blocker.split("\n"));
  if (!task.result && !task.blocker) lines.push("", "(no output recorded yet)");
  return lines;
}
