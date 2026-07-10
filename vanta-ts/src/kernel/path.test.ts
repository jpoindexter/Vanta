import { describe, expect, it } from "vitest";
import { kernelBinaryName, kernelBinaryPath } from "./path.js";

describe("kernel binary path", () => {
  it("uses the native Windows executable suffix", () => {
    expect(kernelBinaryName("win32")).toBe("vanta-kernel.exe");
    expect(kernelBinaryPath("C:\\Vanta", "win32")).toContain("vanta-kernel.exe");
  });

  it("keeps the Unix binary name elsewhere", () => {
    expect(kernelBinaryName("darwin")).toBe("vanta-kernel");
    expect(kernelBinaryName("linux")).toBe("vanta-kernel");
  });
});
