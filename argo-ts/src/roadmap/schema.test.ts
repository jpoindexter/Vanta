import { describe, it, expect } from "vitest";
import { RoadmapSchema, RoadmapItemSchema } from "./schema.js";

const validItem = {
  id: "MCP-1",
  track: "MCP",
  title: "Use any MCP",
  status: "next" as const,
  size: "S",
  summary: "Fix config discovery.",
  done: "argo mcp list shows tools.",
};

describe("RoadmapItemSchema", () => {
  it("accepts a valid item", () => {
    expect(() => RoadmapItemSchema.parse(validItem)).not.toThrow();
  });

  it("rejects unknown status", () => {
    expect(() => RoadmapItemSchema.parse({ ...validItem, status: "wip" })).toThrow();
  });

  it("rejects missing id", () => {
    const { id: _id, ...rest } = validItem;
    expect(() => RoadmapItemSchema.parse(rest)).toThrow();
  });
});

describe("RoadmapSchema", () => {
  it("accepts a valid roadmap", () => {
    expect(() => RoadmapSchema.parse({ updated: "2026-06-03", items: [validItem] })).not.toThrow();
  });

  it("rejects empty items array", () => {
    expect(() => RoadmapSchema.parse({ updated: "2026-06-03", items: [] })).toThrow();
  });
});
