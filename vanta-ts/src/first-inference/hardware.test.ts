import { describe, expect, it } from "vitest";
import { detectFirstInferenceHardware, modelFitsHardware, modelStorageRequirement } from "./hardware.js";
import { QWEN_05B_Q4_K_M } from "./types.js";

describe("first-inference hardware", () => {
  it("reports only the compatibility facts needed for a supported Mac", async () => {
    const hardware = await detectFirstInferenceHardware("/tmp", {
      platform: () => "darwin", arch: () => "arm64", totalmem: () => 16 * 1024 ** 3,
      freeDisk: async () => 20 * 1024 ** 3, runtimeAvailable: async () => true,
    });
    expect(hardware).toEqual(expect.objectContaining({ supported: true, reason: "ready", architecture: "arm64" }));
    expect(JSON.stringify(hardware)).not.toMatch(/serial|uuid|hostname|username/i);
    expect(modelFitsHardware(hardware, QWEN_05B_Q4_K_M)).toBe(true);
  });

  it("classifies incompatible hardware, missing runtime, and low disk", async () => {
    const base = { totalmem: () => 8 * 1024 ** 3, freeDisk: async () => modelStorageRequirement(QWEN_05B_Q4_K_M) - 1 };
    expect((await detectFirstInferenceHardware("/tmp", { ...base, platform: () => "linux", arch: () => "arm64", runtimeAvailable: async () => true })).reason).toBe("unsupported_platform");
    expect((await detectFirstInferenceHardware("/tmp", { ...base, platform: () => "darwin", arch: () => "x64", runtimeAvailable: async () => true })).reason).toBe("unsupported_architecture");
    const missing = await detectFirstInferenceHardware("/tmp", { ...base, platform: () => "darwin", arch: () => "arm64", runtimeAvailable: async () => false });
    expect(missing.reason).toBe("runtime_missing");
    const lowDisk = await detectFirstInferenceHardware("/tmp", { ...base, platform: () => "darwin", arch: () => "arm64", runtimeAvailable: async () => true });
    expect(modelFitsHardware(lowDisk, QWEN_05B_Q4_K_M)).toBe(false);
  });
});
