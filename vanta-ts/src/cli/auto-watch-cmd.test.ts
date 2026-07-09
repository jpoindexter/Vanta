import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAutoWatchCommand } from "./auto-watch-cmd.js";

describe("runAutoWatchCommand", () => {
  it("adds a watcher and surfaces a changed command output", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-auto-watch-cli-"));
    const state = join(root, "state.txt");
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line = "") => { logs.push(String(line)); });
    try {
      await writeFile(state, "one");
      expect(await runAutoWatchCommand(root, ["add", "repo", "--kind", "repo", "--risk", "medium", "--cmd", `cat ${state}`, "--draft", "Draft it."])).toBe(0);
      expect(await runAutoWatchCommand(root, ["run"])).toBe(0);
      await writeFile(state, "two");
      expect(await runAutoWatchCommand(root, ["run"])).toBe(0);
      expect(logs.join("\n")).toContain("watch repo: queues-for-approval");
      expect(logs.join("\n")).toContain("Draft it.");
    } finally {
      spy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});
