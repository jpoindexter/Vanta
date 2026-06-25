import { describe, it, expect, afterEach } from "vitest";
import { approver } from "./session.js";

const orig = process.stdin.isTTY;
const setTTY = (v: boolean | undefined) => { (process.stdin as { isTTY?: boolean }).isTTY = v; };
afterEach(() => setTTY(orig));

describe("approver (one-shot) — graceful when there's no TTY", () => {
  it("declines cleanly with no TTY, never touching readline (no 'readline was closed' crash)", async () => {
    setTTY(false);
    let asked = false;
    const rl = { question: async () => { asked = true; return "y"; } } as never;
    const ok = await approver(rl)("write /etc/x", "outside scope");
    expect(ok).toBe(false);
    expect(asked).toBe(false); // didn't attempt the prompt
  });

  it("returns false (does not throw) when the readline closes mid-prompt", async () => {
    setTTY(true);
    const rl = { question: async () => { throw new Error("readline was closed"); } } as never;
    await expect(approver(rl)("x", "y")).resolves.toBe(false);
  });

  it("approves on 'y' when an interactive TTY can answer", async () => {
    setTTY(true);
    const rl = { question: async () => "yes" } as never;
    expect(await approver(rl)("x", "y")).toBe(true);
  });

  it("declines on a non-yes answer", async () => {
    setTTY(true);
    const rl = { question: async () => "n" } as never;
    expect(await approver(rl)("x", "y")).toBe(false);
  });
});
