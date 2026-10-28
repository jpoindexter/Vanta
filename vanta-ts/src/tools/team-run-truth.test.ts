import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentOutcome } from "../agent.js";
import { appendTask, latestTasks, readTasks, type WorkerTask } from "../team/tasks.js";
import type { ToolContext } from "./types.js";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("../subagent/spawn.js", () => ({ spawnSubagent: spawn }));
vi.mock("../providers/index.js", () => ({ resolveProvider: () => ({ modelId: () => "fixture" }) }));
vi.mock("./index.js", () => ({ buildRegistry: () => ({}) }));
import { doRun } from "./team-run.js";

let home: string;
let ctx: ToolContext;
let task: WorkerTask;
const complete: AgentOutcome = {
  finalText: "Worker finished", stoppedReason: "done", iterations: 1, toolIterations: 0,
  completionState: "unverified", usage: { inputTokens: 11, outputTokens: 7 },
};

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-team-truth-"));
  vi.stubEnv("VANTA_HOME", home);
  ctx = { root: home, signal: new AbortController().signal, requestApproval: vi.fn(), safety: {
    status: vi.fn(), assess: vi.fn(), getGoals: vi.fn(), addGoal: vi.fn(), completeGoal: vi.fn(),
    getApprovals: vi.fn(), proposeApproval: vi.fn(), approve: vi.fn(), deny: vi.fn(), logEvent: vi.fn(),
  } };
  const at = "2026-10-28T09:00:00.000Z";
  task = { kind: "task", id: "T-1", workerId: "worker", title: "Private task", status: "assigned", created: at, updated: at };
  await appendTask(task);
  spawn.mockReset().mockResolvedValue(complete);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

const incomplete: Partial<AgentOutcome>[] = [
  { stoppedReason: "interrupted", finalText: "Spawn refused by kernel: depth 7 exceeds 6" },
  { stoppedReason: "blocked", needsEffectReview: true },
  { stoppedReason: "done", needsEffectReview: true },
  { stoppedReason: "max_iterations" },
  { stoppedReason: "soft_stopped" },
  { stoppedReason: "tool_budget" },
  { stoppedReason: "done", completionState: "failed" },
];

it.each(incomplete)("does not complete an incomplete child: %j", async (patch) => {
  spawn.mockResolvedValue({ ...complete, ...patch });
  const result = await doRun(task.id, undefined, ctx);
  expect(result).toMatchObject({ ok: false, effectDisposition: "unknown", verification: { status: "unverified" } });
  expect(result.output).not.toContain("done by");
  expect(latestTasks(await readTasks())[0]?.status).toBe("blocked");
});

it("keeps ordinary completion usable and passes the current foreground signal", async () => {
  const result = await doRun(task.id, undefined, ctx);
  expect(result).toMatchObject({ ok: true, verification: { status: "unverified" } });
  expect(result.output).toContain("done by worker: Worker finished");
  expect(latestTasks(await readTasks())[0]).toMatchObject({ status: "done", result: "Worker finished" });
  expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ signal: ctx.signal, deps: expect.objectContaining({ root: ctx.root }) }));
  expect(complete.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
});

it("does not turn a thrown worker failure into proof of no partial effects", async () => {
  spawn.mockRejectedValue(new Error("connection lost after action"));
  const result = await doRun(task.id, undefined, ctx);
  expect(result).toMatchObject({ ok: false, effectDisposition: "unknown", verification: { status: "unverified" } });
  expect(latestTasks(await readTasks())[0]).toMatchObject({ status: "blocked", blocker: "connection lost after action" });
});

it("does not report success when a task's review gate refuses completion", async () => {
  await appendTask({ ...task, reviewStages: [{ name: "review", reviewerId: "operator", status: "pending" }] });
  const result = await doRun(task.id, undefined, ctx);
  expect(result.ok).toBe(false);
  expect(result.output).toContain("review stage(s) not approved");
  expect(latestTasks(await readTasks())[0]?.status).toBe("blocked");
});

it("preserves a stop recorded while the child was running", async () => {
  spawn.mockImplementation(async () => {
    await appendTask({ ...task, status: "stopped", blocker: "operator stopped task" });
    return complete;
  });
  const result = await doRun(task.id, undefined, ctx);
  expect(result.ok).toBe(false);
  expect(result.output).not.toContain(`task ${task.id} blocked:`);
  expect(latestTasks(await readTasks())[0]).toMatchObject({ status: "stopped", blocker: "operator stopped task" });
});

it("does not respawn a removed task by manufacturing an assigned status", async () => {
  await appendTask({ ...task, status: "removed" });
  expect((await doRun(task.id, undefined, ctx)).ok).toBe(false);
  expect(spawn).not.toHaveBeenCalled();
  expect(latestTasks(await readTasks())[0]?.status).toBe("removed");
});
