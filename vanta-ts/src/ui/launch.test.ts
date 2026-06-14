import { describe, expect, it } from "vitest";
import { selectTuiSurface } from "./launch.js";

describe("selectTuiSurface", () => {
  it("keeps the current TUI as the default", () => {
    expect(selectTuiSurface({})).toBe("v1");
    expect(selectTuiSurface({ VANTA_TUI: "v1" })).toBe("v1");
  });

  it("selects the mission-control surface only when explicitly requested", () => {
    expect(selectTuiSurface({ VANTA_TUI: "v2" })).toBe("v2");
    expect(selectTuiSurface({ VANTA_TUI: " V2 " })).toBe("v2");
  });

  it("falls back to v1 for unknown values", () => {
    expect(selectTuiSurface({ VANTA_TUI: "wide" })).toBe("v1");
  });
});
