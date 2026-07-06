import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineQueue, loadQueue, listQueues, renderInstruction, queueSubdir } from "./work-queue.js";
import { enqueueJob, listJobs } from "../runner/queue.js";
import { runRunnerLoop } from "../runner/loop.js";

// PCLIP-WORK-QUEUES — a named queue accepts repeated inputs and routes each to
// its assigned worker, no one-off workflow per item.

async function tmpDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "vanta-wq-"));
}

describe("queue configs", () => {
  it("define → load → list round-trips", async () => {
    const dataDir = await tmpDataDir();
    const q = await defineQueue(dataDir, { name: "triage", workerId: "ana", template: "Triage this report: {input}" });
    expect(q).toMatchObject({ name: "triage", workerId: "ana" });
    expect(await loadQueue(dataDir, "triage")).toMatchObject({ workerId: "ana" });
    expect((await listQueues(dataDir)).map((x) => x.name)).toEqual(["triage"]);
  });

  it("rejects non-slug names as an error value", async () => {
    const q = await defineQueue(await tmpDataDir(), { name: "Bad Name", workerId: "ana" });
    expect(q).toHaveProperty("error");
  });

  it("renderInstruction substitutes {input} (or appends when the template lacks it)", () => {
    const base = { name: "t", workerId: "w", created: "2026-07-06" };
    expect(renderInstruction({ ...base, template: "Review: {input} now" }, "issue 7")).toBe("Review: issue 7 now");
    expect(renderInstruction({ ...base, template: "Summarize the following" }, "text")).toBe("Summarize the following\n\ntext");
  });
});

describe("routing repeated inputs", () => {
  it("each pushed item routes through the queue's executor; items are isolated per queue", async () => {
    const dataDir = await tmpDataDir();
    await defineQueue(dataDir, { name: "triage", workerId: "ana" });
    await defineQueue(dataDir, { name: "other", workerId: "bo" });
    await enqueueJob(dataDir, { instruction: "report A", id: "a", subdir: queueSubdir("triage") });
    await enqueueJob(dataDir, { instruction: "report B", id: "b", subdir: queueSubdir("triage") });
    await enqueueJob(dataDir, { instruction: "elsewhere", id: "x", subdir: queueSubdir("other") });

    const routed: string[] = [];
    const ran = await runRunnerLoop({
      dataDir,
      subdir: queueSubdir("triage"),
      once: true,
      execute: async (job) => {
        routed.push(job.instruction);
        return { ok: true, result: `handled ${job.id}` };
      },
    });
    expect(ran).toBe(2);
    expect(routed).toEqual(["report A", "report B"]); // repeated inputs, one route
    const triage = await listJobs(dataDir, { subdir: queueSubdir("triage") });
    expect(triage.every((j) => j.status === "done")).toBe(true);
    const other = await listJobs(dataDir, { subdir: queueSubdir("other") });
    expect(other[0]).toMatchObject({ id: "x", status: "queued" }); // untouched
  });
});
