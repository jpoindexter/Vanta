import { describe, it, expect } from "vitest";
import { RoadmapSchema, RoadmapItemSchema } from "./schema.js";

const validItem = {
  id: "MCP-1",
  track: "MCP",
  title: "Use any MCP",
  status: "next" as const,
  size: "S",
  summary: "Fix config discovery.",
  done: "vanta mcp list shows tools.",
};

describe("RoadmapItemSchema", () => {
  it("accepts a valid item", () => {
    expect(() => RoadmapItemSchema.parse(validItem)).not.toThrow();
  });

  it("rejects unknown status", () => {
    expect(() => RoadmapItemSchema.parse({ ...validItem, status: "wip" })).toThrow();
  });

  it("accepts blocked as a visible non-WIP status", () => {
    expect(RoadmapItemSchema.parse({ ...validItem, status: "blocked" }).status).toBe("blocked");
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

  it("accepts the optional codex routing tag", () => {
    const parsed = RoadmapItemSchema.parse({ ...validItem, codex: "gpt-5.4-mini" });
    expect(parsed.codex).toBe("gpt-5.4-mini");
  });

  it("rejects an unknown codex routing tag", () => {
    expect(() => RoadmapItemSchema.parse({ ...validItem, codex: "gpt-4.5" })).toThrow();
  });

  it("rejects an unknown tier/model value", () => {
    expect(() => RoadmapItemSchema.parse({ ...validItem, tier: "boulder" })).toThrow();
    expect(() => RoadmapItemSchema.parse({ ...validItem, model: "gpt" })).toThrow();
  });

  it("round-trips updated/notes/after/parkedReason instead of stripping them", () => {
    const tagged = {
      ...validItem,
      updated: "2026-06-11",
      notes: "shipped via triage",
      after: ["VANTA-SEND-MSG"],
      parkedReason: "external proof",
    };
    const parsed = RoadmapItemSchema.parse(tagged);
    expect(parsed.updated).toBe("2026-06-11");
    expect(parsed.notes).toBe("shipped via triage");
    expect(parsed.after).toEqual(["VANTA-SEND-MSG"]);
    expect(parsed.parkedReason).toBe("external proof");
  });

  it("rejects an unknown parked reason", () => {
    expect(() => RoadmapItemSchema.parse({ ...validItem, parkedReason: "maybe later" })).toThrow();
  });
});

describe("RoadmapSchema", () => {
  it("accepts a valid roadmap", () => {
    expect(() => RoadmapSchema.parse({ updated: "2026-06-03", items: [validItem] })).not.toThrow();
  });

  it("rejects empty items array", () => {
    expect(() => RoadmapSchema.parse({ updated: "2026-06-03", items: [] })).toThrow();
  });

  it("requires parked items to explain why they are parked", () => {
    expect(() => RoadmapSchema.parse({
      updated: "2026-06-03",
      items: [{ ...validItem, status: "parked" }],
    })).toThrow("parked roadmap items require parkedReason");
  });

  it("accepts parked items with a parked reason", () => {
    expect(() => RoadmapSchema.parse({
      updated: "2026-06-03",
      items: [{ ...validItem, status: "parked", parkedReason: "review" }],
    })).not.toThrow();
  });
});
