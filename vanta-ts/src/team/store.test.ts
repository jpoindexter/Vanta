import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendTeam, readTeam, latestWorkers, byStatus, blocked } from "./store.js";

describe("team store", () => {
  let env: NodeJS.ProcessEnv;
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-team-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it("appends + reads workers", async () => {
    await appendTeam({ kind: "worker", id: "scraper", role: "web scraper", status: "idle", ts: "t1" }, env);
    const recs = await readTeam(env);
    expect(recs).toHaveLength(1);
    expect(recs[0]!.id).toBe("scraper");
  });

  it("last-write-wins per worker id", async () => {
    await appendTeam({ kind: "worker", id: "w1", role: "old role", status: "idle", ts: "t1" }, env);
    await appendTeam({ kind: "worker", id: "w1", role: "new role", status: "running", ts: "t2" }, env);
    const workers = latestWorkers(await readTeam(env));
    expect(workers).toHaveLength(1);
    expect(workers[0]!.role).toBe("new role");
    expect(workers[0]!.status).toBe("running");
  });

  it("byStatus filters to matching status", async () => {
    await appendTeam({ kind: "worker", id: "a", role: "alpha", status: "idle", ts: "t1" }, env);
    await appendTeam({ kind: "worker", id: "b", role: "beta", status: "blocked", ts: "t2" }, env);
    const recs = await readTeam(env);
    expect(byStatus(recs, "idle").map((w) => w.id)).toEqual(["a"]);
    expect(byStatus(recs, "blocked").map((w) => w.id)).toEqual(["b"]);
  });

  it("blocked returns only blocked workers", async () => {
    await appendTeam({ kind: "worker", id: "x", role: "runner", status: "running", ts: "t1" }, env);
    await appendTeam({ kind: "worker", id: "y", role: "blocker", status: "blocked", ts: "t2" }, env);
    const recs = await readTeam(env);
    expect(blocked(recs).map((w) => w.id)).toEqual(["y"]);
  });

  it("readTeam on a missing file returns []", async () => {
    expect(await readTeam(env)).toEqual([]);
  });
});
