import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import type { Tool } from "./types.js";
import { checkStall, type StallState } from "./shell-stall.js";
import { notify } from "../tui/notify.js";

// How often the in-process watchdog samples a running task's live output buffer.
// Must be < the stall idle window (45s) so idle time accrues across ticks.
const STALL_POLL_MS = 5_000;

// Shell-stall detect: poll the live output buffer; notify once if the task
// stalls on an interactive prompt. Returns an unref'd timer cleared on close.
function startStallWatchdog(chunks: string[], id: string, command: string): NodeJS.Timeout {
  let stall: StallState = { lastLen: 0, lastChangeMs: Date.now(), notified: false };
  const timer = setInterval(() => {
    try {
      const buf = chunks.join("");
      const r = checkStall({ prev: stall, curLen: buf.length, tail: buf, nowMs: Date.now() });
      stall = r.state;
      if (r.notify) {
        notify({ title: `Vanta · bg task ${id}`, message: `"${command.slice(0, 60)}" appears to be waiting for input (y/n)…` });
      }
    } catch {
      // best-effort: a watchdog tick must never break the task
    }
  }, STALL_POLL_MS);
  timer.unref();
  return timer;
}

// Background shell task execution.
// Spawns commands detached, writes output to .vanta/bg-tasks/<id>.{log,status}.
// The agent polls with bg_status; users see the list via /tasks or bg_list tool.

export type BgTaskStatus = "running" | "done" | "failed";

export type BgTask = {
  id: string;
  command: string;
  startedAt: string;
  pid?: number;
  status: BgTaskStatus;
  exitCode?: number;
};

function bgDir(dataDir: string): string {
  return join(dataDir, "bg-tasks");
}

function logPath(dataDir: string, id: string): string {
  return join(bgDir(dataDir), `${id}.log`);
}

function metaPath(dataDir: string, id: string): string {
  return join(bgDir(dataDir), `${id}.json`);
}

function genId(): string {
  return `bg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Spawn a command in the background, writing output to a log file. Returns the task id. */
export async function spawnBackground(
  command: string,
  dataDir: string,
  cwd: string,
): Promise<BgTask> {
  await mkdir(bgDir(dataDir), { recursive: true });
  const id = genId();
  const meta: BgTask = { id, command, startedAt: new Date().toISOString(), status: "running" };
  await writeFile(metaPath(dataDir, id), JSON.stringify(meta, null, 2));

  const logFile = logPath(dataDir, id);
  await writeFile(logFile, "");

  const child = spawn("sh", ["-c", command], {
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  meta.pid = child.pid;
  await writeFile(metaPath(dataDir, id), JSON.stringify(meta, null, 2));

  const chunks: string[] = [];
  child.stdout?.on("data", (d: Buffer) => chunks.push(d.toString()));
  child.stderr?.on("data", (d: Buffer) => chunks.push(d.toString()));

  // The live `chunks` buffer is the only place output exists while the task runs
  // (the log file stays empty until close), so the watchdog lives at the spawn site.
  const watchdog = startStallWatchdog(chunks, id, command);

  child.on("close", (code) => {
    clearInterval(watchdog);
    const done: BgTask = { ...meta, status: code === 0 ? "done" : "failed", exitCode: code ?? -1 };
    writeFile(metaPath(dataDir, id), JSON.stringify(done, null, 2)).catch(() => {});
    writeFile(logFile, chunks.join("")).catch(() => {});
  });

  child.unref();
  return meta;
}

/** Read current status of a background task. */
export async function readBgTask(dataDir: string, id: string): Promise<BgTask | null> {
  try {
    return JSON.parse(await readFile(metaPath(dataDir, id), "utf8")) as BgTask;
  } catch {
    return null;
  }
}

/** List all background tasks. */
export async function listBgTasks(dataDir: string): Promise<BgTask[]> {
  const dir = bgDir(dataDir);
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const tasks = await Promise.all(files.map((f) => readBgTask(dataDir, f.replace(/\.json$/, ""))));
  return tasks.filter(Boolean).sort((a, b) => (a!.startedAt > b!.startedAt ? -1 : 1)) as BgTask[];
}

/** Read log output of a background task (last N chars). */
export async function readBgLog(dataDir: string, id: string, maxChars = 4000): Promise<string> {
  try {
    const content = await readFile(logPath(dataDir, id), "utf8");
    return content.length > maxChars ? `…${content.slice(-maxChars)}` : content;
  } catch {
    return "(no output yet)";
  }
}

const BgListArgs = z.object({ status: z.enum(["all", "running", "done", "failed"]).optional() });

export const bgListTool: Tool = {
  schema: {
    name: "bg_list",
    description: "List background shell tasks spawned this session. Optionally filter by status (all|running|done|failed).",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["all", "running", "done", "failed"], description: "Filter by status (default all)" },
      },
    },
  },
  describeForSafety: () => "list background tasks",
  async execute(raw, ctx) {
    const parsed = BgListArgs.safeParse(raw);
    const filter = parsed.success ? (parsed.data.status ?? "all") : "all";
    const dataDir = join(ctx.root, ".vanta");
    const tasks = await listBgTasks(dataDir);
    const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
    if (!filtered.length) return { ok: true, output: `(no background tasks${filter !== "all" ? ` with status ${filter}` : ""})` };
    const lines = filtered.map((t) => `[${t.status}] ${t.id}  ${t.command.slice(0, 60)}`);
    return { ok: true, output: lines.join("\n") };
  },
};

const BgStatusArgs = z.object({ id: z.string().min(1), log: z.boolean().optional() });

export const bgStatusTool: Tool = {
  schema: {
    name: "bg_status",
    description: "Check the status and optionally tail the output log of a background task.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id from shell_cmd background run" },
        log: { type: "boolean", description: "Include the last 4000 chars of output (default false)" },
      },
      required: ["id"],
    },
  },
  describeForSafety: (a) => `check background task ${String(a.id ?? "")}`,
  async execute(raw, ctx) {
    const parsed = BgStatusArgs.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "bg_status needs an id" };
    const { id, log } = parsed.data;
    const dataDir = join(ctx.root, ".vanta");
    const task = await readBgTask(dataDir, id);
    if (!task) return { ok: false, output: `task ${id} not found` };
    let out = `[${task.status}] ${task.id}\ncommand: ${task.command}\nstarted: ${task.startedAt}`;
    if (task.exitCode !== undefined) out += `\nexit code: ${task.exitCode}`;
    if (log) out += `\n\n--- output ---\n${await readBgLog(dataDir, id)}`;
    return { ok: true, output: out };
  },
};
