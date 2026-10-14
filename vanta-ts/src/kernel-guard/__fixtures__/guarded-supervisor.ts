// Real supervisor for kernel-lifecycle tests: the same runtime-start path `vanta desktop` uses.
import { bootstrapKernel } from "../../session/bootstrap-kernel.js";
import { applyDesktopKernelLifecycle } from "../desktop-lifecycle.js";

const [port, kernelBin, root] = process.argv.slice(2);
if (!port || !kernelBin || !root) {
  process.stderr.write("usage: guarded-supervisor <port> <kernelBin> <root>\n");
  process.exit(64);
}

await applyDesktopKernelLifecycle();
await bootstrapKernel(root, { configuredUrl: `http://127.0.0.1:${port}`, kernelBin });
process.stdout.write(`ready ${process.env.VANTA_KERNEL_URL}\n`);
setInterval(() => undefined, 1000);
