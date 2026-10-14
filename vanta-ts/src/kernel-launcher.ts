import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { killKernelFromPidFile, registerKernelCleanup } from "./kernel-guard/cleanup.js";
import { spawnGuardedKernel } from "./kernel-guard/spawn-guarded.js";

type KernelStatus = { status?: string; root?: string };
export type KernelStatusReader = (baseUrl: string) => Promise<KernelStatus | null>;

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

/** Resolve a bounded fallback endpoint without crossing another project's kernel. */
export async function resolveRootScopedKernelUrl(
  root: string,
  readStatus: KernelStatusReader = statusAt,
): Promise<string> {
  const preferred = rootScopedKernelPort(root);
  const attempts = 20;
  for (let offset = 0; offset < attempts; offset++) {
    const port = ROOT_SCOPED_PORT_START
      + (preferred - ROOT_SCOPED_PORT_START + offset) % ROOT_SCOPED_PORT_RANGE;
    const baseUrl = localUrl(port);
    const status = await readStatus(baseUrl);
    if (statusMatchesRoot(status, root) || !status) return baseUrl;
  }
  throw new Error(
    `No free project-scoped kernel endpoint was found for ${normalizedRoot(root)} `
      + `after checking ${attempts} candidates. Set VANTA_KERNEL_URL to a free endpoint for this project.`,
  );
}

async function resolveKernelEndpoint(baseUrl: string, root: string): Promise<{
  baseUrl: string;
  ready: boolean;
}> {
  const normalizedBaseUrl = normalizedUrl(baseUrl);
  const existing = await statusAt(normalizedBaseUrl);
  if (statusMatchesRoot(existing, root)) return { baseUrl: normalizedBaseUrl, ready: true };
  if (!existing) return { baseUrl: normalizedBaseUrl, ready: false };
  if (!isDefaultKernelUrl(normalizedBaseUrl)) {
    throw new Error(
      `VANTA_KERNEL_URL points to a kernel for ${existing.root ?? "an unknown root"}, not ${normalizedRoot(root)}. `
      + "Stop that kernel or set VANTA_KERNEL_URL to the kernel for this project.",
    );
  }
  const scopedUrl = await resolveRootScopedKernelUrl(root);
  return { baseUrl: scopedUrl, ready: statusMatchesRoot(await statusAt(scopedUrl), root) };
}

export { registerKernelCleanup } from "./kernel-guard/cleanup.js";

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
  const endpoint = await resolveKernelEndpoint(opts.baseUrl, opts.root);
  if (endpoint.ready) return endpoint.baseUrl;
  const baseUrl = endpoint.baseUrl;

  if (!existsSync(opts.kernelBin)) {
    throw new Error(
      `Kernel binary not found at ${opts.kernelBin}. Build it first: cargo build`,
    );
  }

  const port = new URL(baseUrl).port || "7788";
  if (opts.ephemeral) {
    // Owned kernel: a guard process (our child) starts it and kills it when this runtime ends, however it ends.
    const { guard, pidFile } = spawnGuardedKernel({ kernelBin: opts.kernelBin, port, root: opts.root });
    registerKernelCleanup(guard, process, {
      forceStop: () => {
        guard.kill("SIGKILL");
        killKernelFromPidFile(pidFile);
      },
      log: (line) => process.stderr.write(`[kernel] ${line}\n`),
    });
  } else {
    // Shared operator kernel: deliberately outlives this process so the next CLI session reuses it.
    spawn(opts.kernelBin, ["serve", port], {
      detached: true,
      stdio: "ignore",
      cwd: opts.root,
      env: { ...process.env, VANTA_ROOT: opts.root },
    }).unref();
  }

  for (let i = 0; i < 10; i++) {
    await sleep(500);
    if (statusMatchesRoot(await statusAt(baseUrl), opts.root)) return baseUrl;
  }
  throw new Error(
    `vanta-kernel did not become ready for ${normalizedRoot(opts.root)} on ${baseUrl}. ` +
      `Run it manually: VANTA_ROOT="${opts.root}" ${opts.kernelBin} serve ${port}`,
  );
}
