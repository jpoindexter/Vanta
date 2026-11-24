import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatWorkerInspection, inspectWorker, startWorkerInspection } from "./worker-inspection.js";
import { spawnSubagent } from "./spawn.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "../agent.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-worker-budget-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const options = () => ({ id: "budget-child", root, workerRoot: root, goal: "Read", instruction: "Read only",
  agentType: "research", model: "offline", declaredMaxIterations: 3 });
const path = () => join(root, ".vanta", "sidechains", "worker-budget-child.json");

describe("durable worker iteration allowance", () => {
  it("retains a reservation through tool-only checkpoints and finish without claiming other budgets", async () => {
    const store = await startWorkerInspection(options());
    await store.checkpoint([], 2);
    await store.checkpoint([{ role: "assistant", content: "Partial read" }]);
    await store.finish([], undefined, "Interrupted checkpoint");
    const before = await readFile(path(), "utf8");
    const inspection = (await inspectWorker(root, "budget-child"))!;
    expect(inspection.record).toMatchObject({ iterationsReserved: 2, remainingBudget: "unknown", continuationAllowed: false });
    expect(formatWorkerInspection(inspection)).toContain("reserved iterations 2; iteration allowance remaining 1");
    expect(formatWorkerInspection(inspection)).toContain("not provider-request or token/cost accounting");
    expect(await readFile(path(), "utf8")).toBe(before);
  });

  it("rejects a reduced, invalid or over-limit allowance without changing prior bytes", async () => {
    const store = await startWorkerInspection(options());
    await store.checkpoint([], 2);
    const before = await readFile(path(), "utf8");
    for (const reserved of [1, -1, 1.5, NaN, Infinity, 4]) {
      await expect(store.checkpoint([], reserved)).rejects.toThrow();
      expect(await readFile(path(), "utf8")).toBe(before);
    }
    await store.checkpoint([], 3);
    expect(formatWorkerInspection((await inspectWorker(root, "budget-child"))!))
      .toContain("reserved iterations 3; iteration allowance remaining 0");
  });

  it("keeps legacy counters unknown and rejects forged over-limit evidence on read", async () => {
    await startWorkerInspection(options());
    const raw = JSON.parse(await readFile(path(), "utf8"));
    delete raw.iterationsReserved;
    await writeFile(path(), JSON.stringify(raw));
    const inspection = (await inspectWorker(root, "budget-child"))!;
    expect(formatWorkerInspection(inspection)).toContain("reserved iterations unknown");
    const invalid = JSON.stringify({ ...raw, iterationsReserved: 4 });
    await writeFile(path(), invalid);
    await expect(inspectWorker(root, "budget-child")).rejects.toThrow();
    expect(await readFile(path(), "utf8")).toBe(invalid);
  });

  it("stops the actual loop before a second provider call when its reservation cannot be persisted", async () => {
    const complete = vi.fn(async () => {
      expect((await inspectWorker(root, "budget-child"))?.record.iterationsReserved).toBe(1);
      await writeFile(path(), "{changed evidence}");
      return { text: "", toolCalls: [], finishReason: "stop" as const };
    });
    const deps: AgentDeps = { root, registry: new InMemoryToolRegistry(), requestApproval: async () => false,
      provider: { complete, modelId: () => "offline", contextWindow: () => 100_000 },
      safety: {} as AgentDeps["safety"] };
    await expect(spawnSubagent({ goal: "Read", instruction: "Read only", deps, maxIterations: 3,
      inspection: { id: "budget-child", root, workerRoot: root },
      checkSpawn: async () => ({ allowed: true, reason: "Synthetic fixture", depth: 1, maxDepth: 6 }) }))
      .rejects.toThrow("changed");
    expect(complete).toHaveBeenCalledOnce();
    expect(await readFile(path(), "utf8")).toBe("{changed evidence}");
  });
});
