import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { ToolContext } from "./types.js";
import type { CaptureSource } from "./taste-visual.js";
import { buildTasteCritiqueTool } from "./taste-critique.js";

const FX = join(import.meta.dirname, "..", "taste", "__fixtures__");
const BASE = readFileSync(join(FX, "app-base.png"));
const CHANGED = readFileSync(join(FX, "app-changed.png"));

function makeCtx(): ToolContext {
  return {
    root: "/tmp",
    safety: {} as ToolContext["safety"],
    requestApproval: vi.fn(async () => true),
  };
}

/** A capture source that returns whichever fixture is currently queued. */
function sourceOf(bytesRef: { value: Buffer }): CaptureSource {
  return async () => bytesRef.value;
}

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-home-"));
  process.env.VANTA_HOME = home;
});
afterEach(async () => {
  delete process.env.VANTA_HOME;
  await rm(home, { recursive: true, force: true });
});

describe("taste_critique visual actions", () => {
  it("snapshot -> match -> regression -> rebaseline through the tool", async () => {
    const ref = { value: BASE };
    const tool = buildTasteCritiqueTool(async () => sourceOf(ref));
    const ctx = makeCtx();

    const lock = await tool.execute({ action: "snapshot", name: "app-hero", target: "http://localhost:3000" }, ctx);
    expect(lock.ok).toBe(true);
    expect(lock.output).toMatch(/baseline locked/);

    const same = await tool.execute({ action: "regress", name: "app-hero", target: "http://localhost:3000" }, ctx);
    expect(same.ok).toBe(true);
    expect(same.output).toMatch(/visual match/);

    ref.value = CHANGED;
    const regress = await tool.execute({ action: "regress", name: "app-hero", target: "http://localhost:3000" }, ctx);
    expect(regress.ok).toBe(false);
    expect(regress.output).toMatch(/VISUAL REGRESSION/);

    const rebase = await tool.execute({ action: "rebaseline", name: "app-hero", target: "http://localhost:3000" }, ctx);
    expect(rebase.ok).toBe(true);
    const after = await tool.execute({ action: "regress", name: "app-hero", target: "http://localhost:3000" }, ctx);
    expect(after.ok).toBe(true);
    expect(after.output).toMatch(/visual match/);
  });

  it("reports no-baseline before a snapshot exists", async () => {
    const tool = buildTasteCritiqueTool(async () => sourceOf({ value: BASE }));
    const r = await tool.execute({ action: "regress", name: "fresh", target: "http://x" }, makeCtx());
    expect(r.ok).toBe(true);
    expect(r.output).toMatch(/no baseline/);
  });

  it("degrades cleanly when no screenshot source is available", async () => {
    const tool = buildTasteCritiqueTool(async () => null);
    const r = await tool.execute({ action: "snapshot", name: "app-hero", target: "http://x" }, makeCtx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/need a screenshot source/);
    expect(r.output).toMatch(/playwright install chromium/);
  });

  it("requires a name for visual actions", async () => {
    const tool = buildTasteCritiqueTool(async () => sourceOf({ value: BASE }));
    const r = await tool.execute({ action: "snapshot", target: "http://x" }, makeCtx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/needs a name/);
  });

  it("keeps describeForSafety read/compare-shaped (kernel Allow)", () => {
    const tool = buildTasteCritiqueTool(async () => null);
    expect(tool.describeForSafety!({ action: "snapshot", name: "hero" })).toBe("taste_critique snapshot hero");
    expect(tool.describeForSafety!({ action: "regress", name: "hero" })).toBe("taste_critique regress hero");
  });
});
