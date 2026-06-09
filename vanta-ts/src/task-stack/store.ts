import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { TaskStackSchema, OperatorTaskSchema } from "./types.js";
import type { TaskStack, OperatorTask, TaskStatus } from "./types.js";

// Project-scoped persistence: <repoRoot>/.vanta/task-stack.json
// dataDir = join(repoRoot, ".vanta") — injected by callers, never derived here.
// Tests inject a temp dir. Production uses dataDirFor(repoRoot) from cli/ops.ts.

const STACK_FILE = "task-stack.json";

export type StoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function stackPath(dataDir: string): string {
  return join(dataDir, STACK_FILE);
}

/** Read the task stack from disk. Returns an empty stack on missing or corrupt file. */
export async function readStack(dataDir: string): Promise<TaskStack> {
  try {
    const raw: unknown = JSON.parse(await readFile(stackPath(dataDir), "utf8"));
    const parsed = TaskStackSchema.safeParse(raw);
    return parsed.success ? parsed.data : { tasks: [] };
  } catch {
    return { tasks: [] };
  }
}

async function writeStack(dataDir: string, stack: TaskStack): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(stackPath(dataDir), JSON.stringify(stack, null, 2), "utf8");
}

export type AddTaskInput = {
  title: string;
  why: string;
  source?: OperatorTask["source"];
  priority?: OperatorTask["priority"];
  confidence?: OperatorTask["confidence"];
  nextAction?: string;
  relatedRoadmapId?: string;
  relatedFiles?: string[];
};

/** Add a new task. Returns the created task. */
export async function addTask(
  dataDir: string,
  input: AddTaskInput,
  now: () => string = () => new Date().toISOString(),
): Promise<StoreResult<OperatorTask>> {
  const ts = now();
  const raw = {
    id: randomUUID(),
    title: input.title.trim(),
    status: "pending" as const,
    source: input.source ?? "user",
    createdAt: ts,
    updatedAt: ts,
    why: input.why.trim(),
    priority: input.priority,
    confidence: input.confidence,
    nextAction: input.nextAction,
    relatedRoadmapId: input.relatedRoadmapId,
    relatedFiles: input.relatedFiles,
  };

  const parsed = OperatorTaskSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  const stack = await readStack(dataDir);
  stack.tasks.push(parsed.data);
  await writeStack(dataDir, stack);
  return { ok: true, value: parsed.data };
}

function findTask(stack: TaskStack, id: string): OperatorTask | undefined {
  return stack.tasks.find((t) => t.id === id);
}

function patchTask(
  stack: TaskStack,
  id: string,
  patch: Partial<OperatorTask>,
  now: string,
): TaskStack {
  return {
    tasks: stack.tasks.map((t) =>
      t.id === id ? { ...t, ...patch, updatedAt: now, lastTouchedAt: now } : t,
    ),
  };
}

function transition(
  id: string,
  toStatus: TaskStatus,
  extraPatch: Partial<OperatorTask> = {},
) {
  return async (
    dataDir: string,
    now: () => string = () => new Date().toISOString(),
  ): Promise<StoreResult<OperatorTask>> => {
    const stack = await readStack(dataDir);
    const task = findTask(stack, id);
    if (!task) return { ok: false, error: `task not found: ${id}` };
    const ts = now();
    const next = patchTask(stack, id, { status: toStatus, ...extraPatch }, ts);
    await writeStack(dataDir, next);
    const updated = findTask(next, id)!;
    return { ok: true, value: updated };
  };
}

/** Mark a task closed. */
export function closeTask(id: string) {
  return transition(id, "closed");
}

/** Mark a task blocked with an explicit reason. */
export function blockTask(id: string, reason: string) {
  return transition(id, "blocked", { blocker: reason });
}

/** Park a task (deferred, not deleted). */
export function parkTask(id: string) {
  return transition(id, "parked");
}

/** Re-open a parked or blocked task as pending. */
export function reopenTask(id: string) {
  return transition(id, "pending", { blocker: undefined });
}

/**
 * Touch a task — update lastTouchedAt without changing status.
 * Signals recent attention; biases selectNextTask away from it.
 */
export async function touchTask(
  id: string,
  dataDir: string,
  now: () => string = () => new Date().toISOString(),
): Promise<StoreResult<OperatorTask>> {
  const stack = await readStack(dataDir);
  const task = findTask(stack, id);
  if (!task) return { ok: false, error: `task not found: ${id}` };
  const ts = now();
  const next = patchTask(stack, id, {}, ts);
  await writeStack(dataDir, next);
  return { ok: true, value: findTask(next, id)! };
}
