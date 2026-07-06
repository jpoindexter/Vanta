import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enqueueJob, claimNextJob, completeJob, listJobs, runnerDir } from "./queue.js";
import { runRunnerLoop } from "./loop.js";
import type { Job } from "./queue.js";

// VANTA-SELF-HOSTED — job queue + polling loop.

async function tmpDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "vanta-runner-"));
}

describe("queue", () => {
  it("enqueue → claim oldest → complete posts the result back", async () => {
    const dataDir = await tmpDataDir();
    await enqueueJob(dataDir, { instruction: "first", id: "a", now: new Date("2026-07-06T10:00:00Z") });
    await enqueueJob(dataDir, { instruction: "second", id: "b", now: new Date("2026-07-06T10:01:00Z") });
    const claimed = await claimNextJob(dataDir);
    expect(claimed).toMatchObject({ id: "a", status: "running" });
    const finished = await completeJob(dataDir, claimed!, { ok: true, result: "42" });
    expect(finished).toMatchObject({ id: "a", status: "done", result: "42" });
    const all = await listJobs(dataDir);
    expect(all.map((j) => `${j.id}:${j.status}`).sort()).toEqual(["a:done", "b:queued"]);
  });

  it("claim is exclusive — a job claimed once is not claimable again", async () => {
    const dataDir = await tmpDataDir();
    await enqueueJob(dataDir, { instruction: "only", id: "solo" });
    const first = await claimNextJob(dataDir);
    const second = await claimNextJob(dataDir);
    expect(first?.id).toBe("solo");
    expect(second).toBeNull();
  });

  it("an externally-dropped job file (CI producer) is picked up; malformed files are skipped", async () => {
    const dataDir = await tmpDataDir();
    await enqueueJob(dataDir, { instruction: "seed", id: "zz-last" }); // ensures dirs + sorts after
    await writeFile(
      join(runnerDir(dataDir), "queued", "aa-ci.json"),
      JSON.stringify({ id: "aa-ci", instruction: "from CI", status: "queued", created: "2026-07-06T00:00:00Z", updated: "2026-07-06T00:00:00Z" }),
      "utf8",
    );
    await writeFile(join(runnerDir(dataDir), "queued", "ab-bad.json"), "{nope", "utf8");
    const claimed = await claimNextJob(dataDir);
    expect(claimed?.id).toBe("aa-ci");
    const next = await claimNextJob(dataDir); // skips the malformed file, claims the seed
    expect(next?.id).toBe("zz-last");
  });

  it("failed outcomes post back as status failed", async () => {
    const dataDir = await tmpDataDir();
    await enqueueJob(dataDir, { instruction: "boom", id: "f1" });
    const claimed = await claimNextJob(dataDir);
    const finished = await completeJob(dataDir, claimed!, { ok: false, result: "error: nope" });
    expect(finished.status).toBe("failed");
  });
});

describe("runRunnerLoop", () => {
  it("once-mode drains the queue oldest-first and posts results", async () => {
    const dataDir = await tmpDataDir();
    await enqueueJob(dataDir, { instruction: "one", id: "a" });
    await enqueueJob(dataDir, { instruction: "two", id: "b" });
    const seen: string[] = [];
    const ran = await runRunnerLoop({
      dataDir,
      once: true,
      execute: async (job: Job) => {
        seen.push(job.instruction);
        return { ok: true, result: `did:${job.instruction}` };
      },
    });
    expect(ran).toBe(2);
    expect(seen).toEqual(["one", "two"]);
    const done = (await listJobs(dataDir)).filter((j) => j.status === "done");
    expect(done.map((j) => j.result)).toEqual(["did:one", "did:two"]);
    expect(await readdir(join(runnerDir(dataDir), "running"))).toEqual([]);
  });

  it("a throwing executor marks the job failed and the loop continues", async () => {
    const dataDir = await tmpDataDir();
    await enqueueJob(dataDir, { instruction: "bad", id: "a" });
    await enqueueJob(dataDir, { instruction: "good", id: "b" });
    const ran = await runRunnerLoop({
      dataDir,
      once: true,
      execute: async (job) => {
        if (job.id === "a") throw new Error("kaboom");
        return { ok: true, result: "fine" };
      },
    });
    expect(ran).toBe(2);
    const byId = new Map((await listJobs(dataDir)).map((j) => [j.id, j]));
    expect(byId.get("a")).toMatchObject({ status: "failed", result: "error: kaboom" });
    expect(byId.get("b")).toMatchObject({ status: "done", result: "fine" });
  });

  it("polling mode sleeps when idle and stops at maxJobs", async () => {
    const dataDir = await tmpDataDir();
    const sleeps: number[] = [];
    // Enqueue a job only after the first idle sleep — proves the poll loop picks
    // up work that arrives later.
    let enqueued = false;
    const ran = await runRunnerLoop({
      dataDir,
      maxJobs: 1,
      intervalMs: 7,
      execute: async () => ({ ok: true, result: "ok" }),
      sleep: async (ms) => {
        sleeps.push(ms);
        if (!enqueued) {
          enqueued = true;
          await enqueueJob(dataDir, { instruction: "late", id: "late" });
        }
      },
    });
    expect(ran).toBe(1);
    expect(sleeps[0]).toBe(7);
    expect((await listJobs(dataDir))[0]).toMatchObject({ id: "late", status: "done" });
  });
});
