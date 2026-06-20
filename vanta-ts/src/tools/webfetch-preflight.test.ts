import { describe, it, expect } from "vitest";
import {
  shouldSkipPreflight,
  SKIP_WEBFETCH_PREFLIGHT_ENV,
} from "./webfetch-preflight.js";
import type { Settings } from "../settings/store.js";

const noEnv: NodeJS.ProcessEnv = {};

describe("shouldSkipPreflight", () => {
  it("defaults to false when settings and env are both unset (preflight ON)", () => {
    expect(shouldSkipPreflight({}, noEnv)).toBe(false);
  });

  it("is false when the setting is explicitly false", () => {
    const settings: Settings = { skipWebFetchPreflight: false };

    expect(shouldSkipPreflight(settings, noEnv)).toBe(false);
  });

  it("is true when the setting is explicitly true", () => {
    const settings: Settings = { skipWebFetchPreflight: true };

    expect(shouldSkipPreflight(settings, noEnv)).toBe(true);
  });

  it("is true when the env override is set, even with no setting", () => {
    const env = { [SKIP_WEBFETCH_PREFLIGHT_ENV]: "1" };

    expect(shouldSkipPreflight({}, env)).toBe(true);
  });

  it("accepts common truthy env spellings", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on", " On "]) {
      expect(shouldSkipPreflight({}, { [SKIP_WEBFETCH_PREFLIGHT_ENV]: v })).toBe(true);
    }
  });

  it("treats non-truthy env values (and unset) as off", () => {
    for (const v of ["0", "false", "no", "off", "", "maybe"]) {
      expect(shouldSkipPreflight({}, { [SKIP_WEBFETCH_PREFLIGHT_ENV]: v })).toBe(false);
    }
  });

  it("setting true wins regardless of a falsey env value", () => {
    const settings: Settings = { skipWebFetchPreflight: true };

    expect(shouldSkipPreflight(settings, { [SKIP_WEBFETCH_PREFLIGHT_ENV]: "0" })).toBe(true);
  });
});
