import { access, statfs } from "node:fs/promises";
import { arch, platform, totalmem } from "node:os";
import { constants } from "node:fs";
import type { FirstInferenceHardware, FirstInferenceModel } from "./types.js";
import { FirstInferenceHardwareSchema } from "./types.js";

type HardwareDeps = {
  platform?: () => string;
  arch?: () => string;
  totalmem?: () => number;
  freeDisk?: (path: string) => Promise<number>;
  runtimeAvailable?: () => Promise<boolean>;
};

async function diskBytes(path: string): Promise<number> {
  const value = await statfs(path);
  return Number(value.bavail) * Number(value.bsize);
}

async function commandAvailable(): Promise<boolean> {
  const paths = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const path of paths) {
    try { await access(`${path}/llama-server`, constants.X_OK); return true; } catch { /* keep searching */ }
  }
  return false;
}

export async function detectFirstInferenceHardware(root: string, deps: HardwareDeps = {}): Promise<FirstInferenceHardware> {
  const detectedPlatform = (deps.platform ?? platform)();
  const architecture = (deps.arch ?? arch)();
  const runtimeAvailable = await (deps.runtimeAvailable ?? commandAvailable)();
  const reason = detectedPlatform !== "darwin"
    ? "unsupported_platform"
    : architecture !== "arm64"
      ? "unsupported_architecture"
      : !runtimeAvailable ? "runtime_missing" : "ready";
  return FirstInferenceHardwareSchema.parse({
    platform: detectedPlatform,
    architecture,
    memoryBytes: (deps.totalmem ?? totalmem)(),
    freeDiskBytes: await (deps.freeDisk ?? diskBytes)(root),
    runtimeAvailable,
    supported: reason === "ready",
    reason,
  });
}

export function modelStorageRequirement(model: FirstInferenceModel): number {
  return Math.ceil(model.bytes * 1.15) + 64 * 1024 * 1024;
}

export function modelFitsHardware(hardware: FirstInferenceHardware, model: FirstInferenceModel): boolean {
  const estimatedRuntimeBytes = Math.ceil(model.bytes * 1.12) + model.contextTokens * 2_048;
  return hardware.supported && hardware.freeDiskBytes >= modelStorageRequirement(model) && hardware.memoryBytes >= estimatedRuntimeBytes;
}
