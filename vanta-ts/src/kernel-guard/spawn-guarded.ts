import { spawn, type ChildProcess } from "node:child_process";
import { resolveVantaHome } from "../store/home.js";
import { KERNEL_GUARD_SOURCE } from "./guard-source.js";
import { KERNEL_GUARD_MARKER, kernelPidFilePath } from "./pid-file.js";

export type GuardedKernelOptions = {
  kernelBin: string;
  port: string;
  root: string;
  env?: NodeJS.ProcessEnv;
  extraArgs?: string[];
};

export type GuardedKernel = { guard: ChildProcess; pidFile: string };

/**
 * Start the kernel under a guard process that is a normal (non-detached) child of this process.
 * `process.execPath` runs the inline guard in plain Node and, with ELECTRON_RUN_AS_NODE in the
 * inherited env, in a packaged Electron binary alike.
 */
export function spawnGuardedKernel(options: GuardedKernelOptions): GuardedKernel {
  const env = { ...(options.env ?? process.env), VANTA_ROOT: options.root };
  const pidFile = kernelPidFilePath(resolveVantaHome(env), Number(options.port));
  const guard = spawn(
    process.execPath,
    [
      "-e", KERNEL_GUARD_SOURCE,
      KERNEL_GUARD_MARKER, pidFile, String(process.pid), options.port, options.root,
      options.kernelBin, "serve", options.port, ...(options.extraArgs ?? []),
    ],
    // stderr is inherited so a guard that cannot start or record the kernel says why in the runtime log.
    { stdio: ["ignore", "ignore", "inherit"], cwd: options.root, env },
  );
  // Natural end of a short command must not wait for the guard; the exit hook stops it instead.
  guard.unref();
  return { guard, pidFile };
}
