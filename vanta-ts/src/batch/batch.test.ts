import { describe, it, expect, vi } from "vitest";
import { buildBatchInstruction, prCandidates, buildGhPrArgs, parsePrUrl, createBatchPrs, formatBatchReport } from "./batch.js";
import type { FleetReport, FleetWorker } from "../fleet/types.js";

const worker = (over: Partial<FleetWorker> = {}): FleetWorker => ({
  id: "w1", taskId: "t1", title: "Add login", status: "done", branch: "vanta/w1", worktreePath: "/wt/w1", updated: "2026-06-20T00:00:00Z", ...over,
});
const report = (workers: FleetWorker[]): FleetReport => ({ id: "batch-1", created: "c", updated: "u", workers });

describe("buildBatchInstruction", () => {
  it("appends the test gate", () => {
    expect(buildBatchInstruction("do X")).toMatch(/do X/);
    expect(buildBatchInstruction("do X")).toMatch(/run the project's test suite and FIX/);
  });
});

describe("prCandidates", () => {
  it("includes only completed workers (blocked → no PR, the test gate)", () => {
    const r = report([worker({ id: "a", status: "done" }), worker({ id: "b", status: "blocked" }), worker({ id: "c", status: "running" })]);
    expect(prCandidates(r).map((w) => w.id)).toEqual(["a"]);
  });
});

describe("buildGhPrArgs / parsePrUrl", () => {
  it("builds gh pr create argv with head/base/title", () => {
    expect(buildGhPrArgs(worker({ branch: "vanta/w1", title: "Add login" }), "main")).toEqual([
      "pr", "create", "--head", "vanta/w1", "--base", "main", "--title", "Add login", "--body", expect.stringContaining("vanta batch"),
    ]);
  });
  it("extracts the PR URL gh prints", () => {
    expect(parsePrUrl("Creating pull request...\nhttps://github.com/o/r/pull/7\n")).toBe("https://github.com/o/r/pull/7");
    expect(parsePrUrl("no url here")).toBeNull();
  });
});

describe("createBatchPrs", () => {
  const cwd = "/repo";
  const okPush = vi.fn(async () => ({ ok: true, stderr: "" }));

  it("pushes then opens a PR per completed worker, collecting URLs", async () => {
    const gh = vi.fn(async () => ({ ok: true, stdout: "https://github.com/o/r/pull/1", stderr: "" }));
    const r = report([worker({ id: "a", branch: "b-a" }), worker({ id: "b", status: "blocked" })]);
    const out = await createBatchPrs(r, "main", { gh, push: okPush, cwd });
    expect(out).toHaveLength(1); // only the done worker
    expect(out[0]?.url).toBe("https://github.com/o/r/pull/1");
    expect(okPush).toHaveBeenCalledWith("b-a", cwd);
  });

  it("records a push failure without calling gh", async () => {
    const gh = vi.fn(async () => ({ ok: true, stdout: "x", stderr: "" }));
    const push = vi.fn(async () => ({ ok: false, stderr: "no upstream" }));
    const out = await createBatchPrs(report([worker()]), "main", { gh, push, cwd });
    expect(out[0]?.error).toMatch(/push failed: no upstream/);
    expect(gh).not.toHaveBeenCalled();
  });

  it("records a gh failure", async () => {
    const gh = vi.fn(async () => ({ ok: false, stdout: "", stderr: "gh: not authenticated" }));
    const out = await createBatchPrs(report([worker()]), "main", { gh, push: okPush, cwd });
    expect(out[0]?.error).toMatch(/not authenticated/);
  });
});

describe("formatBatchReport", () => {
  it("summarizes URLs and statuses", () => {
    const r = report([worker({ id: "a", title: "Add login" }), worker({ id: "b", title: "Fix bug", status: "blocked" })]);
    const out = formatBatchReport(r, [{ workerId: "a", title: "Add login", branch: "b-a", url: "https://x/pull/1" }]);
    expect(out).toMatch(/1 PR\(s\) opened/);
    expect(out).toMatch(/Add login → https:\/\/x\/pull\/1/);
    expect(out).toMatch(/Fix bug \[blocked\]/);
  });
});
