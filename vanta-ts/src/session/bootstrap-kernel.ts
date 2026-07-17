import { createKernelClient, type KernelClient } from "../kernel/client.js";
import { ensureKernel } from "../kernel-launcher.js";
import { kernelBinaryPath } from "../kernel/path.js";

type BootstrapKernelDeps = {
  configuredUrl?: string;
  kernelBin?: string;
  ensure?: typeof ensureKernel;
  create?: typeof createKernelClient;
};

/** Start or reuse the kernel for one project and bind token lookup to that root. */
export async function bootstrapKernel(
  repoRoot: string,
  deps: BootstrapKernelDeps = {},
): Promise<KernelClient> {
  const configuredUrl = deps.configuredUrl
    ?? process.env.VANTA_KERNEL_URL
    ?? "http://127.0.0.1:7788";
  const ensure = deps.ensure ?? ensureKernel;
  const baseUrl = await ensure({
    baseUrl: configuredUrl,
    kernelBin: deps.kernelBin ?? kernelBinaryPath(repoRoot),
    root: repoRoot,
    ephemeral: process.env.VANTA_KERNEL_EPHEMERAL === "1",
  });
  process.env.VANTA_KERNEL_URL = baseUrl;
  return (deps.create ?? createKernelClient)(baseUrl, repoRoot);
}
