import { describe, it, expect } from "vitest";
import {
  resolvePrivacyLevel,
  isAllowed,
  PRIVACY_CALL_SITES,
  type PrivacyLevel,
  type TrafficCategory,
} from "./levels.js";

const ALL_CATEGORIES: TrafficCategory[] = [
  "provider",
  "kernel",
  "telemetry",
  "search",
  "fetch",
  "update",
  "other",
];

describe("resolvePrivacyLevel", () => {
  it("defaults to 'default' when nothing is set (current behavior)", () => {
    expect(resolvePrivacyLevel(undefined, {})).toBe("default");
    expect(resolvePrivacyLevel({}, {})).toBe("default");
  });

  it("reads settings.privacyLevel when no env override", () => {
    expect(resolvePrivacyLevel({ privacyLevel: "no-telemetry" }, {})).toBe("no-telemetry");
    expect(resolvePrivacyLevel({ privacyLevel: "essential" }, {})).toBe("essential");
  });

  it("env VANTA_PRIVACY overrides settings", () => {
    expect(
      resolvePrivacyLevel({ privacyLevel: "default" }, { VANTA_PRIVACY: "essential" }),
    ).toBe("essential");
    expect(
      resolvePrivacyLevel({ privacyLevel: "essential" }, { VANTA_PRIVACY: "no-telemetry" }),
    ).toBe("no-telemetry");
  });

  it("ignores an invalid env value and falls through to settings", () => {
    expect(
      resolvePrivacyLevel({ privacyLevel: "no-telemetry" }, { VANTA_PRIVACY: "bogus" }),
    ).toBe("no-telemetry");
  });

  it("ignores an invalid settings value and falls through to default", () => {
    expect(
      resolvePrivacyLevel({ privacyLevel: "nope" as PrivacyLevel }, {}),
    ).toBe("default");
  });
});

describe("isAllowed", () => {
  it("default → every category allowed (unchanged behavior)", () => {
    for (const category of ALL_CATEGORIES) {
      expect(isAllowed(category, "default")).toBe(true);
    }
  });

  it("no-telemetry → only telemetry blocked, the rest allowed", () => {
    for (const category of ALL_CATEGORIES) {
      const expected = category !== "telemetry";
      expect(isAllowed(category, "no-telemetry")).toBe(expected);
    }
    expect(isAllowed("telemetry", "no-telemetry")).toBe(false);
  });

  it("essential → only provider + kernel allowed", () => {
    expect(isAllowed("provider", "essential")).toBe(true);
    expect(isAllowed("kernel", "essential")).toBe(true);
  });

  it("essential → search/fetch/update/other/telemetry all blocked", () => {
    for (const category of ["telemetry", "search", "fetch", "update", "other"] as const) {
      expect(isAllowed(category, "essential")).toBe(false);
    }
  });
});

describe("PRIVACY_CALL_SITES", () => {
  it("names a call-site list for every traffic category (wiring follow-up)", () => {
    for (const category of ALL_CATEGORIES) {
      expect(Array.isArray(PRIVACY_CALL_SITES[category])).toBe(true);
      expect(PRIVACY_CALL_SITES[category].length).toBeGreaterThan(0);
    }
  });
});
