import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { createKernelClient } from "./kernel/client.js";

/**
 * Ensure the Rust kernel sidecar is running. If not, spawn it detached with an
 * explicit VANTA_ROOT so its scope matches the agent's, then poll until ready.
 */
export async function ensureKernel(opts: {
  baseUrl: string;
  kernelBin: string;
  root: string;
}): Promise<void> {
  const client = createKernelClient(opts.baseUrl);
  if (await client.status()) return;

  if (!existsSync(opts.kernelBin)) {
    throw new Error(
      `Kernel binary not found at ${opts.kernelBin}. Build it first: cargo build`,
    );
  }

  const port = new URL(opts.baseUrl).port || "7788";
  const child = spawn(opts.kernelBin, ["serve", port], {
    detached: true,
    stdio: "ignore",
    cwd: opts.root,
    env: { ...process.env, VANTA_ROOT: opts.root },
  });
  child.unref();

  for (let i = 0; i < 10; i++) {
    await sleep(500);
    if (await client.status()) return;
  }
  throw new Error(
    `vanta-kernel did not become ready on ${opts.baseUrl}. ` +
      `Run it manually: VANTA_ROOT="${opts.root}" ${opts.kernelBin} serve ${port}`,
  );
}
