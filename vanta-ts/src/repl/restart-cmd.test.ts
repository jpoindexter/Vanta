import { describe, it, expect } from "vitest";
import { restart, RESTART_EXIT_CODE } from "./restart-cmd.js";
import type { ReplCtx } from "./types.js";

function ctxWith(env: NodeJS.ProcessEnv): ReplCtx {
  return { env } as unknown as ReplCtx;
}

describe("/restart handler", () => {
  it("signals a restart when the run.sh relaunch loop is active", async () => {
    const r = await restart("", ctxWith({ VANTA_RELAUNCH: "1" }));
    expect(r.restart).toBe(true);
    expect(r.output).toContain("reloading");
  });

  it("refuses with a hint when the relaunch loop is absent (no surprise quit)", async () => {
    const r = await restart("", ctxWith({}));
    expect(r.restart).toBeUndefined();
    expect(r.output).toMatch(/run\.sh/);
  });

  it("uses the sysexits TEMPFAIL sentinel 75", () => {
    expect(RESTART_EXIT_CODE).toBe(75);
  });
});
