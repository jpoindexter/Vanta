import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkflowGraph } from "./schema.js";
import { newGraphRunState, nodeStateView, validateNodeWrites } from "./run-state.js";
import { commitGraphRunNode, createGraphRunState, GraphRunConflictError, graphRunStatePath, loadGraphRunState } from "./run-state-store.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("graph run state store", () => {
  it("persists typed state, provenance, artifacts, approvals, and budget fields", async () => {
    const root = await fixtureRoot();
    const initial = newGraphRunState(graph(), "run-1", "2026-07-20T12:00:00.000Z", 2);
    await createGraphRunState(root, initial);
    const updated = await commitGraphRunNode(root, "run-1", commit("research", 0, { findings: ["a"] }));
    expect(updated).toMatchObject({ version: 1, graphRevision: 3, revision: 1, budget: { limitUsd: 2, usedUsd: 0 } });
    expect(updated.values.findings).toEqual(["a"]);
    expect(updated.artifacts[0]).toMatchObject({ id: "artifact-a", revision: "sha256:a" });
    expect(updated.attempts).toHaveLength(1);
    expect(updated.mutations[0]?.fields).toEqual(["findings"]);
  });

  it("merges disjoint fan-out writes and rejects same-field conflicts", async () => {
    const root = await fixtureRoot();
    await createGraphRunState(root, newGraphRunState(graph(), "fanout", "2026-07-20T12:00:00.000Z"));
    await Promise.all([
      commitGraphRunNode(root, "fanout", commit("research", 0, { findings: ["one"] })),
      commitGraphRunNode(root, "fanout", commit("build", 0, { draft: "two" })),
    ]);
    const merged = await loadGraphRunState(root, "fanout");
    expect(merged?.values).toMatchObject({ findings: ["one"], draft: "two" });
    await expect(commitGraphRunNode(root, "fanout", commit("research", 0, { findings: ["stale"] }))).rejects.toBeInstanceOf(GraphRunConflictError);
  });

  it("exposes only declared fields and requires opaque secret references", () => {
    const spec = graph();
    const run = newGraphRunState(spec, "scope", "2026-07-20T12:00:00.000Z");
    run.values = { findings: ["x"], credential: { secretRef: "keychain://openai" }, draft: "hidden" };
    expect(nodeStateView(spec, spec.nodes[0]!, run)).toEqual({ credential: { secretRef: "keychain://openai" } });
    expect(() => validateNodeWrites(spec, spec.nodes[0]!, { credential: "raw-secret" })).toThrow(/cannot write/);
    expect(() => validateNodeWrites(spec, spec.nodes[1]!, { credential: "raw-secret" })).toThrow(/invalid secret-ref/);
  });

  it("migrates a version-zero state on load", async () => {
    const root = await fixtureRoot();
    const current = newGraphRunState(graph(), "legacy", "2026-07-20T12:00:00.000Z") as unknown as Record<string, unknown>;
    current.version = 0;
    delete current.fieldRevisions;
    delete current.mutations;
    const path = graphRunStatePath(root, "legacy");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(current));
    expect(await loadGraphRunState(root, "legacy")).toMatchObject({ version: 1, fieldRevisions: {}, mutations: [] });
  });
});

function graph(): WorkflowGraph {
  return {
    id: "shared", revision: 3, title: "Shared state", start: "research",
    state: { version: 1, fields: {
      findings: { type: "json" }, draft: { type: "string" }, credential: { type: "secret-ref", redact: true },
    } },
    nodes: [
      { id: "research", type: "agent", instruction: "Research", state: { read: ["credential"], write: ["findings"] } },
      { id: "build", type: "agent", instruction: "Build", state: { read: ["findings"], write: ["draft", "credential"] } },
    ],
    transitions: [{ type: "next", from: "research", to: "build" }],
  };
}

function commit(nodeId: string, expectedRevision: number, writes: Record<string, unknown>) {
  return {
    expectedRevision, nodeId, attempt: 1,
    startedAt: "2026-07-20T12:00:00.000Z", finishedAt: "2026-07-20T12:00:01.000Z",
    result: { nodeId, type: "agent" as const, status: "ok" as const, output: `${nodeId} done` }, writes,
    artifacts: [{ id: "artifact-a", uri: "vanta-artifact://a", revision: "sha256:a" }],
  };
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-graph-run-"));
  roots.push(root);
  return root;
}
