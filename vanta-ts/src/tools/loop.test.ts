import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loopTool } from "./loop.js";
import { listDefs, loadDef } from "../loop/store.js";
import type { ToolContext } from "./types.js";

// Minimal context shape used across tool tests in this codebase.
function makeCtx(root: string): ToolContext {
  return { root, safety: {} as never, requestApproval: async () => true };
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "loop-tool-test-"));
});

async function cleanup() { await rm(root, { recursive: true, force: true }); }

describe("loopTool add", () => {
  it("registers a loop and returns ok:true", async () => {
    const ctx = makeCtx(root);
    const res = await loopTool.execute({ action: "add", goal: "write better docs" }, ctx);
    expect(res.ok).toBe(true);
    expect(res.output).toContain("registered loop");
    const defs = await listDefs(join(root, ".vanta"));
    expect(defs.length).toBe(1);
    expect(defs[0]!.goal).toBe("write better docs");
    await cleanup();
  });

  it("accepts explicit id and trigger", async () => {
    const ctx = makeCtx(root);
    const res = await loopTool.execute(
      { action: "add", goal: "run the pipeline", id: "pipe-loop", trigger: "heartbeat:5" },
      ctx,
    );
    expect(res.ok).toBe(true);
    const def = await loadDef(join(root, ".vanta"), "pipe-loop");
    expect(def).not.toBeNull();
    expect(def?.trigger.kind).toBe("heartbeat");
    await cleanup();
  });

  it("returns ok:false when goal is missing", async () => {
    const ctx = makeCtx(root);
    const res = await loopTool.execute({ action: "add" }, ctx);
    expect(res.ok).toBe(false);
    await cleanup();
  });
});

describe("loopTool list", () => {
  it("returns no loops registered when empty", async () => {
    const ctx = makeCtx(root);
    const res = await loopTool.execute({ action: "list" }, ctx);
    expect(res.ok).toBe(true);
    expect(res.output).toContain("no loops registered");
    await cleanup();
  });

  it("output contains the registered loop id", async () => {
    const ctx = makeCtx(root);
    await loopTool.execute({ action: "add", goal: "test list tool", id: "list-test-id" }, ctx);
    const res = await loopTool.execute({ action: "list" }, ctx);
    expect(res.ok).toBe(true);
    expect(res.output).toContain("list-test-id");
    await cleanup();
  });
});

describe("loopTool show", () => {
  it("returns pretty JSON for a known id", async () => {
    const ctx = makeCtx(root);
    await loopTool.execute({ action: "add", goal: "show me what you have", id: "show-me" }, ctx);
    const res = await loopTool.execute({ action: "show", id: "show-me" }, ctx);
    expect(res.ok).toBe(true);
    expect(res.output).toContain("show me what you have");
    await cleanup();
  });

  it("returns ok:false for unknown id", async () => {
    const ctx = makeCtx(root);
    const res = await loopTool.execute({ action: "show", id: "not-here" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("unknown loop: not-here");
    await cleanup();
  });
});

describe("loopTool run (unknown id)", () => {
  it("returns ok:false for an unknown loop id", async () => {
    const ctx = makeCtx(root);
    const res = await loopTool.execute({ action: "run", id: "no-such-loop" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("unknown loop: no-such-loop");
    await cleanup();
  });
});

describe("loopTool invalid args", () => {
  it("returns ok:false when action is missing", async () => {
    const ctx = makeCtx(root);
    const res = await loopTool.execute({}, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("loop needs action");
    await cleanup();
  });
});

describe("loopTool describeForSafety", () => {
  it("returns action and id", () => {
    expect(loopTool.describeForSafety?.({ action: "add", id: "my-loop" })).toBe("loop add my-loop");
  });

  it("omits id when not provided", () => {
    expect(loopTool.describeForSafety?.({ action: "list" })).toBe("loop list");
  });
});
