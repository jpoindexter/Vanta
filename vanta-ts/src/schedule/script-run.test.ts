import { describe, it, expect } from "vitest";
import { runCronScript, scriptTimeoutMs } from "./script-run.js";

describe("scriptTimeoutMs", () => {
  it("defaults to 60s and reads VANTA_CRON_SCRIPT_TIMEOUT_SEC", () => {
    expect(scriptTimeoutMs({})).toBe(60_000);
    expect(scriptTimeoutMs({ VANTA_CRON_SCRIPT_TIMEOUT_SEC: "5" })).toBe(5_000);
    expect(scriptTimeoutMs({ VANTA_CRON_SCRIPT_TIMEOUT_SEC: "nope" })).toBe(60_000);
  });
});

describe("runCronScript", () => {
  it("captures stdout of a succeeding script", async () => {
    const res = await runCronScript("echo hello && echo world");
    expect(res).toEqual({ ok: true, output: "hello\nworld" });
  });

  it("reports a failing script with its exit detail, never throwing", async () => {
    const res = await runCronScript("echo partial && exit 3");
    expect(res.ok).toBe(false);
    expect(res.output).toContain("script failed");
    expect(res.output).toContain("partial");
  });

  it("kills a hung script at the timeout", async () => {
    const res = await runCronScript("sleep 5", { timeoutMs: 200 });
    expect(res.ok).toBe(false);
    expect(res.output).toContain("timed out");
  }, 10_000);
});
