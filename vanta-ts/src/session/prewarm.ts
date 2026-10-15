import { resolve } from "node:path";
import type { KernelClient } from "../kernel/client.js";
import { preconnectStartup } from "../net/preconnect.js";
import { bootstrapKernel } from "./bootstrap-kernel.js";

type Bootstrap = (root: string) => Promise<KernelClient>;
type Preconnect = (env: NodeJS.ProcessEnv) => Promise<unknown>;
type PrewarmDeps = {
  bootstrap?: Bootstrap;
  preconnect?: Preconnect;
  env?: NodeJS.ProcessEnv;
};
type ConsumeDeps = {
  bootstrap?: Bootstrap;
  waitMs?: number;
};

const DEFAULT_PREWARM_WAIT_MS = 250;
const kernelPrewarms = new Map<string, Promise<KernelClient>>();

function projectKey(root: string): string {
  return resolve(root);
}

/**
 * Start project-scoped kernel and provider warmups without waiting. The map key
 * contains only the resolved project path; provider credentials never enter it.
 */
export function startRunPrewarm(root: string, deps: PrewarmDeps = {}): void {
  const key = projectKey(root);
  if (!kernelPrewarms.has(key)) {
    const bootstrap = deps.bootstrap ?? bootstrapKernel;
    const pending = bootstrap(key);
    void pending.catch(() => {});
    kernelPrewarms.set(key, pending);
  }
  void (deps.preconnect ?? preconnectStartup)(deps.env ?? process.env).catch(() => {});
}

/**
 * Consume the matching project prewarm, but only for a short bounded window.
 * A failed or stuck warmup falls back to the normal bootstrap path.
 */
export async function consumePrewarmedKernel(
  root: string,
  deps: ConsumeDeps = {},
): Promise<KernelClient> {
  const key = projectKey(root);
  const pending = kernelPrewarms.get(key);
  kernelPrewarms.delete(key);
  const fallback = deps.bootstrap ?? bootstrapKernel;
  if (!pending) return fallback(key);

  const timeout = Symbol("prewarm-timeout");
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      pending.catch(() => timeout),
      new Promise<typeof timeout>((resolveTimeout) => {
        timer = setTimeout(() => resolveTimeout(timeout), deps.waitMs ?? DEFAULT_PREWARM_WAIT_MS);
        timer.unref?.();
      }),
    ]);
    if (result !== timeout) return result as KernelClient;
  } finally {
    if (timer) clearTimeout(timer);
  }
  return fallback(key);
}

export function clearRunPrewarmsForTests(): void {
  kernelPrewarms.clear();
}
