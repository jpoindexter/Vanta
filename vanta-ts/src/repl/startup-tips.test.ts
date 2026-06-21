import { describe, it, expect } from "vitest";
import { SLASH_COMMANDS } from "./catalog.js";
import {
  STARTUP_TIPS,
  TIPS_ENV_VAR,
  pickStartupTip,
  startupTipsEnabled,
  formatStartupTip,
} from "./startup-tips.js";

const COMMAND_NAMES = new Set(SLASH_COMMANDS.map((c) => c.name));

/** Real documented env vars a tip is allowed to cite (kept tight on purpose). */
const REAL_ENV_VARS = new Set(["VANTA_VERIFY", "VANTA_PROACTIVE", "VANTA_TUI"]);

describe("STARTUP_TIPS content", () => {
  it("has 10-14 tips", () => {
    expect(STARTUP_TIPS.length).toBeGreaterThanOrEqual(10);
    expect(STARTUP_TIPS.length).toBeLessThanOrEqual(14);
  });

  it("prefixes every tip with the tip glyph", () => {
    for (const tip of STARTUP_TIPS) expect(tip.startsWith("💡 Tip: ")).toBe(true);
  });

  it("keeps each tip short (<= 80 chars)", () => {
    for (const tip of STARTUP_TIPS) expect(tip.length).toBeLessThanOrEqual(80);
  });

  it("references a real /command or VANTA_ token in every tip", () => {
    const tokenRe = /\/([a-z-]+)|\b(VANTA_[A-Z_]+)\b/;
    for (const tip of STARTUP_TIPS) {
      expect(tokenRe.test(tip), `tip has no command/env token: ${tip}`).toBe(true);
    }
  });

  it("cross-checks each cited /command against the real SLASH_COMMANDS", () => {
    const cmdRe = /\/([a-z][a-z-]*)/g;
    for (const tip of STARTUP_TIPS) {
      for (const m of tip.matchAll(cmdRe)) {
        const name = m[1] ?? "";
        expect(COMMAND_NAMES.has(name), `unknown command /${name} in: ${tip}`).toBe(true);
      }
    }
  });

  it("cross-checks each cited VANTA_ env var against the known-real set", () => {
    const envRe = /\b(VANTA_[A-Z_]+)\b/g;
    for (const tip of STARTUP_TIPS) {
      for (const m of tip.matchAll(envRe)) {
        const name = m[1] ?? "";
        expect(REAL_ENV_VARS.has(name), `unverified env var ${name} in: ${tip}`).toBe(true);
      }
    }
  });
});

describe("pickStartupTip", () => {
  it("is deterministic: same seed -> same tip", () => {
    expect(pickStartupTip(3)).toBe(pickStartupTip(3));
  });

  it("seed 0 -> first tip", () => {
    expect(pickStartupTip(0)).toBe(STARTUP_TIPS[0]);
  });

  it("uses seed % length", () => {
    for (let s = 0; s < STARTUP_TIPS.length * 2; s++) {
      expect(pickStartupTip(s)).toBe(STARTUP_TIPS[s % STARTUP_TIPS.length]);
    }
  });

  it("wraps a large seed", () => {
    const big = STARTUP_TIPS.length * 1000 + 5;
    expect(pickStartupTip(big)).toBe(STARTUP_TIPS[5 % STARTUP_TIPS.length]);
  });

  it("clamps a negative seed to a valid index (no crash, non-empty)", () => {
    const tip = pickStartupTip(-7);
    expect(STARTUP_TIPS).toContain(tip);
    expect(tip.length).toBeGreaterThan(0);
  });

  it("handles non-finite seeds without crashing", () => {
    expect(STARTUP_TIPS).toContain(pickStartupTip(NaN));
    expect(STARTUP_TIPS).toContain(pickStartupTip(Infinity));
  });
});

describe("startupTipsEnabled", () => {
  it("defaults ON when the env var is unset", () => {
    expect(startupTipsEnabled({})).toBe(true);
  });

  it("is OFF for falsy tokens", () => {
    for (const v of ["0", "false", "off", "no", "FALSE", " Off "]) {
      expect(startupTipsEnabled({ [TIPS_ENV_VAR]: v })).toBe(false);
    }
  });

  it("stays ON for any other value", () => {
    expect(startupTipsEnabled({ [TIPS_ENV_VAR]: "1" })).toBe(true);
    expect(startupTipsEnabled({ [TIPS_ENV_VAR]: "yes" })).toBe(true);
  });
});

describe("formatStartupTip", () => {
  it("returns a real tip when enabled", () => {
    expect(formatStartupTip(2, {})).toBe(STARTUP_TIPS[2]);
  });

  it("returns '' when disabled", () => {
    expect(formatStartupTip(2, { [TIPS_ENV_VAR]: "0" })).toBe("");
  });
});
