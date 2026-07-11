import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listDelegationTrees, recordDelegationNode, formatDelegationTree } from "./delegation-receipt.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("delegation tree receipts", () => {
  it("persists parent/child evidence and renders inspection controls", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-delegation-receipt-"));
    roots.push(root);
    await recordDelegationNode(root, {
      id: "child-1", treeId: "session-parent", parentId: "session-parent",
      parentTask: "Audit the release", childPrompt: "Inspect tests", model: "gpt-5.5",
      tools: ["read_file", "shell_cmd"], summary: "Tests pass", rawSidechain: ".vanta/sidechains/child.json",
      verification: "pass", stoppedReason: "done", durationMs: 1234, usage: { inputTokens: 10, outputTokens: 4 },
      createdAt: "2026-07-11T12:00:00.000Z",
    });

    const trees = await listDelegationTrees(root);
    expect(trees).toHaveLength(1);
    expect(trees[0]?.nodes[0]).toMatchObject({ parentTask: "Audit the release", rawSidechain: ".vanta/sidechains/child.json" });
    const output = formatDelegationTree(trees[0]!);
    expect(output).toContain("read_file, shell_cmd");
    expect(output).toContain("Tests pass");
    expect(output).toContain("replay: vanta agents delegation replay child-1");
    expect(output).toContain("follow-up: vanta agents delegation follow-up child-1");
  });

  it("groups sibling nodes under one parent tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-delegation-tree-"));
    roots.push(root);
    const base = { treeId: "tree", parentId: "parent", parentTask: "Research", model: "m", tools: [], rawSidechain: "raw.json", verification: "pass" as const, stoppedReason: "done", durationMs: 1, createdAt: "2026-07-11T12:00:00.000Z" };
    await recordDelegationNode(root, { ...base, id: "a", childPrompt: "A", summary: "A done" });
    await recordDelegationNode(root, { ...base, id: "b", childPrompt: "B", summary: "B done" });
    expect((await listDelegationTrees(root))[0]?.nodes.map((node) => node.id)).toEqual(["a", "b"]);
  });
});
