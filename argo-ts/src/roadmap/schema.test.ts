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

  it("accepts the optional tier/model/effort fields", () => {
    const tagged = { ...validItem, tier: "rock", model: "sonnet", effort: "medium" };
    expect(() => RoadmapItemSchema.parse(tagged)).not.toThrow();
  });

  it("accepts an item with the optional fields absent", () => {
    expect(() => RoadmapItemSchema.parse(validItem)).not.toThrow();
  });

  it("rejects an unknown tier/model value", () => {
    expect(() => RoadmapItemSchema.parse({ ...validItem, tier: "boulder" })).toThrow();
    expect(() => RoadmapItemSchema.parse({ ...validItem, model: "gpt" })).toThrow();
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
