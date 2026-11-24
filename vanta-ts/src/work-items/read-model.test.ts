import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkItemProjection } from "./read-model.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("canonical WorkItem read model", () => {
  it("returns the latest valid row per WorkItem and reports invalid rows", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-work-projection-"));
    roots.push(root);
    await mkdir(join(root, ".vanta"));
    const row = (state: "queued" | "verified", at: string) => JSON.stringify({
      version: 1,
      id: "goal:1:turn:1",
      outcome: "Finish the goal",
      source: "goal:1",
      state,
      updatedAt: at,
    });
    await writeFile(join(root, ".vanta", "work-items.jsonl"), [
      row("queued", "2026-08-02T12:00:00.000Z"),
      "{not-json",
      row("verified", "2026-08-02T12:01:00.000Z"),
      "",
    ].join("\n"));

    const result = await readWorkItemProjection(root);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "goal:1:turn:1", state: "verified" });
    expect(result.invalidRows).toBe(1);
  });

  it("treats a missing projection as empty rather than verified", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-work-projection-"));
    roots.push(root);
    await expect(readWorkItemProjection(root)).resolves.toEqual({ items: [], invalidRows: 0 });
  });
});
