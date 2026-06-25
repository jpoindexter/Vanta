import { describe, it, expect } from "vitest";
import {
  configState, configGroups, configRows, actionAt, configSummary,
  nextEffort, nextStyle, nextAnchor, GATE_KEYS,
} from "./config-view.js";
import type { Settings } from "../settings/store.js";

const noEnv = {} as NodeJS.ProcessEnv;

describe("config-view — effective state", () => {
  it("falls back to defaults with empty settings + env", () => {
    const s = configState({}, noEnv);
    expect(s.effort).toBe("medium");
    expect(s.outputStyle).toBe("normal");
    expect(s.composerAnchor).toBe("bottom");
    expect(s.autoMode).toBe(false);
    expect(s.gates.antiSlop).toBe(true);
    expect(s.gates.stallUnblock).toBe(true);
  });

  it("reads persisted settings when env is unset", () => {
    const settings: Settings = {
      effortLevel: "high",
      ui: { outputStyle: "concise", composerAnchor: "bottom" },
      autoMode: { enabled: true },
      gates: { antiSlop: false },
    };
    const s = configState(settings, noEnv);
    expect(s.effort).toBe("high");
    expect(s.outputStyle).toBe("concise");
    expect(s.composerAnchor).toBe("bottom");
    expect(s.autoMode).toBe(true);
    expect(s.gates.antiSlop).toBe(false);
  });

  it("env wins over persisted settings for env-overridable flags", () => {
    const settings: Settings = { effortLevel: "low", gates: { modeDetect: true }, autoMode: { enabled: true } };
    const env = { VANTA_EFFORT_LEVEL: "max", VANTA_MODE_DETECT: "0", VANTA_AUTO_MODE: "0" } as unknown as NodeJS.ProcessEnv;
    const s = configState(settings, env);
    expect(s.effort).toBe("max");
    expect(s.gates.modeDetect).toBe(false); // VANTA_MODE_DETECT=0 overrides setting true
    expect(s.autoMode).toBe(false); // VANTA_AUTO_MODE=0 overrides setting true
  });

  it("ignores an invalid env effort and falls back to the setting", () => {
    const s = configState({ effortLevel: "high" }, { VANTA_EFFORT_LEVEL: "bogus" } as unknown as NodeJS.ProcessEnv);
    expect(s.effort).toBe("high");
  });
});

describe("config-view — grouping + actions", () => {
  const state = configState({}, noEnv);

  it("groups rows under Session / Permissions / ND gates", () => {
    const titles = configGroups(state).map((g) => g.title);
    expect(titles).toEqual(["Session", "Permissions", "ND gates"]);
  });

  it("exposes the four ND gate rows, none of the raw dangerous fields", () => {
    const labels = configRows(state).map((r) => r.label);
    expect(labels.filter((l) => l.includes("gate") || l.includes("Mode detection") || l.includes("Anti-slop") || l.includes("Stall"))).toHaveLength(GATE_KEYS.length);
    expect(labels.join(" ")).not.toMatch(/allowedTools|blockedTools|\benv\b|rules/i);
  });

  it("the model row defers to the /model picker command, not a toggle", () => {
    const model = configRows(state).find((r) => r.label === "Model");
    expect(model?.action).toEqual({ kind: "command", command: "/model" });
    expect(model?.bool).toBeUndefined();
  });

  it("actionAt maps the first row to cycleEffort and clamps past the end", () => {
    expect(actionAt(state, 0)).toEqual({ kind: "cycleEffort" });
    expect(actionAt(state, 999)).toEqual({ kind: "none" });
  });

  it("a gate row carries a toggleGate action with its key", () => {
    const anti = configRows(state).find((r) => r.label === "Anti-slop check");
    expect(anti?.action).toEqual({ kind: "toggleGate", gate: "antiSlop" });
    expect(anti?.bool).toBe(true);
  });

  it("configSummary reflects effort, style, and gate count", () => {
    expect(configSummary(state)).toBe("effort medium · normal · 4/4 gates");
  });
});

describe("config-view — pure cyclers", () => {
  it("nextEffort cycles low→medium→high→max→low", () => {
    expect(nextEffort("low")).toBe("medium");
    expect(nextEffort("max")).toBe("low");
  });

  it("nextStyle cycles concise→normal→verbose→concise", () => {
    expect(nextStyle("concise")).toBe("normal");
    expect(nextStyle("verbose")).toBe("concise");
  });

  it("nextAnchor toggles float↔bottom", () => {
    expect(nextAnchor("float")).toBe("bottom");
    expect(nextAnchor("bottom")).toBe("float");
  });
});
