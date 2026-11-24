import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendTeam, type Worker } from "../team/store.js";
import { appendTask, latestTasks, readTasks, type WorkerTask } from "../team/tasks.js";
import { doRun } from "./team-run.js";
import type { ToolContext } from "./types.js";

let home: string;
let previous: string | undefined;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-team-run-"));
  previous = process.env.VANTA_HOME;
  process.env.VANTA_HOME = home;
});
afterEach(async () => {
  if (previous === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = previous;
  await rm(home, { recursive: true, force: true });
});

describe("team run honours a paused worker", () => {
  it("refuses to start the task and leaves it assigned", async () => {
    const at = "2026-10-13T10:00:00.000Z";
    await appendTeam({ kind: "worker", id: "dev", role: "Engineer", status: "idle", ts: at, paused: true } as Worker);
    await appendTask({ kind: "task", id: "T-1", workerId: "dev", title: "Do it", status: "assigned", created: at, updated: at } as WorkerTask);
    const result = await doRun("T-1", undefined, {} as ToolContext);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("worker dev is paused");
    expect(latestTasks(await readTasks()).find((t) => t.id === "T-1")?.status).toBe("assigned");
  });
});
