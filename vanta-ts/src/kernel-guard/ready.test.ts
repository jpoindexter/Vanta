import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { waitForKernelReady, type ReadyChild } from "./ready.js";

const describeKernel = { baseUrl: "http://127.0.0.1:17555", port: "17555", command: "VANTA_ROOT=/p kernel serve 17555" };
const fakeChild = () => Object.assign(new EventEmitter(), { exitCode: null as number | null, signalCode: null }) as ReadyChild & EventEmitter;

describe("waitForKernelReady", () => {
  it("keeps probing with growing delays until the kernel answers", async () => {
    const answers = [false, false, false, true];
    const waits: number[] = [];

    await waitForKernelReady({
      probe: async () => answers.shift() ?? true,
      child: fakeChild(),
      describe: describeKernel,
      wait: async (ms) => { waits.push(ms); },
    });

    expect(waits).toEqual([50, 100, 200]);
  });

  it("caps the delay at 500ms", async () => {
    let calls = 0;
    const waits: number[] = [];

    await waitForKernelReady({
      probe: async () => ++calls > 7,
      child: fakeChild(),
      describe: describeKernel,
      wait: async (ms) => { waits.push(ms); },
    });

    expect(Math.max(...waits)).toBe(500);
  });

  it("fails fast, naming the port and exit code, when the child dies", async () => {
    const child = fakeChild();
    const wait = vi.fn(async () => { child.exitCode = 1; child.emit("exit", 1, null); });

    await expect(
      waitForKernelReady({ probe: async () => false, child, describe: describeKernel, wait, timeoutMs: 60_000 }),
    ).rejects.toThrow(/exited \(code 1\) before answering on port 17555.*serve 17555/);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("reports the url, port and manual command when the deadline passes", async () => {
    await expect(
      waitForKernelReady({ probe: async () => false, child: fakeChild(), describe: describeKernel, timeoutMs: 120, wait: async () => new Promise((r) => setTimeout(r, 60)) }),
    ).rejects.toThrow(/did not become ready on http:\/\/127\.0\.0\.1:17555 \(port 17555\) within 120ms.*serve 17555/);
  });
});
