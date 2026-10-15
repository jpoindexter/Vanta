import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { decomposeGoal, runKanbanSwarm } from "./kanban.js";
import { formatKanbanDigest } from "./format.js";
import { latestKanbanId, loadKanbanBoard, saveKanbanBoard } from "./store.js";

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("kanban board", () => {
  it("decomposes a goal into durable workflow lanes", () => {
    const board = decomposeGoal("ship the operator surface", { now: () => new Date("2026-07-09T00:00:00.000Z") });
    expect(board.id).toContain("ship-the-operator-surface");
    expect(board.lanes.map((lane) => lane.id)).toEqual(["understand", "plan", "build", "verify", "ship"]);
    expect(board.lanes[0]?.instruction).toContain("Goal: ship the operator surface");
  });

  it("runs unfinished lanes in parallel and records a resumable swarm run", async () => {
    const started: string[] = [];
    const board = decomposeGoal("build kanban", { now: () => new Date("2026-07-09T00:00:00.000Z") });
    const next = await runKanbanSwarm(board, {
      now: () => new Date("2026-07-09T00:00:01.000Z"),
      runId: "swarm-test",
      runLane: async (lane) => {
        started.push(lane.id);
        await Promise.resolve();
        return { result: `ran ${lane.id}` };
      },
    });

    expect(started).toEqual(["understand", "plan", "build", "verify", "ship"]);
    expect(next.lanes.every((lane) => lane.status === "done")).toBe(true);
    expect(next.swarmRuns[0]?.id).toBe("swarm-test");
    expect(formatKanbanDigest(next)).toContain("5 done");
  });

  it("persists and resolves the latest board", async () => {
    tmp = await mkdtemp(join(tmpdir(), "vanta-kanban-"));
    const board = decomposeGoal("persist me", { now: () => new Date("2026-07-09T00:00:00.000Z") });
    saveKanbanBoard(tmp, board);

    expect(latestKanbanId(tmp)).toBe(board.id);
    expect(loadKanbanBoard(tmp, board.id).goal).toBe("persist me");
  });

  it("resolves latest by board update time rather than filename", async () => {
    tmp = await mkdtemp(join(tmpdir(), "vanta-kanban-"));
    const older = {
      ...decomposeGoal("older", { now: () => new Date("2026-07-09T00:00:00.000Z") }),
      id: "z-older",
    };
    const newer = {
      ...decomposeGoal("newer", { now: () => new Date("2026-07-10T00:00:00.000Z") }),
      id: "a-newer",
    };
    saveKanbanBoard(tmp, older);
    saveKanbanBoard(tmp, newer);
    expect(latestKanbanId(tmp)).toBe("a-newer");
  });
});
