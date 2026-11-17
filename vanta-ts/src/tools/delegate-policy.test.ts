import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolContext } from "./types.js";

const probe = vi.hoisted(() => ({ root: "", cleanup: vi.fn(), spawn: vi.fn() }));
vi.mock("../providers/index.js", () => ({ resolveProvider: () => ({}) }));
vi.mock("../subagent/spawn.js", () => ({ spawnSubagent: probe.spawn }));
vi.mock("../worktree/manager.js", () => ({
  createWorktree: async () => ({ path: probe.root, cleanup: probe.cleanup }),
}));
import { delegateTool } from "./delegate.js";

afterEach(async () => {
  vi.unstubAllEnvs();
  if (probe.root) await rm(probe.root, { recursive: true, force: true });
  probe.root = "";
  vi.clearAllMocks();
});

it("rejects corrupt worker policy before spawning and still cleans its isolated worktree", async () => {
  probe.root = await mkdtemp(join(tmpdir(), "vanta-delegate-policy-"));
  vi.stubEnv("VANTA_HOME", probe.root);
  probe.cleanup.mockResolvedValue(undefined);
  const path = join(probe.root, "settings.json");
  await writeFile(path, '{"blockedTools":');
  const result = await delegateTool.execute({ goal: "fixture", instruction: "fixture", isolation: "worktree" }, {
    root: probe.root,
  } as ToolContext);
  expect(result).toEqual({ ok: false, output: expect.stringContaining(path) });
  expect(probe.spawn).not.toHaveBeenCalled();
  expect(probe.cleanup).toHaveBeenCalledOnce();
});
