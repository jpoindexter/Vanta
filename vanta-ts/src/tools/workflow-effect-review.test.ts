import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolContext } from "./types.js";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("../subagent/spawn.js", () => ({ spawnSubagent: spawn }));
vi.mock("../providers/index.js", () => ({ resolveProvider: () => ({}) }));
vi.mock("./index.js", () => ({ buildRegistry: () => ({}) }));
const roots: string[] = [];
afterEach(async () => { spawn.mockReset(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("does not turn an uncertain subagent response into a successful node and continue the workflow", async () => {
  const { workflowTool } = await import("./workflow.js");
  const root = await mkdtemp(join(tmpdir(), "vanta-workflow-review-")); roots.push(root);
  spawn.mockResolvedValue({ finalText: "Done", stoppedReason: "blocked", needsEffectReview: true });
  const ctx: ToolContext = { root, requestApproval: async () => false,
    safety: { assess: async () => ({ risk: "allow", needsHuman: false, reason: "private fixture" }) } as unknown as ToolContext["safety"] };
  const spec = { id: "review-workflow", title: "Private", start: "first",
    nodes: [{ id: "first", type: "agent", instruction: "Handle action" }, { id: "second", type: "agent", instruction: "Must not run" }],
    transitions: [{ from: "first", to: "second", type: "next" }] };
  const result = await workflowTool.execute({ spec }, ctx);
  expect(result.ok).toBe(false);
  expect(spawn).toHaveBeenCalledOnce();
  expect(result.output).toContain("may have partially completed");
});
