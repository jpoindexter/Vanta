import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

type KernelStatus = { status?: string; root?: string };

const DEFAULT_KERNEL_URL = "http://127.0.0.1:7788";
const ROOT_SCOPED_PORT_START = 17_000;
const ROOT_SCOPED_PORT_RANGE = 4_000;

function normalizedUrl(value: string): string {
  return new URL(value).toString().replace(/\/$/, "");
}

function normalizedRoot(root: string): string {
  return resolve(root);
}

function isDefaultKernelUrl(baseUrl: string): boolean {
  return normalizedUrl(baseUrl) === DEFAULT_KERNEL_URL;
}

/** Stable local port for a project when the default kernel is owned by another root. */
export function rootScopedKernelPort(root: string): number {
  const digest = createHash("sha256").update(normalizedRoot(root)).digest();
  return ROOT_SCOPED_PORT_START + digest.readUInt32BE(0) % ROOT_SCOPED_PORT_RANGE;
}

async function statusAt(baseUrl: string): Promise<KernelStatus | null> {
  try {
    const response = await fetch(`${normalizedUrl(baseUrl)}/api/status`, { signal: AbortSignal.timeout(750) });
    if (!response.ok) return null;
    const status = await response.json() as KernelStatus;
    return status.status === "ready" ? status : null;
  } catch {
    return null;
  }
}

function statusMatchesRoot(status: KernelStatus | null, root: string): boolean {
  return Boolean(status?.root && normalizedRoot(status.root) === normalizedRoot(root));
}

function localUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

type RuntimeExitEmitter = {
  once(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
  exit?(code?: number): unknown;
};
type ManagedKernelChild = {
  exitCode: number | null;
  killed: boolean;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: string, listener: (...args: unknown[]) => void): unknown;
};

/** Tie test-owned kernels to the runtime that launched them. */
export function registerKernelCleanup(
  child: ManagedKernelChild,
  runtime: RuntimeExitEmitter = process,
): void {
  const stop = () => {
    if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  };
  const terminate = () => {
    stop();
    runtime.exit?.(0);
  };
  const release = () => {
    runtime.removeListener("exit", stop);
    runtime.removeListener("SIGINT", terminate);
    runtime.removeListener("SIGTERM", terminate);
  };
  runtime.once("exit", stop);
  runtime.once("SIGINT", terminate);
  runtime.once("SIGTERM", terminate);
  child.once("exit", release);
}

/**
 * Ensure a Rust kernel is running for the requested root and return its endpoint.
 * The default endpoint is shared only with the project it advertises; other projects
 * receive a stable local endpoint rather than crossing a safety/token boundary.
 */
export async function ensureKernel(opts: {
  baseUrl: string;
  kernelBin: string;
  root: string;
  ephemeral?: boolean;
}): Promise<string> {
  const existing = await statusAt(opts.baseUrl);
  if (statusMatchesRoot(existing, opts.root)) return normalizedUrl(opts.baseUrl);

  if (existing && !isDefaultKernelUrl(opts.baseUrl)) {
    throw new Error(
      `VANTA_KERNEL_URL points to a kernel for ${existing.root ?? "an unknown root"}, not ${normalizedRoot(opts.root)}. ` +
      "Stop that kernel or set VANTA_KERNEL_URL to the kernel for this project.",
    );
  }

  let baseUrl = normalizedUrl(opts.baseUrl);
  if (existing) {
    const port = rootScopedKernelPort(opts.root);
    baseUrl = localUrl(port);
    const scoped = await statusAt(baseUrl);
    if (statusMatchesRoot(scoped, opts.root)) return baseUrl;
    if (scoped) {
      throw new Error(
        `The project-scoped kernel port ${port} is already owned by ${scoped.root ?? "another process"}. ` +
        "Set VANTA_KERNEL_URL to a free kernel endpoint for this project.",
      );
    }
  }

  if (!existsSync(opts.kernelBin)) {
    throw new Error(
      `Kernel binary not found at ${opts.kernelBin}. Build it first: cargo build`,
    );
  }

  const port = new URL(baseUrl).port || "7788";
  const child = spawn(opts.kernelBin, ["serve", port], {
    detached: !opts.ephemeral,
    stdio: "ignore",
    cwd: opts.root,
    env: { ...process.env, VANTA_ROOT: opts.root },
  });
  if (opts.ephemeral) registerKernelCleanup(child);
  child.unref();

  for (let i = 0; i < 10; i++) {
    await sleep(500);
    if (statusMatchesRoot(await statusAt(baseUrl), opts.root)) return baseUrl;
  }
  throw new Error(
    `vanta-kernel did not become ready for ${normalizedRoot(opts.root)} on ${baseUrl}. ` +
      `Run it manually: VANTA_ROOT="${opts.root}" ${opts.kernelBin} serve ${port}`,
  );
}
