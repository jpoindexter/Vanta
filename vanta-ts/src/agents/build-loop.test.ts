import { describe, it, expect, vi } from "vitest";
import { runBuildLoop } from "./build-loop.js";

describe("runBuildLoop — delegate → verify → fix", () => {
  it("returns ok on the first attempt when verify passes", async () => {
    const delegate = vi.fn().mockResolvedValue({ ok: true, output: "built" });
    const verify = vi.fn().mockResolvedValue({ ok: true, detail: "" });
    const r = await runBuildLoop("build a page", { delegate, verify });
    expect(r).toMatchObject({ ok: true, iterations: 1 });
    expect(delegate).toHaveBeenCalledTimes(1);
  });

  it("re-delegates a fix carrying the failure detail, then passes", async () => {
    const delegate = vi.fn().mockResolvedValue({ ok: true, output: "built" });
    const verify = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, detail: "index.html missing <title>" })
      .mockResolvedValueOnce({ ok: true, detail: "" });
    const r = await runBuildLoop("build a page", { delegate, verify });
    expect(r).toMatchObject({ ok: true, iterations: 2 });
    expect(delegate.mock.calls[1]![0]).toContain("index.html missing <title>");
  });

  it("gives up after maxIters when verify never passes", async () => {
    const delegate = vi.fn().mockResolvedValue({ ok: true, output: "built" });
    const verify = vi.fn().mockResolvedValue({ ok: false, detail: "still broken" });
    const r = await runBuildLoop("build", { delegate, verify, maxIters: 2 });
    expect(r).toMatchObject({ ok: false, iterations: 2 });
    expect(delegate).toHaveBeenCalledTimes(2);
  });

  it("re-delegates with the failure when the agent itself errors, and only verifies a success", async () => {
    const delegate = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, output: "claude timed out" })
      .mockResolvedValueOnce({ ok: true, output: "built" });
    const verify = vi.fn().mockResolvedValue({ ok: true, detail: "" });
    const r = await runBuildLoop("build", { delegate, verify });
    expect(r.ok).toBe(true);
    expect(verify).toHaveBeenCalledTimes(1); // verify runs only after a successful delegate
    expect(delegate.mock.calls[1]![0]).toContain("claude timed out");
  });
});
