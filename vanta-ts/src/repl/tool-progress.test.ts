import { describe, it, expect } from "vitest";
import { toolProgressMode } from "./tool-progress.js";

describe("toolProgressMode", () => {
  it("defaults to full when unset", () => {
    expect(toolProgressMode({})).toBe("full");
  });

  it("reads compact and off", () => {
    expect(toolProgressMode({ VANTA_TOOL_PROGRESS: "compact" })).toBe("compact");
    expect(toolProgressMode({ VANTA_TOOL_PROGRESS: "off" })).toBe("off");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(toolProgressMode({ VANTA_TOOL_PROGRESS: "  OFF " })).toBe("off");
  });

  it("falls back to full on an unrecognized value", () => {
    expect(toolProgressMode({ VANTA_TOOL_PROGRESS: "loud" })).toBe("full");
  });
});
