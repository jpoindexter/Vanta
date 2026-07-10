import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reachTool } from "./reach-tool.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

describe("reach tool", () => {
  let home: string;
  let previous: string | undefined;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "vanta-reach-tool-"));
    previous = process.env.VANTA_HOME;
    process.env.VANTA_HOME = home;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  });
  it("validates the action", async () => {
    const r = await reachTool.execute({}, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain('needs an "action"');
  });

  it("doctor reports the registered channels", async () => {
    const r = await reachTool.execute({ action: "doctor" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("web");
    expect(r.output).toContain("twitter");
  });

  it("heal needs a channel + rejects unknown ones", async () => {
    expect((await reachTool.execute({ action: "heal" }, ctx)).output).toContain("needs a channel");
    expect((await reachTool.execute({ action: "heal", channel: "ghost" }, ctx)).output).toContain("unknown reach channel");
  });

  it("refuses to heal a built-in channel that can't break", async () => {
    const r = await reachTool.execute({ action: "heal", channel: "web" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("built-in");
  });

  it("describeForSafety surfaces the install/upgrade so the kernel gates heal", () => {
    expect(reachTool.describeForSafety?.({ action: "heal", channel: "twitter" })).toContain("repair reach backend");
    expect(reachTool.describeForSafety?.({ action: "doctor" })).toBe("reach doctor");
  });
});
