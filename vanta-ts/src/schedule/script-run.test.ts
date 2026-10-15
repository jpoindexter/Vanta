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

  it("does not expose synthetic provider credentials to the scheduled child", async () => {
    const res = await runCronScript("env", {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        OPENAI_API_KEY: "openai-must-not-cross",
        VANTA_GMAIL_TOKEN: "gmail-must-not-cross",
      },
    });
    expect(res.ok).toBe(true);
    expect(res.output).not.toContain("openai-must-not-cross");
    expect(res.output).not.toContain("gmail-must-not-cross");
    expect(res.output).not.toContain("OPENAI_API_KEY");
    expect(res.output).not.toContain("VANTA_GMAIL_TOKEN");
  });
});
