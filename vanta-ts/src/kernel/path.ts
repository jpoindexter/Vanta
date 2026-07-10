import { join } from "node:path";

export function kernelBinaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "vanta-kernel.exe" : "vanta-kernel";
}

export function kernelBinaryPath(repoRoot: string, platform: NodeJS.Platform = process.platform): string {
  return join(repoRoot, "target", "debug", kernelBinaryName(platform));
}
