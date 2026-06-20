import { describe, it, expect } from "vitest";
import {
  newWatchState,
  hashDistance,
  detectChange,
  runVisionWatchStep,
  type Frame,
  type VisionWatchDeps,
  type WatchState,
} from "./watch.js";

function frame(tag: string): Frame {
  return { bytes: new TextEncoder().encode(tag) };
}

type FakeOpts = { hashes?: string[]; threshold?: number; alertOk?: boolean };
type FakeRec = { deps: VisionWatchDeps; describeCalls: () => number; alertTexts: () => string[] };

/** A recording fake substrate: hash returns a per-frame canned digest; describe
 *  and alert record their calls. No real capture/vision/network. */
function fakeDeps(frames: Frame[], opts: FakeOpts = {}): FakeRec {
  let captureIdx = 0;
  let hashIdx = 0;
  let describeCalls = 0;
  const alertTexts: string[] = [];
  const cannedHashes = opts.hashes;
  const deps: VisionWatchDeps = {
    capture: async () => frames[Math.min(captureIdx++, frames.length - 1)]!,
    hash: cannedHashes
      ? () => cannedHashes[Math.min(hashIdx++, cannedHashes.length - 1)]!
      : (f) => new TextDecoder().decode(f.bytes),
    describe: async (f) => {
      describeCalls++;
      return `description of ${new TextDecoder().decode(f.bytes)}`;
    },
    alert: async (text) => {
      alertTexts.push(text);
      return opts.alertOk ?? true;
    },
    threshold: opts.threshold,
  };
  return { deps, describeCalls: () => describeCalls, alertTexts: () => alertTexts };
}

describe("hashDistance", () => {
  it("is 0 for identical hashes", () => {
    expect(hashDistance("abc", "abc")).toBe(0);
  });
  it("is 1 for fully differing equal-length hashes", () => {
    expect(hashDistance("aaa", "bbb")).toBe(1);
  });
  it("is the differing fraction for partial differences", () => {
    expect(hashDistance("abcd", "abxy")).toBe(0.5);
  });
  it("is 1 for unequal-length hashes", () => {
    expect(hashDistance("abc", "abcd")).toBe(1);
  });
  it("is 1 for two distinct empty-vs-nonempty hashes, 0 for two identical empties", () => {
    expect(hashDistance("", "x")).toBe(1); // unequal length
    expect(hashDistance("", "")).toBe(0); // identical (both empty) → no distance
  });
});

describe("detectChange", () => {
  it("is false when there is no prior frame (the baseline)", () => {
    expect(detectChange(null, "abc")).toBe(false);
  });
  it("is false when the hash is identical", () => {
    expect(detectChange("abc", "abc")).toBe(false);
  });
  it("is true on any difference at the default zero threshold", () => {
    expect(detectChange("abc", "abd")).toBe(true);
  });
  it("respects a threshold so a minor change does not count", () => {
    // 1 of 4 chars differ → distance 0.25; threshold 0.5 → not a change.
    expect(detectChange("abcd", "abce", 0.5)).toBe(false);
    // 3 of 4 differ → distance 0.75 > 0.5 → a change.
    expect(detectChange("abcd", "axyz", 0.5)).toBe(true);
  });
});

describe("runVisionWatchStep", () => {
  it("treats the first frame as a baseline — no describe, no alert", async () => {
    const f = fakeDeps([frame("scene-a")]);
    const state = newWatchState();
    const step = await runVisionWatchStep(f.deps, state);
    expect(step.changed).toBe(false);
    expect(step.alerted).toBe(false);
    expect(step.description).toBeUndefined();
    expect(f.describeCalls()).toBe(0);
    expect(f.alertTexts()).toEqual([]);
    expect(state.prevHash).toBe("scene-a");
    expect(step.note).toBe("baseline frame captured");
  });

  it("does NOT alert when the frame is unchanged", async () => {
    const f = fakeDeps([frame("scene-a"), frame("scene-a")]);
    const state: WatchState = { prevHash: null };
    await runVisionWatchStep(f.deps, state); // baseline
    const step = await runVisionWatchStep(f.deps, state); // identical frame
    expect(step.changed).toBe(false);
    expect(step.alerted).toBe(false);
    expect(f.describeCalls()).toBe(0);
    expect(f.alertTexts()).toEqual([]);
    expect(step.note).toBe("no meaningful change");
  });

  it("describes and alerts on a meaningful change", async () => {
    const f = fakeDeps([frame("scene-a"), frame("scene-b")]);
    const state = newWatchState();
    await runVisionWatchStep(f.deps, state); // baseline scene-a
    const step = await runVisionWatchStep(f.deps, state); // scene-b → change
    expect(step.changed).toBe(true);
    expect(step.alerted).toBe(true);
    expect(step.description).toBe("description of scene-b");
    expect(f.describeCalls()).toBe(1);
    expect(f.alertTexts()).toEqual(["description of scene-b"]);
    expect(state.prevHash).toBe("scene-b");
    expect(step.note).toBe("change detected — described and alerted");
  });

  it("does not count a sub-threshold change as meaningful", async () => {
    // hashes differ by 1/4 chars; threshold 0.5 → not meaningful.
    const f = fakeDeps([frame("a"), frame("b")], { hashes: ["abcd", "abce"], threshold: 0.5 });
    const state = newWatchState();
    await runVisionWatchStep(f.deps, state); // baseline abcd
    const step = await runVisionWatchStep(f.deps, state); // abce → distance 0.25
    expect(step.changed).toBe(false);
    expect(f.describeCalls()).toBe(0);
    expect(f.alertTexts()).toEqual([]);
  });

  it("degrades when capture fails — no change, no throw", async () => {
    const deps: VisionWatchDeps = {
      capture: async () => { throw new Error("screen capture failed"); },
      hash: () => "x",
      describe: async () => "n/a",
      alert: async () => true,
    };
    const state: WatchState = { prevHash: "prior" };
    const step = await runVisionWatchStep(deps, state);
    expect(step.changed).toBe(false);
    expect(step.alerted).toBe(false);
    expect(step.note).toBe("capture failed: screen capture failed");
    expect(state.prevHash).toBe("prior"); // baseline untouched on a failed capture
  });

  it("degrades when describe fails but still advances the baseline", async () => {
    const deps: VisionWatchDeps = {
      capture: async () => frame("scene-b"),
      hash: (fr) => new TextDecoder().decode(fr.bytes),
      describe: async () => { throw new Error("model is not vision-capable"); },
      alert: async () => true,
    };
    const state: WatchState = { prevHash: "scene-a" };
    const step = await runVisionWatchStep(deps, state);
    expect(step.changed).toBe(true);
    expect(step.alerted).toBe(false);
    expect(step.description).toBeUndefined();
    expect(step.note).toBe("describe failed: model is not vision-capable");
    expect(state.prevHash).toBe("scene-b"); // advanced so it won't re-alert on the same frame
  });

  it("reports a change as not-alerted when the gateway rejects the alert", async () => {
    const f = fakeDeps([frame("scene-a"), frame("scene-b")], { alertOk: false });
    const state = newWatchState();
    await runVisionWatchStep(f.deps, state); // baseline
    const step = await runVisionWatchStep(f.deps, state); // change, alert returns false
    expect(step.changed).toBe(true);
    expect(step.description).toBe("description of scene-b");
    expect(step.alerted).toBe(false);
    expect(step.note).toBe("change detected and described, but the alert was not delivered");
  });

  it("degrades when the alert throws — change kept, alerted false", async () => {
    const deps: VisionWatchDeps = {
      capture: async () => frame("scene-b"),
      hash: (fr) => new TextDecoder().decode(fr.bytes),
      describe: async () => "a thing appeared",
      alert: async () => { throw new Error("gateway unreachable"); },
    };
    const state: WatchState = { prevHash: "scene-a" };
    const step = await runVisionWatchStep(deps, state);
    expect(step.changed).toBe(true);
    expect(step.description).toBe("a thing appeared");
    expect(step.alerted).toBe(false);
    expect(step.note).toBe("alert failed: gateway unreachable");
  });
});
