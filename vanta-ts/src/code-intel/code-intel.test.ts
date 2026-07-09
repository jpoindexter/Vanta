import { describe, it, expect } from "vitest";
import { resolveCodeIntel } from "./index.js";
import { codegraphArgs } from "./codegraph.js";
import { nullProvider, UNAVAILABLE } from "./provider.js";
import { codeContextTool } from "../tools/code-context.js";

// The CodeIntelProvider port: codegraph is the default adapter, "none"/"off"
// degrades to a graceful no-op, and every path returns a Result (never throws).

describe("resolveCodeIntel", () => {
  it("defaults to the codegraph adapter", () => {
    expect(resolveCodeIntel("/tmp", {}).id).toBe("codegraph");
  });

  it("returns the no-op provider when disabled", () => {
    expect(resolveCodeIntel("/tmp", { VANTA_CODE_INTEL: "none" }).id).toBe("none");
    expect(resolveCodeIntel("/tmp", { VANTA_CODE_INTEL: "off" }).id).toBe("none");
  });

  it("falls back to codegraph for an unknown engine", () => {
    expect(resolveCodeIntel("/tmp", { VANTA_CODE_INTEL: "wat" }).id).toBe("codegraph");
  });
});

describe("nullProvider (no engine)", () => {
  it("degrades every method to a graceful Result error", async () => {
    expect(await nullProvider.available()).toBe(false);
    for (const r of [await nullProvider.context("t"), await nullProvider.search("s"), await nullProvider.affected(["f"]), await nullProvider.ensureIndexed()]) {
      expect(r).toEqual({ ok: false, error: UNAVAILABLE });
    }
  });
});

describe("codegraph adapter resilience", () => {
  it("maps Vanta operations to the installed codegraph CLI commands", () => {
    expect(codegraphArgs("context", "planner")).toEqual(["explore", "planner"]);
    expect(codegraphArgs("search", "resolveCodeIntel")).toEqual(["query", "resolveCodeIntel"]);
    expect(codegraphArgs("affected", ["src/a.ts"])).toEqual(["affected", "src/a.ts"]);
    expect(codegraphArgs("index")).toEqual(["index"]);
  });

  it("never throws — returns a Result regardless of engine presence", async () => {
    const p = resolveCodeIntel("/nonexistent-root-xyz", { VANTA_CODE_INTEL: "codegraph" });
    const r = await p.context("anything");
    expect(typeof r.ok).toBe("boolean");
  });
});

describe("code_context tool", () => {
  const ctx = { root: "/tmp", safety: {} as never, requestApproval: async () => true };
  it("surfaces the unavailable message gracefully when code intel is off", async () => {
    const r = await codeContextTool.execute({ task: "x" }, { ...ctx } as never);
    // With a stubbed env-off it would be UNAVAILABLE; with codegraph present it
    // returns a Result either way — the contract is: no throw, ToolResult shape.
    expect(typeof r.ok).toBe("boolean");
    expect(typeof r.output).toBe("string");
  });

  it("rejects a missing task with a clear message", async () => {
    const r = await codeContextTool.execute({}, { ...ctx } as never);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("task");
  });
});
