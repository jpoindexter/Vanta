import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runWorkflowRunCommand } from "./workflow-run-cmd.js";
import { createGraphRunState } from "../workflow/run-state-store.js";
import { newGraphRunState } from "../workflow/run-state.js";
import type { WorkflowGraph } from "../workflow/schema.js";

const graph = { id: "cli-proof", title: "CLI proof", start: "node", nodes: [{ id: "node", type: "agent", instruction: "work" }], transitions: [] } as WorkflowGraph;

describe("workflow-run CLI", () => {
  it("lists, inspects, controls, and exports one durable run", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-workflow-cli-"));
    await createGraphRunState(join(root, ".vanta"), newGraphRunState(graph, "cli-run", "2026-07-20T12:00:00.000Z"));
    const lines: string[] = [];
    const write = vi.fn(async () => undefined) as never;
    const deps = { log: (line: string) => lines.push(line), write, now: () => new Date("2026-07-20T12:01:00.000Z") };
    expect(await runWorkflowRunCommand(root, ["list"], deps)).toBe(0);
    expect(await runWorkflowRunCommand(root, ["inspect", "cli-run"], deps)).toBe(0);
    expect(await runWorkflowRunCommand(root, ["pause", "cli-run"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("cli-run");
    expect(lines.join("\n")).toContain("pause requested");
    expect(await runWorkflowRunCommand(root, ["export", "cli-run", "--out", "handoff.txt"], deps)).toBe(0);
    expect(write).toHaveBeenCalledWith("handoff.txt", expect.stringContaining("Graph run cli-run"), "utf8");
  });
});
