import { describe, it, expect } from "vitest";
import {
  buildFramePlan,
  resolveGifSpec,
  frameDelayMs,
  gifRecordEnabled,
  buildAssemblyPlan,
  DEFAULT_FPS,
  FPS_MIN,
  FPS_MAX,
  FINAL_HOLD_MS,
  type GifStep,
} from "./gif-record.js";

const steps: GifStep[] = [
  { action: "navigate -> https://example.com" },
  { action: "click -> #buy" },
  { action: "type -> #email = a@b.co" },
];

/** Index a frame array, asserting the slot exists (satisfies noUncheckedIndexedAccess). */
function frameAt<T>(arr: T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`no frame at index ${i}`);
  return v;
}

describe("buildFramePlan", () => {
  it("returns one frame per step in order, labeled from the action", () => {
    const frames = buildFramePlan(steps);
    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f.afterStepIndex)).toEqual([0, 1, 2]);
    expect(frameAt(frames, 0).label).toBe("navigate -> https://example.com");
    expect(frameAt(frames, 1).label).toBe("click -> #buy");
  });

  it("returns [] when there are no steps (no steps -> no frames)", () => {
    expect(buildFramePlan([])).toEqual([]);
  });

  it("derives the per-frame delay from fps (1000/fps)", () => {
    const frames = buildFramePlan(steps, { fps: 4 });
    expect(frames.every((f) => f.delayMs === 250)).toBe(true);
  });

  it("uses the default fps delay when fps is unset", () => {
    const frames = buildFramePlan(steps);
    expect(frameAt(frames, 0).delayMs).toBe(Math.round(1000 / DEFAULT_FPS));
  });

  it("prefers an explicit label over the action", () => {
    const frames = buildFramePlan([{ action: "click -> #buy", label: "Click Buy" }]);
    expect(frameAt(frames, 0).label).toBe("Click Buy");
  });

  it("appends a final hold frame re-holding the last step when finalHold is set", () => {
    const frames = buildFramePlan(steps, { fps: 4, finalHold: true });
    expect(frames).toHaveLength(4);
    const last = frameAt(frames, frames.length - 1);
    expect(last.afterStepIndex).toBe(2);
    expect(last.label).toBe("type -> #email = a@b.co");
    expect(last.delayMs).toBe(FINAL_HOLD_MS);
  });

  it("honors a custom finalHoldMs for the appended frame", () => {
    const frames = buildFramePlan(steps, { finalHold: true, finalHoldMs: 2500 });
    expect(frameAt(frames, frames.length - 1).delayMs).toBe(2500);
  });

  it("control-strips a label sourced from the action (no escape injection)", () => {
    const esc = String.fromCharCode(0x1b); // ESC — would start an ANSI sequence
    const bel = String.fromCharCode(0x07); // BEL
    const c1 = String.fromCharCode(0x9b); // C1 CSI
    const dirty: GifStep[] = [{ action: `nav${esc}[31m${bel}#buy${c1}\nnext` }];
    const frames = buildFramePlan(dirty);
    // ESC/BEL/C1/newline -> spaces (collapsed + trimmed); printable text survives.
    const label = frameAt(frames, 0).label;
    expect(label).toBe("nav [31m #buy next");
    const hasControl = [...label].some((ch) => {
      const code = ch.charCodeAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    });
    expect(hasControl).toBe(false);
  });
});

describe("resolveGifSpec", () => {
  it("applies defaults: fps=DEFAULT_FPS, loop=true, no dimensions", () => {
    const spec = resolveGifSpec();
    expect(spec).toEqual({ fps: DEFAULT_FPS, loop: true });
    expect(spec.width).toBeUndefined();
    expect(spec.height).toBeUndefined();
  });

  it("carries explicit dimensions and loop=false", () => {
    const spec = resolveGifSpec({ width: 800, height: 600, loop: false, fps: 5 });
    expect(spec).toEqual({ fps: 5, loop: false, width: 800, height: 600 });
  });

  it("treats non-positive / non-finite fps as the default", () => {
    expect(resolveGifSpec({ fps: 0 }).fps).toBe(DEFAULT_FPS);
    expect(resolveGifSpec({ fps: -10 }).fps).toBe(DEFAULT_FPS);
    expect(resolveGifSpec({ fps: Number.NaN }).fps).toBe(DEFAULT_FPS);
    expect(resolveGifSpec({ fps: Number.POSITIVE_INFINITY }).fps).toBe(DEFAULT_FPS);
  });

  it("clamps a huge fps down to FPS_MAX", () => {
    expect(resolveGifSpec({ fps: 9999 }).fps).toBe(FPS_MAX);
  });

  it("rounds a fractional in-range fps and clamps to the bottom", () => {
    expect(resolveGifSpec({ fps: 1.4 }).fps).toBe(FPS_MIN);
    expect(resolveGifSpec({ fps: 12.6 }).fps).toBe(13);
  });

  it("ignores non-positive dimensions", () => {
    const spec = resolveGifSpec({ width: 0, height: -5 });
    expect(spec.width).toBeUndefined();
    expect(spec.height).toBeUndefined();
  });
});

describe("frameDelayMs", () => {
  it("is 1000/fps", () => {
    expect(frameDelayMs(resolveGifSpec({ fps: 2 }))).toBe(500);
    expect(frameDelayMs(resolveGifSpec({ fps: 4 }))).toBe(250);
    expect(frameDelayMs(resolveGifSpec({ fps: 10 }))).toBe(100);
  });
});

describe("gifRecordEnabled", () => {
  it("is off by default", () => {
    expect(gifRecordEnabled({})).toBe(false);
  });

  it("is off for any value other than exactly '1'", () => {
    expect(gifRecordEnabled({ VANTA_GIF_RECORD: "0" })).toBe(false);
    expect(gifRecordEnabled({ VANTA_GIF_RECORD: "true" })).toBe(false);
    expect(gifRecordEnabled({ VANTA_GIF_RECORD: "" })).toBe(false);
  });

  it("is on at exactly '1'", () => {
    expect(gifRecordEnabled({ VANTA_GIF_RECORD: "1" })).toBe(true);
  });
});

describe("buildAssemblyPlan", () => {
  it("reports frame count, total duration (sum of delays), and the spec", () => {
    const spec = resolveGifSpec({ fps: 4, width: 640, height: 480 });
    const frames = buildFramePlan(steps, { fps: 4 });
    const plan = buildAssemblyPlan(frames, spec);
    expect(plan.frameCount).toBe(3);
    expect(plan.totalDurationMs).toBe(250 * 3);
    expect(plan.spec).toEqual(spec);
  });

  it("sums heterogeneous delays including a final hold frame", () => {
    const spec = resolveGifSpec({ fps: 2 });
    const frames = buildFramePlan(steps, { fps: 2, finalHold: true, finalHoldMs: 1500 });
    const plan = buildAssemblyPlan(frames, spec);
    // 3 frames @ 500ms + 1 hold @ 1500ms
    expect(plan.frameCount).toBe(4);
    expect(plan.totalDurationMs).toBe(500 * 3 + 1500);
  });

  it("describes an empty job for no frames (no encode work)", () => {
    const spec = resolveGifSpec();
    const plan = buildAssemblyPlan(buildFramePlan([]), spec);
    expect(plan.frameCount).toBe(0);
    expect(plan.totalDurationMs).toBe(0);
    expect(plan.spec).toBe(spec);
  });
});
