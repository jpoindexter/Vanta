import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoadmapDependencyError, moveRoadmapItem } from "./move.js";

const FIXTURE = {
  updated: "2026-01-01",
  items: [
    {
      id: "ND2",
      track: "Executive Function",
      title: "clarify tool",
      status: "next",
      size: "S",
      summary: "A summary.",
      done: "Done when asked.",
    },
    {
      id: "KANBAN",
      track: "Core UX",
      title: "Live roadmap kanban",
      status: "next",
      size: "M",
      summary: "Kanban.",
      done: "Move works.",
    },
  ],
};

let dir: string;

async function makeRoadmap(data: unknown = FIXTURE): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "vanta-move-"));
  await writeFile(join(dir, "roadmap.json"), JSON.stringify(data, null, 2), "utf8");
  return dir;
}

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("moveRoadmapItem", () => {
  it("updates the item status and returns the updated item", async () => {
    const root = await makeRoadmap();
    const item = await moveRoadmapItem(root, "ND2", "building");
    expect(item.id).toBe("ND2");
    expect(item.status).toBe("building");
  });

  it("persists the new status to roadmap.json", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "ND2", "shipped");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    const nd2 = data.items.find((i: { id: string }) => i.id === "ND2");
    expect(nd2.status).toBe("shipped");
  });

  it("adds a review parkedReason when moving a card to parked", async () => {
    const root = await makeRoadmap();
    const item = await moveRoadmapItem(root, "ND2", "parked");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    const nd2 = data.items.find((i: { id: string }) => i.id === "ND2");
    expect(item.parkedReason).toBe("review");
    expect(nd2.parkedReason).toBe("review");
  });

  it("removes parkedReason when moving a card out of parked", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [{ ...FIXTURE.items[0], status: "parked", parkedReason: "review" }],
    });
    const item = await moveRoadmapItem(root, "ND2", "next");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    const nd2 = data.items.find((i: { id: string }) => i.id === "ND2");
    expect(item.parkedReason).toBeUndefined();
    expect(nd2.parkedReason).toBeUndefined();
  });

  it("updates the top-level updated field to today", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "ND2", "next");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    expect(data.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.updated).toBe(new Date().toISOString().slice(0, 10));
  });

  it("regenerates roadmap.html", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "KANBAN", "building");
    const { access } = await import("node:fs/promises");
    await expect(access(join(root, "roadmap.html"))).resolves.toBeUndefined();
  });

  it("throws when the id does not exist", async () => {
    const root = await makeRoadmap();
    await expect(moveRoadmapItem(root, "NOPE", "next")).rejects.toThrow(
      "no item with id 'NOPE'",
    );
  });

  it("does not mutate other items", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "ND2", "shipped");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    const kanban = data.items.find((i: { id: string }) => i.id === "KANBAN");
    expect(kanban.status).toBe("next");
  });

  it("preserves each item's existing key order to avoid unrelated diff churn", async () => {
    const original = { updated: "2026-01-01", items: [{ ...FIXTURE.items[0], source: "audit", updated: "2026-01-01", notes: "proof" }, { ...FIXTURE.items[1], notes: "proof", source: "audit" }] };
    const root = await makeRoadmap(original);
    await moveRoadmapItem(root, "ND2", "building");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const written = JSON.parse(raw) as typeof original;
    expect(written.items.map(Object.keys)).toEqual(original.items.map(Object.keys));
  });

  it("blocks moving to building while after dependencies are open", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [
        { ...FIXTURE.items[0], id: "FOUNDATION", status: "next" },
        { ...FIXTURE.items[1], id: "LAUNCH", status: "next", after: ["FOUNDATION"] },
      ],
    });

    await expect(moveRoadmapItem(root, "LAUNCH", "building")).rejects.toThrow(RoadmapDependencyError);
    await expect(moveRoadmapItem(root, "LAUNCH", "building")).rejects.toThrow("FOUNDATION (next)");
  });

  it("allows moving to building after dependencies ship", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [
        { ...FIXTURE.items[0], id: "FOUNDATION", status: "shipped" },
        { ...FIXTURE.items[1], id: "LAUNCH", status: "next", after: ["FOUNDATION"] },
      ],
    });

    const item = await moveRoadmapItem(root, "LAUNCH", "building");
    expect(item.status).toBe("building");
  });

  it("force overrides open dependency blocks", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [
        { ...FIXTURE.items[0], id: "FOUNDATION", status: "next" },
        { ...FIXTURE.items[1], id: "LAUNCH", status: "next", after: ["FOUNDATION"] },
      ],
    });

    const item = await moveRoadmapItem(root, "LAUNCH", "building", { force: true });
    expect(item.status).toBe("building");
  });
});
