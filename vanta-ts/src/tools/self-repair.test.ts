import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selfRepairTool } from "./self-repair.js";
import { recordGood } from "../self/detect.js";
import type { ToolContext } from "./types.js";

function makeCtx(approve: boolean): ToolContext {
  return {
    root: process.cwd(),
    safety: {} as ToolContext["safety"],
    requestApproval: vi.fn(async () => approve),
  };
}

let home: string;
let prevHome: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-repair-"));
  prevHome = process.env.VANTA_HOME;
  process.env.VANTA_HOME = home;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("self_repair validation", () => {
  it("rejects a missing action", async () => {
    const r = await selfRepairTool.execute({}, makeCtx(true));
    expect(r.ok).toBe(false);
    expect(r.output).toContain('needs an "action"');
  });

  it("rejects mark/rollback without a valid compartment", async () => {
    const r = await selfRepairTool.execute({ action: "rollback", compartment: "spleen" }, makeCtx(true));
    expect(r.ok).toBe(false);
    expect(r.output).toContain("valid compartment");
  });
});

describe("self_repair rollback safety rails", () => {
  it("refuses to roll back a protected compartment (never reaches approval)", async () => {
    const ctx = makeCtx(true);
    const r = await selfRepairTool.execute({ action: "rollback", compartment: "brainstem" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("protected");
    expect(ctx.requestApproval).not.toHaveBeenCalled();
  });

  it("refuses when no last-known-good marker exists", async () => {
    const ctx = makeCtx(true);
    const r = await selfRepairTool.execute({ action: "rollback", compartment: "memory" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("no last-known-good marker");
    expect(ctx.requestApproval).not.toHaveBeenCalled();
  });

  it("asks for approval and shows the discards-changes warning, then aborts on denial (no git run)", async () => {
    await recordGood({ compartment: "memory", sha: "abc123def456" });
    const ctx = makeCtx(false);
    const r = await selfRepairTool.execute({ action: "rollback", compartment: "memory" }, ctx);
    expect(ctx.requestApproval).toHaveBeenCalledOnce();
    const [prompt, reason] = (ctx.requestApproval as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(prompt).toContain("git checkout");
    expect(reason).toContain("discards");
    expect(r.ok).toBe(false);
    expect(r.output).toBe("denied");
  });

  it("refuses to auto-rollback limbs (no narrow path scope)", async () => {
    await recordGood({ compartment: "limbs", sha: "deadbeef0000" });
    const ctx = makeCtx(true);
    const r = await selfRepairTool.execute({ action: "rollback", compartment: "limbs" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("scoped");
    expect(ctx.requestApproval).not.toHaveBeenCalled();
  });
});

describe("self_repair mark + status", () => {
  it("marks the current HEAD as last-known-good and lists it in status", async () => {
    const marked = await selfRepairTool.execute({ action: "mark", compartment: "memory" }, makeCtx(true));
    expect(marked.ok).toBe(true);
    expect(marked.output).toContain("Marked memory");

    const status = await selfRepairTool.execute({ action: "status" }, makeCtx(true));
    expect(status.ok).toBe(true);
    expect(status.output).toContain("memory →");
  });

  it("status is clean when no markers exist", async () => {
    const r = await selfRepairTool.execute({ action: "status" }, makeCtx(true));
    expect(r.output).toContain("No last-known-good markers");
  });
});

describe("self_repair describeForSafety", () => {
  it("surfaces the git op for rollback so the kernel assesses it", () => {
    expect(selfRepairTool.describeForSafety?.({ action: "rollback", compartment: "memory" })).toContain("git checkout");
    expect(selfRepairTool.describeForSafety?.({ action: "mark", compartment: "memory" })).toBe("record self-repair marker");
  });
});
