import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "./types.js";
import { workflowTool } from "./workflow.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("compose_workflow composer boundary", () => {
  it("saves, opens, diffs, and launches through a real kernel-gated tool", async () => {
    const root = await fixtureRoot();
    await writeFile(join(root, "README.md"), "COMPOSER_PROOF\n", "utf8");
    const requestApproval = vi.fn(async () => true);
    const assess = vi.fn(async () => ({ risk: "allow" as const, needsHuman: false, reason: "fixture" }));
    const ctx = { root, safety: { assess } as unknown as ToolContext["safety"], requestApproval };

    const first = graph(1, "Proof v1");
    expect((await workflowTool.execute({ mode: "save", spec: first }, ctx)).ok).toBe(true);
    expect((await workflowTool.execute({ mode: "open", workflow_id: "proof" }, ctx)).output).toContain("Proof v1");
    expect((await workflowTool.execute({ mode: "save", spec: graph(2, "Proof v2") }, ctx)).ok).toBe(true);
    expect((await workflowTool.execute({ mode: "diff", workflow_id: "proof", previous_revision: 1 }, ctx)).output).toContain('"changed":true');

    const launched = await workflowTool.execute({ mode: "launch", workflow_id: "proof", run_id: "composer-live" }, ctx);
    expect(launched.ok).toBe(true);
    expect(launched.output).toContain("COMPOSER_PROOF");
    expect(launched.output).toContain('"terminalState": "succeeded"');
    expect(assess).toHaveBeenCalledWith(expect.stringMatching(/read_file.*README\.md/));
    expect(launched.output).toContain('"fromNode": "manual"');
    expect(requestApproval).toHaveBeenCalledWith("Ship proof?", "workflow approval gate", "compose_workflow");
  });

  it("rejects an invalid composed graph before saving", async () => {
    const root = await fixtureRoot();
    const ctx = { root } as ToolContext;
    const invalid = { ...graph(1, "Invalid"), nodes: graph(1, "Invalid").nodes.slice(1) };
    const result = await workflowTool.execute({ mode: "save", spec: invalid }, ctx);
    expect(result).toMatchObject({ ok: false });
    expect(result.output).toContain("start references missing node: manual");
  });
});

function graph(revision: number, title: string) {
  return {
    id: "proof", revision, title, start: "manual",
    nodes: [
      { id: "manual", type: "trigger", event: "manual", input: { path: "README.md" }, io: { inputs: {}, outputs: { path: "string" } } },
      { id: "read", type: "action", tool: "read_file", args: {}, sideEffect: false, approval: "risk", io: { inputs: { path: "string" }, outputs: { content: "string" } }, bindings: { path: { node: "manual", output: "path" } } },
      { id: "gate", type: "approval", prompt: "Ship proof?", io: { inputs: { content: "string" }, outputs: {} } },
    ],
    transitions: [
      { type: "next", from: "manual", to: "read" },
      { type: "next", from: "read", to: "gate" },
    ],
  };
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-workflow-tool-composer-"));
  roots.push(root);
  return root;
}
