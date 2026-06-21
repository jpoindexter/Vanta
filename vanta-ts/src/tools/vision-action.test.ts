import { describe, it, expect, vi } from "vitest";
import { visionActionTool, runVisionActionTool, formatVisionActionResult } from "./vision-action.js";
import { parseGroundResponse, parseChangedResponse, clickArgs, collectShots, chicagoActuator, buildLiveDeps } from "./vision-action-run.js";
import type { ToolContext } from "./types.js";
import type { VisionActionDeps, VisionActionResult } from "../vision-action/loop.js";
import { CHICAGO_ENV } from "../mcp/chicago-route.js";
import { makeChicagoRouter, type CallMcp } from "../mcp/chicago-client.js";
import type { LLMProvider } from "../providers/interface.js";

function ctx(approve = true): ToolContext {
  return { root: "/tmp", safety: {} as ToolContext["safety"], requestApproval: vi.fn(async () => approve) };
}

const okDeps = (): VisionActionDeps => {
  let n = 0;
  return {
    perceive: async () => ({ shot: `s${n++}` }),
    ground: async () => ({ found: true, x: 10, y: 20 }),
    act: async () => {},
    changed: (b, a) => b.shot !== a.shot,
  };
};

describe("parseGroundResponse", () => {
  it("parses found coordinates from JSON (even with surrounding prose/fences)", () => {
    expect(parseGroundResponse('here:\n```json\n{"found":true,"x":42,"y":99,"label":"Login"}\n```')).toEqual({ found: true, x: 42, y: 99, label: "Login" });
  });
  it("is not-found when found=false or coordinates are missing", () => {
    expect(parseGroundResponse('{"found":false}')).toEqual({ found: false });
    expect(parseGroundResponse('{"found":true,"label":"x"}')).toEqual({ found: false });
    expect(parseGroundResponse("not json at all")).toEqual({ found: false });
  });
});

describe("parseChangedResponse", () => {
  it("CHANGED → true; SAME/UNCHANGED/ambiguous → false (retry-safe)", () => {
    expect(parseChangedResponse("CHANGED")).toBe(true);
    expect(parseChangedResponse("the screen CHANGED noticeably")).toBe(true);
    expect(parseChangedResponse("SAME")).toBe(false);
    expect(parseChangedResponse("UNCHANGED")).toBe(false);
    expect(parseChangedResponse("hard to tell")).toBe(false);
  });
});

describe("clickArgs / collectShots", () => {
  it("builds a cliclick center-click arg, rounding", () => {
    expect(clickArgs(10.6, 20.2)).toEqual(["c:11,20"]);
  });
  it("collects unique before/after shot paths", () => {
    const result: VisionActionResult = {
      ok: true, attempts: 1, note: "x",
      steps: [{ status: "acted", target: "t", grounded: { found: true }, before: { shot: "a" }, after: { shot: "b" }, note: "" }],
    };
    expect(collectShots(result).sort()).toEqual(["a", "b"]);
  });
});

describe("runVisionActionTool", () => {
  it("runs the loop and reports success when the action lands", async () => {
    const r = await runVisionActionTool({ target: "Login" }, ctx(), okDeps());
    expect(r.ok).toBe(true);
    expect(r.output).toMatch(/✓/);
    expect(r.output).toMatch(/acted/);
  });

  it("denies without acting when the user rejects approval", async () => {
    const deps = okDeps();
    const act = vi.spyOn(deps, "act");
    const r = await runVisionActionTool({ target: "Login" }, ctx(false), deps);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/denied/);
    expect(act).not.toHaveBeenCalled();
  });

  it("reports a mis-click failure after exhausting retries", async () => {
    const deps: VisionActionDeps = { perceive: async () => ({ shot: "x" }), ground: async () => ({ found: true, x: 1, y: 1 }), act: async () => {}, changed: () => false };
    const r = await runVisionActionTool({ target: "Login", maxAttempts: 2 }, ctx(), deps);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/mis-click/);
  });

  it("rejects a missing target", async () => {
    const r = await runVisionActionTool({}, ctx(), okDeps());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/needs a "target"/);
  });

  it("surfaces a thrown actuator error (e.g. cliclick missing) as a clean failure", async () => {
    const deps: VisionActionDeps = { perceive: async () => ({ shot: "x" }), ground: async () => ({ found: true, x: 1, y: 1 }), act: async () => { throw new Error("cliclick not found"); }, changed: () => true };
    const r = await runVisionActionTool({ target: "Login" }, ctx(), deps);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/vision_action failed: cliclick not found/);
  });
});

describe("chicagoActuator — CHICAGO MCP routing seam (default-off)", () => {
  const callMcp: CallMcp = async () => ({ content: [{ type: "text", text: "ok" }] });

  it("is null when VANTA_CHICAGO_MCP is unset (local path stays byte-identical)", () => {
    expect(chicagoActuator({}, callMcp)).toBeNull();
  });

  it("is null when enabled but no callMcp seam is supplied", () => {
    expect(chicagoActuator({ [CHICAGO_ENV]: "chicago" }, undefined)).toBeNull();
  });

  it("returns a router bound to the configured server when enabled + seam present", () => {
    const router = chicagoActuator({ [CHICAGO_ENV]: "chicago" }, callMcp);
    expect(router?.server).toBe("chicago");
  });
});

describe("buildLiveDeps — actuation routes through CHICAGO when a router is supplied", () => {
  // A provider whose vision replies ground a target and report a change.
  const provider = {
    complete: vi.fn(async (msgs: Array<{ content: string }>) =>
      msgs[0]?.content?.includes("just before and just after")
        ? { text: "CHANGED" }
        : { text: '{"found":true,"x":42,"y":58,"label":"target"}' },
    ),
  } as unknown as LLMProvider;

  it("routes the click through the mounted computer tool (not cliclick) when a router is set", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const router = makeChicagoRouter({
      callMcp: async (tool, args) => {
        calls.push([tool, args]);
        return { content: [{ type: "text", text: "clicked" }] };
      },
    });
    const deps = buildLiveDeps(provider, router);
    // Exercise just the actuator with a grounded target — no screencapture/cliclick.
    await deps.act({ found: true, x: 42, y: 58 });
    expect(calls).toEqual([["computer", { action: "left_click", coordinate: [42, 58] }]]);
  });

  it("a routed-click failure throws a clean error (the loop turns it into a failure)", async () => {
    const router = makeChicagoRouter({
      callMcp: async () => {
        throw new Error("server down");
      },
    });
    const deps = buildLiveDeps(provider, router);
    await expect(deps.act({ found: true, x: 1, y: 2 })).rejects.toThrow(/CHICAGO MCP click failed.*server down/);
  });

  it("with no router (default), act needs coordinates and would use the local driver", async () => {
    const deps = buildLiveDeps(provider, null);
    // Missing coordinates → the local-driver guard fires (byte-identical to before).
    await expect(deps.act({ found: true })).rejects.toThrow(/no coordinates/);
  });
});

describe("visionActionTool metadata", () => {
  it("describeForSafety names the target so the kernel gates the action", () => {
    expect(visionActionTool.describeForSafety?.({ target: "Buy button" })).toMatch(/vision-guided click.*Buy button/);
  });
  it("formats a result with a per-step summary", () => {
    const out = formatVisionActionResult({ ok: false, attempts: 1, note: "nope", steps: [{ status: "not_found", target: "t", grounded: { found: false }, before: { shot: "a" }, note: "missing" }] });
    expect(out).toMatch(/✗ nope/);
    expect(out).toMatch(/1\. not_found — missing/);
  });
});
