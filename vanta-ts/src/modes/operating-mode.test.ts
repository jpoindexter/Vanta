import { describe, expect, it } from "vitest";
import {
  envForOperatingMode,
  nextOperatingMode,
  parseOperatingMode,
  permissionModeForOperating,
  resolveOperatingMode,
} from "./operating-mode.js";

describe("operating mode", () => {
  it("cycles manual → accept edits → plan → auto → manual", () => {
    expect(nextOperatingMode("default")).toBe("acceptEdits");
    expect(nextOperatingMode("acceptEdits")).toBe("plan");
    expect(nextOperatingMode("plan")).toBe("auto");
    expect(nextOperatingMode("auto")).toBe("default");
  });

  it("parses plan plus the existing permission-mode aliases", () => {
    expect(parseOperatingMode("plan")).toBe("plan");
    expect(parseOperatingMode("manual")).toBe("default");
    expect(parseOperatingMode("accept-edits")).toBe("acceptEdits");
  });

  it("maps plan to manual permission authority while retaining its own gate", () => {
    expect(permissionModeForOperating("plan")).toBe("default");
    expect(envForOperatingMode("plan")).toMatchObject({
      VANTA_OPERATING_MODE: "plan",
      VANTA_PERMISSION_MODE: "default",
      VANTA_AUTO_MODE: "0",
    });
  });

  it("prefers an explicit operating mode and otherwise preserves old flags", () => {
    expect(resolveOperatingMode({ VANTA_OPERATING_MODE: "plan", VANTA_PERMISSION_MODE: "auto" })).toBe("plan");
    expect(resolveOperatingMode({ VANTA_PERMISSION_MODE: "acceptEdits" })).toBe("acceptEdits");
  });
});
