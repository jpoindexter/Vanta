import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addAutoWatch, loadAutoWatch, runAutoWatch } from "./auto-watch.js";

describe("auto-watch", () => {
  it("detects changed watcher output, drafts a response, and autonomy-gates it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-auto-watch-"));
    let output = "state one";
    try {
      await addAutoWatch(dir, { id: "repo", kind: "repo", risk: "medium", command: "ignored", draft: "Draft repo response." });
      expect(await runAutoWatch(dir, async () => output)).toEqual([]);

      output = "state two";
      const changes = await runAutoWatch(dir, async () => output);
      expect(changes).toHaveLength(1);
      expect(changes[0]?.draft).toContain("Draft repo response.");
      expect(changes[0]?.draft).toContain("state two");
      expect(changes[0]?.lane).toBe("queues-for-approval");
      expect((await loadAutoWatch(dir)).watchers[0]?.lastOutput).toBe("state two");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
