import { setTimeout as sleep } from "node:timers/promises";

export const READY_TIMEOUT_MS = 10_000;
const FIRST_DELAY_MS = 50;
const MAX_DELAY_MS = 500;

export type ReadyChild = {
  exitCode: number | null;
  signalCode?: NodeJS.Signals | null;
  once(event: string, listener: (...args: unknown[]) => void): unknown;
};

export type ReadyOptions = {
  /** Resolves true once the kernel answers as ready for the requested root. */
  probe: () => Promise<boolean>;
  child: ReadyChild;
  describe: { baseUrl: string; port: string; command: string };
  timeoutMs?: number;
  wait?: (ms: number) => Promise<unknown>;
};

const hasExited = (child: ReadyChild): boolean => child.exitCode !== null || (child.signalCode ?? null) !== null;

/**
 * Poll with backoff (50ms growing to 500ms) until the kernel answers, the child dies, or the deadline
 * passes. A dead child fails immediately instead of burning the whole window.
 */
export async function waitForKernelReady(options: ReadyOptions): Promise<void> {
  const { probe, child, describe } = options;
  const wait = options.wait ?? ((ms: number) => sleep(ms));
  const deadline = Date.now() + (options.timeoutMs ?? READY_TIMEOUT_MS);
  let exit: string | null = null;
  child.once("exit", (code, signal) => {
    exit = `code ${String(code ?? "none")}${signal ? `, signal ${String(signal)}` : ""}`;
  });
  for (let delay = FIRST_DELAY_MS; ; delay = Math.min(delay * 2, MAX_DELAY_MS)) {
    if (await probe()) return;
    if (exit !== null || hasExited(child)) {
      throw new Error(
        `vanta-kernel exited (${exit ?? "already exited"}) before answering on port ${describe.port}. `
          + `Its output is not captured; run it in a terminal to see why: ${describe.command}`,
      );
    }
    if (Date.now() >= deadline) break;
    await wait(delay);
  }
  throw new Error(
    `vanta-kernel did not become ready on ${describe.baseUrl} (port ${describe.port}) within ${options.timeoutMs ?? READY_TIMEOUT_MS}ms. `
      + `Run it manually to see why: ${describe.command}`,
  );
}
