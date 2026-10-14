import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dataDirFor } from "../cli/ops.js";
import { recordLearning } from "../learning/ledger.js";
import { LEARNED_TAG, writeSkill } from "../skills/store.js";
import { startControlHarness, type ControlHarness } from "./__fixtures__/control-harness.js";

let h: ControlHarness;
beforeEach(async () => { h = await startControlHarness(); });
afterEach(async () => { await h.stop(); });

async function memory(name: string, text: string): Promise<void> {
  await mkdir(join(h.home, "memories"), { recursive: true });
  await writeFile(join(h.home, "memories", name), text);
}

type Graph = { nodes: Array<Record<string, unknown>>; edges: unknown[]; clusters: Array<{ category: string; count: number }>; memory: Array<Record<string, unknown>>; stats: Record<string, number> };

describe("Memory Graph data", () => {
  it("serves skills as nodes (with usage and who made them), clusters by category, and memories as cards", async () => {
    await writeSkill({ name: "Invoice triage", description: "Triage invoices", body: "steps", tags: ["finance"] }, { env: process.env });
    await writeSkill({ name: "Learned trick", description: "Found it", body: "steps", tags: [LEARNED_TAG] }, { env: process.env });
    await recordLearning(dataDirFor(h.root), { ts: "2026-10-13T09:00:00Z", skill: "Learned trick", kind: "reused", adopted: true, reason: "x" });
    await memory("1.md", "# Prefers short answers\nKeep replies under five lines.");

    const graph = (await h.get("/api/learning/graph")).body as Graph;

    expect(graph.nodes.find((n) => n.id === "skill:Learned trick")).toMatchObject({ kind: "skill", useCount: 1, createdBy: "agent", state: "active", pinned: false });
    expect(graph.nodes.find((n) => n.id === "skill:Invoice triage")).toMatchObject({ category: "finance", createdBy: null });
    expect(graph.clusters).toEqual(expect.arrayContaining([{ category: "finance", count: 1 }, { category: "general", count: 1 }]));
    expect(graph.memory).toHaveLength(1);
    expect(graph.memory[0]).toMatchObject({ source: "memory", title: "Prefers short answers", fingerprint: "1.md" });
    expect(graph.stats).toMatchObject({ skills: 2, memories: 1, learned: 1 });
    expect(graph.edges).toEqual([]);
  });

  it("is empty, not an error, for a fresh home", async () => {
    const graph = (await h.get("/api/learning/graph")).body as Graph;

    expect(graph.nodes).toEqual([]);
    expect(graph.memory).toEqual([]);
  });

  it("skips empty memory files and anything that is not a plain .md name", async () => {
    await memory("2.md", "   \n");
    await memory("notes.txt", "not a memory");
    await memory("3.md", "Real one");

    const graph = (await h.get("/api/learning/graph")).body as Graph;

    expect(graph.memory.map((card) => card.fingerprint)).toEqual(["3.md"]);
  });

  it("returns a skill's instructions and a memory's text by node id", async () => {
    await writeSkill({ name: "Invoice triage", description: "d", body: "Step one: open the inbox." }, { env: process.env });
    await memory("1.md", "# Likes tea\nEarl Grey.");

    expect((await h.get("/api/learning/node?id=skill%3AInvoice%20triage")).body).toMatchObject({ ok: true, kind: "skill", label: "Invoice triage", content: expect.stringContaining("open the inbox") });
    expect((await h.get("/api/learning/node?id=memory%3A1.md")).body).toMatchObject({ ok: true, kind: "memory", label: "Likes tea" });
  });

  it("refuses ids that could leave the memories folder and names unknown ones", async () => {
    expect((await h.get("/api/learning/node?id=memory%3A..%2F..%2Fsettings.json")).status).toBe(400);
    expect((await h.get("/api/learning/node?id=memory%3A..%2Fsecret.md")).status).toBe(400);
    expect((await h.get("/api/learning/node?id=nothing")).status).toBe(400);
    expect((await h.get("/api/learning/node?id=skill%3Amissing")).status).toBe(404);
    expect((await h.get("/api/learning/node?id=memory%3A9.md")).status).toBe(404);
  });
});
