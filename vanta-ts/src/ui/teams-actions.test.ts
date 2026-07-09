import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStarterWorker, nextStarterWorkerId, reloadTeams, updateWorkerStatus } from "./teams-actions.js";
import type { Worker } from "../team/store.js";

describe("teams actions", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-teams-"));
    env = { VANTA_HOME: home };
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("chooses the next starter worker id", () => {
    expect(nextStarterWorkerId([{ id: "worker-1" }, { id: "worker-3" }] as Worker[])).toBe("worker-2");
  });

  it("creates a starter worker and updates status through the durable team store", async () => {
    const created = await createStarterWorker(env);
    expect(created.ok).toBe(true);
    let data = await reloadTeams(env);
    expect(data.workers[0]).toMatchObject({ id: "worker-1", role: "generalist", status: "idle" });

    const updated = await updateWorkerStatus(data.workers[0]!, "blocked", env);
    expect(updated.ok).toBe(true);
    data = await reloadTeams(env);
    expect(data.workers[0]).toMatchObject({ id: "worker-1", status: "blocked" });
  });
});
