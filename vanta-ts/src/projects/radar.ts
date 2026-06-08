import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readStack } from "../task-stack/store.js";
import type { TaskStack } from "../task-stack/types.js";

const run = promisify(execFile);

export type ProjectSignal = {
  roomId: string;
  name: string;
  signal: "idle" | "near-done" | "active" | "blocked";
  lastSeen?: string;
  detail: string;
};

const NEAR_DONE_RE = /ship|done|final|last|close/i;

type Classification = {
  signal: ProjectSignal["signal"];
  detail: string;
  lastSeen?: string;
};

/** Pure classifier — extracted for testability. */
export function classifyStack(stack: TaskStack): Classification {
  const tasks = stack.tasks;

  // lastSeen = max updatedAt (ISO-8601 strings sort lexicographically)
  const lastSeen = tasks.reduce<string | undefined>((max, t) => {
    return max === undefined || t.updatedAt > max ? t.updatedAt : max;
  }, undefined);

  // idle: no tasks OR all tasks are closed/parked
  const idle =
    tasks.length === 0 ||
    tasks.every((t) => t.status === "closed" || t.status === "parked");

  if (idle) {
    return {
      signal: "idle",
      lastSeen,
      detail:
        tasks.length === 0
          ? "no tasks in stack"
          : `all ${tasks.length} task(s) closed or parked`,
    };
  }

  // near-done: any active task whose nextAction mentions a ship/done keyword
  const nearDoneTask = tasks.find(
    (t) =>
      t.status === "active" &&
      t.nextAction != null &&
      NEAR_DONE_RE.test(t.nextAction),
  );
  if (nearDoneTask) {
    return {
      signal: "near-done",
      lastSeen,
      detail: `"${nearDoneTask.nextAction}" — ${nearDoneTask.title}`,
    };
  }

  // blocked: any blocked task
  const blockedTask = tasks.find((t) => t.status === "blocked");
  if (blockedTask) {
    return {
      signal: "blocked",
      lastSeen,
      detail: blockedTask.blocker
        ? `blocked: ${blockedTask.blocker}`
        : `blocked: ${blockedTask.title}`,
    };
  }

  const activeTasks = tasks.filter((t) => t.status === "active");
  return {
    signal: "active",
    lastSeen,
    detail: `${activeTasks.length} active task(s)`,
  };
}

async function gitDirtiness(projectPath: string): Promise<string> {
  try {
    const { stdout } = await run(
      "git",
      ["-C", projectPath, "status", "--short"],
      { timeout: 1000 },
    );
    const lines = stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return "clean";
    return `${lines.length} uncommitted`;
  } catch {
    return "unknown";
  }
}

/**
 * Scan all project dirs under projectsDir and classify each.
 * Gracefully skips dirs that are unreadable or have no .vanta stack.
 */
export async function scanProjectSignals(
  projectsDir: string,
): Promise<ProjectSignal[]> {
  let entries;
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs = entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const signals = await Promise.all(
    dirs.map(async (entry): Promise<ProjectSignal> => {
      const projectPath = join(projectsDir, entry.name);
      const dataDir = join(projectPath, ".vanta");

      const [stack, git] = await Promise.all([
        readStack(dataDir),
        gitDirtiness(projectPath),
      ]);

      const { signal, detail, lastSeen } = classifyStack(stack);
      const detailWithGit = `${detail} (git: ${git})`;

      return {
        roomId: entry.name,
        name: entry.name,
        signal,
        lastSeen,
        detail: detailWithGit,
      };
    }),
  );

  return signals;
}

const SIGNAL_EMOJI: Record<ProjectSignal["signal"], string> = {
  idle: "🟡",
  blocked: "🔴",
  "near-done": "🟢",
  active: "●",
};

/** Format one line per project. Pure. */
export function formatRadar(signals: ProjectSignal[]): string {
  if (signals.length === 0) return "no projects found";
  return signals
    .map((s) => {
      const emoji = SIGNAL_EMOJI[s.signal];
      const when = s.lastSeen ? ` [${s.lastSeen.slice(0, 10)}]` : "";
      return `${emoji} ${s.roomId}${when} — ${s.detail}`;
    })
    .join("\n");
}
