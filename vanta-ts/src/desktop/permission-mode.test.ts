import { describe, expect, it } from "vitest";
import { ensureDesktopPermissionMode } from "./permission-mode.js";

describe("ensureDesktopPermissionMode", () => {
  it("defaults desktop sessions to acceptEdits", () => {
    const env: NodeJS.ProcessEnv = {};
    ensureDesktopPermissionMode(env);
    expect(env.VANTA_PERMISSION_MODE).toBe("acceptEdits");
    expect(env.VANTA_AUTO_MODE).toBe("0");
  });

  it("uses acceptEdits even when a parent shell is in default mode", () => {
    const env: NodeJS.ProcessEnv = { VANTA_PERMISSION_MODE: "default", VANTA_AUTO_MODE: "0" };
    ensureDesktopPermissionMode(env);
    expect(env.VANTA_PERMISSION_MODE).toBe("acceptEdits");
    expect(env.VANTA_AUTO_MODE).toBe("0");
  });

  it("lets desktop explicitly opt into manual approval mode", () => {
    const env: NodeJS.ProcessEnv = { VANTA_DESKTOP_PERMISSION_MODE: "default", VANTA_PERMISSION_MODE: "acceptEdits", VANTA_AUTO_MODE: "0" };
    ensureDesktopPermissionMode(env);
    expect(env.VANTA_PERMISSION_MODE).toBe("default");
    expect(env.VANTA_AUTO_MODE).toBe("0");
  });

  it("preserves auto mode when enabled by env", () => {
    const env: NodeJS.ProcessEnv = { VANTA_AUTO_MODE: "1" };
    ensureDesktopPermissionMode(env);
    expect(env.VANTA_PERMISSION_MODE).toBeUndefined();
    expect(env.VANTA_AUTO_MODE).toBe("1");
  });
});
