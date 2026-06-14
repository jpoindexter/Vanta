import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { regressionLockTool } from "./regression-lock.js";
import type { ToolContext } from "./types.js";

function makeCtx(approve: boolean): ToolContext {
  return {
    root: "/tmp",
    safety: {} as ToolContext["safety"],
    requestApproval: vi.fn(async () => approve),
  };
}

let home: string;
let prevHome: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-verify-"));
  prevHome = process.env.VANTA_HOME;
  process.env.VANTA_HOME = home;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("regression_lock validation", () => {
  it("rejects a missing action", async () => {
    const r = await regressionLockTool.execute({}, makeCtx(true));
    expect(r.ok).toBe(false);
    expect(r.output).toContain('needs an "action"');
  });

  it("rejects a lock missing claim/command/expect", async () => {
    const r = await regressionLockTool.execute({ action: "lock", claim: "x" }, makeCtx(true));
    expect(r.ok).toBe(false);
    expect(r.output).toContain("needs claim, command, and expect");
  });
});

describe("regression_lock lock + list", () => {
  it("locks a claim and lists it as unchecked", async () => {
    const locked = await regressionLockTool.execute(
      { action: "lock", claim: "echo works", command: "echo hello-token", expect: "hello-token" },
      makeCtx(true),
    );
    expect(locked.ok).toBe(true);
    expect(locked.output).toContain("Locked");

    const list = await regressionLockTool.execute({ action: "list" }, makeCtx(true));
    expect(list.output).toContain("echo-works");
    expect(list.output).toContain("·"); // locked glyph (not yet checked)
  });
});

describe("regression_lock check (real command)", () => {
  it("passes when the locked substring is still in the output", async () => {
    await regressionLockTool.execute(
      { action: "lock", id: "t1", claim: "c", command: "echo regression-token", expect: "regression-token" },
      makeCtx(true),
    );
    const r = await regressionLockTool.execute({ action: "check", id: "t1" }, makeCtx(true));
    expect(r.ok).toBe(true);
    expect(r.output).toContain("passing");
  });

  it("flags a regression when the substring is gone", async () => {
    await regressionLockTool.execute(
      { action: "lock", id: "t2", claim: "c", command: "echo something-else", expect: "expected-token" },
      makeCtx(true),
    );
    const r = await regressionLockTool.execute({ action: "check", id: "t2" }, makeCtx(true));
    expect(r.ok).toBe(false);
    expect(r.output).toContain("REGRESSED");
  });

  it("skips the run when approval is denied", async () => {
    await regressionLockTool.execute(
      { action: "lock", id: "t3", claim: "c", command: "echo x", expect: "x" },
      makeCtx(true),
    );
    const ctx = makeCtx(false);
    const r = await regressionLockTool.execute({ action: "check", id: "t3" }, ctx);
    expect(ctx.requestApproval).toHaveBeenCalledOnce();
    // nothing ran → empty report, no regression
    expect(r.output).toContain("No regression locks to check");
  });
});

describe("regression_lock describeForSafety", () => {
  it("surfaces the command at lock time so the kernel can assess it", () => {
    expect(
      regressionLockTool.describeForSafety?.({ action: "lock", command: "npm test" }),
    ).toBe("lock regression check: npm test");
    expect(regressionLockTool.describeForSafety?.({ action: "check" })).toBe("run regression checks");
  });
});
