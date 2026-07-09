import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CanvasPanel } from "./canvas.js";
import type { CanvasArtifact } from "./types.js";

const base = { version: 1 as const, id: "artifact-1", title: "Delivery health", createdAt: "2026-07-10T12:00:00.000Z", source: { tool: "render_canvas" as const } };

describe("CanvasPanel", () => {
  it("renders an accessible chart with series controls and provenance", () => {
    const artifact: CanvasArtifact = { ...base, kind: "chart", chart: { type: "line", categories: ["Mon", "Tue"], series: [{ name: "Passes", values: [4, 7] }] } };
    const html = renderToStaticMarkup(<CanvasPanel artifact={artifact} onRefresh={vi.fn()} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("render_canvas");
  });

  it("renders sortable table controls and a labeled filter", () => {
    const artifact: CanvasArtifact = { ...base, kind: "table", table: { columns: [{ key: "name", label: "Name" }], rows: [{ name: "Canvas" }] } };
    const html = renderToStaticMarkup(<CanvasPanel artifact={artifact} onRefresh={vi.fn()} />);
    expect(html).toContain("Filter rows");
    expect(html).toContain("Sort by Name");
    expect(html).toContain("1 of 1 rows");
  });

  it("renders board items as selectable buttons", () => {
    const artifact: CanvasArtifact = { ...base, kind: "board", board: { columns: [{ title: "Now", items: [{ title: "Canvas", detail: "Interactive surface" }] }] } };
    const html = renderToStaticMarkup(<CanvasPanel artifact={artifact} onRefresh={vi.fn()} />);
    expect(html).toContain("Interactive surface");
    expect(html).toContain("Selected");
  });
});
