import { describe, expect, it } from "vitest";
import {
  acceptsEditsWithoutKernel,
  envForPermissionMode,
  parsePermissionMode,
  resolvePermissionMode,
} from "./permission-mode.js";

describe("parsePermissionMode", () => {
  it("accepts canonical and alias values", () => {
    expect(parsePermissionMode("auto")).toBe("auto");
    expect(parsePermissionMode("acceptEdits")).toBe("acceptEdits");
    expect(parsePermissionMode("accept-edits")).toBe("acceptEdits");
    expect(parsePermissionMode("accept_edits")).toBe("acceptEdits");
    expect(parsePermissionMode("default")).toBe("default");
    expect(parsePermissionMode("normal")).toBe("default");
    expect(parsePermissionMode("manual")).toBe("default");
  });

  it("rejects missing or unknown values", () => {
    expect(parsePermissionMode(undefined)).toBeNull();
    expect(parsePermissionMode("")).toBeNull();
    expect(parsePermissionMode("accept edits")).toBeNull();
    expect(parsePermissionMode("bypass")).toBeNull();
  });
});

describe("resolvePermissionMode", () => {
  it("prefers VANTA_PERMISSION_MODE over VANTA_AUTO_MODE", () => {
    expect(resolvePermissionMode({ VANTA_PERMISSION_MODE: "default", VANTA_AUTO_MODE: "1" })).toBe("default");
    expect(resolvePermissionMode({ VANTA_PERMISSION_MODE: "accept-edits", VANTA_AUTO_MODE: "1" })).toBe("acceptEdits");
  });

  it("falls back to VANTA_AUTO_MODE and then default", () => {
    expect(resolvePermissionMode({ VANTA_AUTO_MODE: "1" })).toBe("auto");
    expect(resolvePermissionMode({ VANTA_AUTO_MODE: "0" })).toBe("default");
    expect(resolvePermissionMode({})).toBe("default");
  });
});

describe("acceptsEditsWithoutKernel", () => {
  it.each(["write_file", "edit_file", "read_file", "mkdir", "glob_files", "grep_files"])(
    "allows %s only in acceptEdits mode",
    (toolName) => {
      expect(acceptsEditsWithoutKernel("acceptEdits", toolName)).toBe(true);
      expect(acceptsEditsWithoutKernel("default", toolName)).toBe(false);
      expect(acceptsEditsWithoutKernel("auto", toolName)).toBe(false);
    },
  );

  it("does not allow shell_cmd in acceptEdits mode", () => {
    expect(acceptsEditsWithoutKernel("acceptEdits", "shell_cmd")).toBe(false);
  });
});

describe("envForPermissionMode", () => {
  it("sets VANTA_AUTO_MODE only for auto", () => {
    expect(envForPermissionMode("auto")).toMatchObject({ VANTA_PERMISSION_MODE: "auto", VANTA_AUTO_MODE: "1" });
    expect(envForPermissionMode("acceptEdits")).toMatchObject({ VANTA_PERMISSION_MODE: "acceptEdits", VANTA_AUTO_MODE: "0" });
    expect(envForPermissionMode("default")).toMatchObject({ VANTA_PERMISSION_MODE: "default", VANTA_AUTO_MODE: "0" });
  });
});
