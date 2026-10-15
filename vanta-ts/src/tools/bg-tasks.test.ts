import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBgLog, readBgTask, spawnBackground } from "./bg-tasks.js";

describe("spawnBackground", () => {
  it("runs a supplied sandbox invocation and cleans it up after exit", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-bg-sandbox-"));
    let cleanupCalls = 0;
    try {
      const task = await spawnBackground("display command", join(root, ".vanta"), root, {
        cmd: process.execPath,
        args: ["-e", 'process.stdout.write("sandboxed background")'],
        cleanup: async () => { cleanupCalls += 1; },
      });
      const done = await waitForTask(join(root, ".vanta"), task.id);
      expect(done.status).toBe("done");
      expect(await readBgLog(join(root, ".vanta"), task.id)).toContain("sandboxed background");
      expect(cleanupCalls).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function waitForTask(dataDir: string, id: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const task = await readBgTask(dataDir, id);
    if (task && task.status !== "running") return task;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`background task ${id} did not finish`);
}
