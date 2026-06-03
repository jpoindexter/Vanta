import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRoadmap } from "./build.js";

describe("buildRoadmap", () => {
  it("reads roadmap.json, renders HTML, and returns the output path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argo-roadmap-"));
    try {
      const roadmap = {
        updated: "2026-06-03",
        items: [
          {
            id: "T1",
            track: "Core",
            title: "Test item",
            status: "next",
            size: "S",
            summary: "A summary.",
            done: "Done when tested.",
          },
        ],
      };
      await writeFile(join(dir, "roadmap.json"), JSON.stringify(roadmap), "utf8");
      const out = await buildRoadmap(dir);
      expect(out).toMatch(/roadmap\.html$/);
      const html = await readFile(out, "utf8");
      expect(html).toContain("Test item");
      expect(html).toContain("Done when tested.");
      expect(html).toContain("<!DOCTYPE html>");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("throws on invalid roadmap.json (empty items)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argo-roadmap-"));
    try {
      await writeFile(
        join(dir, "roadmap.json"),
        JSON.stringify({ updated: "2026-06-03", items: [] }),
        "utf8",
      );
      await expect(buildRoadmap(dir)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("throws when roadmap.json is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argo-roadmap-"));
    try {
      await expect(buildRoadmap(dir)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
