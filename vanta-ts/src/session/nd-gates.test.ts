import { describe, it, expect } from "vitest";
import { decorateNudge } from "./nd-gates.js";
import { defaultNdPreferences } from "../nd/engine.js";
import type { NdPreferences } from "../nd/types.js";

const prefs = (over: Partial<NdPreferences> = {}): NdPreferences => ({ ...defaultNdPreferences(), ...over });

const READ_NUDGE = "🔎 8 turns of reading/analysis without building anything.";
const TIME_NUDGE = "⏱ 50 min on this session.\n  Worth a checkpoint or a break?";

describe("decorateNudge", () => {
  it("DEFAULT profile (medium/ranges) returns the nudge unchanged byte-for-byte", () => {
    expect(decorateNudge(READ_NUDGE, prefs())).toBe(READ_NUDGE);
    expect(decorateNudge(TIME_NUDGE, prefs())).toBe(TIME_NUDGE);
  });

  it("low sensory load strips decoration on any nudge", () => {
    expect(decorateNudge(READ_NUDGE, prefs({ sensoryLoad: "low" }))).toBe(
      "8 turns of reading/analysis without building anything.",
    );
  });

  it("points time support drops the range tail from the time nudge", () => {
    const out = decorateNudge(TIME_NUDGE, prefs({ timeSupport: "points" }));
    expect(out).toBe("⏱ 50 min on this session.");
  });

  it("off time support suppresses the time nudge (empty → caller drops it)", () => {
    expect(decorateNudge(TIME_NUDGE, prefs({ timeSupport: "off" }))).toBe("");
  });

  it("off time support leaves a non-time nudge intact", () => {
    expect(decorateNudge(READ_NUDGE, prefs({ timeSupport: "off" }))).toBe(READ_NUDGE);
  });

  it("composes time-support then sensory-load (points + low) on the time nudge", () => {
    const out = decorateNudge(TIME_NUDGE, prefs({ timeSupport: "points", sensoryLoad: "low" }));
    expect(out).toBe("50 min on this session.");
  });
});
