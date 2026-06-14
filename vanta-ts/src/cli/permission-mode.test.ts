import { describe, expect, it } from "vitest";
import { parsePermissionModeFlags } from "./permission-mode.js";

describe("parsePermissionModeFlags", () => {
  it("strips --permission-mode auto and enables VANTA_AUTO_MODE", () => {
    const parsed = parsePermissionModeFlags(["--permission-mode", "auto", "run", "hi"], {});
    expect(parsed.rest).toEqual(["run", "hi"]);
    expect(parsed.env.VANTA_AUTO_MODE).toBe("1");
  });

  it("supports --permission-mode=default as an explicit off switch", () => {
    const parsed = parsePermissionModeFlags(["--permission-mode=default", "chat"], { VANTA_AUTO_MODE: "1" });
    expect(parsed.rest).toEqual(["chat"]);
    expect(parsed.env.VANTA_AUTO_MODE).toBe("0");
  });

  it("preserves unknown modes for command usage handling", () => {
    const parsed = parsePermissionModeFlags(["--permission-mode", "yolo", "run"], {});
    expect(parsed.rest).toEqual(["run"]);
    expect(parsed.error).toContain("unsupported permission mode");
  });
});
