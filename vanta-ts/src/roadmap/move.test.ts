import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moveRoadmapItem } from "./move.js";

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

async function makeRoadmap(data = FIXTURE): Promise<string> {
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
});
