import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasArtifactSchema, canvasArtifactPath, readCanvasArtifact, writeCanvasArtifact } from "./artifact.js";

const roots: string[] = [];
async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "vanta-canvas-"));
  roots.push(path);
  return path;
}

afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("canvas artifact", () => {
  it("round-trips a bounded chart", async () => {
    const dir = await root();
    const artifact = CanvasArtifactSchema.parse({
      version: 1, id: "chart-1", kind: "chart", title: "Quarterly revenue",
      createdAt: "2026-07-10T12:00:00.000Z", source: { tool: "render_canvas" },
      chart: { type: "bar", categories: ["Q1", "Q2"], series: [{ name: "Revenue", values: [12, 18] }] },
    });
    await writeCanvasArtifact(dir, artifact);
    await expect(readCanvasArtifact(dir)).resolves.toEqual(artifact);
  });

  it("rejects chart series that do not align with categories", () => {
    const result = CanvasArtifactSchema.safeParse({
      version: 1, id: "bad", kind: "chart", title: "Bad chart",
      createdAt: "2026-07-10T12:00:00.000Z", source: { tool: "render_canvas" },
      chart: { type: "line", categories: ["A", "B"], series: [{ name: "Only one", values: [1] }] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative chart values that the renderer cannot represent", () => {
    const result = CanvasArtifactSchema.safeParse({
      version: 1, id: "negative", kind: "chart", title: "Negative chart",
      createdAt: "2026-07-10T12:00:00.000Z", source: { tool: "render_canvas" },
      chart: { type: "bar", categories: ["A"], series: [{ name: "Value", values: [-1] }] },
    });
    expect(result.success).toBe(false);
  });

  it("returns null when no artifact exists and rejects corrupt persisted data", async () => {
    const dir = await root();
    await expect(readCanvasArtifact(dir)).resolves.toBeNull();
    await mkdir(join(dir, ".vanta"));
    await writeFile(canvasArtifactPath(dir), "{}", "utf8");
    await expect(readCanvasArtifact(dir)).rejects.toThrow();
  });
});
