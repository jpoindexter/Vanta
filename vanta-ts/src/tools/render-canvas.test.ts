import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCanvasArtifact } from "../canvas/artifact.js";
import { renderCanvasTool } from "./render-canvas.js";
import type { ToolContext } from "./types.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-render-canvas-")); });
afterEach(async () => rm(root, { recursive: true, force: true }));
const ctx = (): ToolContext => ({ root, sessionId: "session-7", safety: {} as ToolContext["safety"], requestApproval: async () => true });

describe("render_canvas", () => {
  it("writes a desktop-readable artifact with provenance", async () => {
    const result = await renderCanvasTool.execute({
      kind: "table", title: "Release health",
      table: { columns: [{ key: "check", label: "Check" }, { key: "pass", label: "Pass" }], rows: [{ check: "Tests", pass: true }] },
    }, ctx());
    expect(result.ok).toBe(true);
    expect(await readCanvasArtifact(root)).toMatchObject({ kind: "table", title: "Release health", sessionId: "session-7", source: { tool: "render_canvas" } });
  });

  it("rejects malformed chart data without writing", async () => {
    const result = await renderCanvasTool.execute({
      kind: "chart", title: "Broken", chart: { type: "bar", categories: ["A", "B"], series: [{ name: "Value", values: [1] }] },
    }, ctx());
    expect(result.ok).toBe(false);
    await expect(readCanvasArtifact(root)).resolves.toBeNull();
  });

  it("describes the mutation for kernel assessment", () => {
    expect(renderCanvasTool.describeForSafety?.({ kind: "board", title: "Launch plan" })).toBe('render canvas board "Launch plan"');
  });

  it("advertises board items as structured objects to the model", () => {
    const properties = renderCanvasTool.schema.parameters.properties as Record<string, any>;
    expect(properties.board.properties.columns.items.properties.items.items.required).toEqual(["title"]);
  });
});
