import { describe, expect, it } from "vitest";
import { resolveShellInvocation } from "./shell.js";

describe("resolveShellInvocation", () => {
  it("preserves the existing sh -c path on Unix", () => {
    expect(resolveShellInvocation("printf ok", { platform: "linux", env: {} })).toEqual({ cmd: "sh", args: ["-c", "printf ok"], kind: "posix" });
  });

  it("uses Git Bash on Windows when available", () => {
    const path = "C:\\Program Files\\Git\\bin\\bash.exe";
    expect(resolveShellInvocation("npm test", { platform: "win32", env: { ProgramFiles: "C:\\Program Files" }, exists: (candidate) => candidate === path })).toEqual({
      cmd: path, args: ["-lc", "npm test"], kind: "posix",
    });
  });

  it("falls back to noninteractive PowerShell", () => {
    expect(resolveShellInvocation("Get-Location", { platform: "win32", env: {}, exists: () => false })).toEqual({
      cmd: "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Get-Location"],
      kind: "powershell",
    });
  });

  it("honors an explicit shell override", () => {
    expect(resolveShellInvocation("echo ok", { platform: "win32", env: { VANTA_SHELL: "pwsh.exe" } }).kind).toBe("powershell");
  });
});
