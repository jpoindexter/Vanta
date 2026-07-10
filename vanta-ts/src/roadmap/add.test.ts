import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addRoadmapItem } from "./add.js";
import type { RoadmapItem } from "./schema.js";

const SEED = {
  updated: "2026-01-01",
  items: [{ id: "EXISTING", track: "Core", title: "An existing card", status: "next", size: "S", summary: "", done: "" }],
};

async function tempRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-roadmap-add-"));
  await writeFile(join(root, "roadmap.json"), JSON.stringify(SEED, null, 2) + "\n", "utf8");
  return root;
}

const card = (over: Partial<RoadmapItem> = {}): RoadmapItem => ({
  id: "NEW-CARD", track: "Backlog", title: "A new card", status: "next", size: "M", summary: "s", done: "d", ...over,
});

describe("addRoadmapItem", () => {
  it("appends a valid card, bumps updated, and regenerates roadmap.html", async () => {
    const root = await tempRepo();
    const item = await addRoadmapItem(root, card(), new Date("2026-06-07T00:00:00Z"));
    expect(item.id).toBe("NEW-CARD");
    const data = JSON.parse(await readFile(join(root, "roadmap.json"), "utf8"));
    expect(data.items.map((i: RoadmapItem) => i.id)).toEqual(["EXISTING", "NEW-CARD"]);
    expect(data.updated).toBe("2026-06-07");
    await expect(access(join(root, "roadmap.html"))).resolves.toBeUndefined();
  });

  it("refuses a duplicate id (case-insensitive)", async () => {
    const root = await tempRepo();
    await expect(addRoadmapItem(root, card({ id: "existing" }))).rejects.toThrow(/already exists/);
  });

  it("rejects a malformed card (bad status)", async () => {
    const root = await tempRepo();
    await expect(addRoadmapItem(root, card({ status: "bogus" as RoadmapItem["status"] }))).rejects.toThrow();
  });

  it("defaults parked additions to review reason", async () => {
    const root = await tempRepo();
    const item = await addRoadmapItem(root, card({ status: "parked" }));
    const data = JSON.parse(await readFile(join(root, "roadmap.json"), "utf8"));
    const added = data.items.find((i: RoadmapItem) => i.id === "NEW-CARD");
    expect(item.parkedReason).toBe("review");
    expect(added.parkedReason).toBe("review");
  });

  it("drops parkedReason when adding an active card", async () => {
    const root = await tempRepo();
    const item = await addRoadmapItem(root, card({ parkedReason: "external proof" }));
    const data = JSON.parse(await readFile(join(root, "roadmap.json"), "utf8"));
    const added = data.items.find((i: RoadmapItem) => i.id === "NEW-CARD");
    expect(item.parkedReason).toBeUndefined();
    expect(added.parkedReason).toBeUndefined();
  });
});
