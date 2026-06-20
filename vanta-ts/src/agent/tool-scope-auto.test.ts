import { describe, it, expect } from "vitest";
import type { ToolSchema } from "../providers/interface.js";
import {
  DEFAULT_TOOL_SCOPE_THRESHOLD,
  estimateSchemaTokens,
  resolveToolScopeMode,
  shouldDeferTools,
} from "./tool-scope-auto.js";

function schema(name: string, descLen = 12, paramLen = 0): ToolSchema {
  const params: Record<string, unknown> =
    paramLen > 0
      ? { type: "object", properties: { a: { type: "string", description: "y".repeat(paramLen) } } }
      : { type: "object", properties: {} };
  return { name, description: "x".repeat(descLen), parameters: params };
}

/** A handful of small schemas — comfortably under the default token threshold. */
const fewSmall: ToolSchema[] = ["read_file", "write_file", "shell_cmd", "grep_files"].map((n) => schema(n));

/** One fat schema (long description + long param) — over the default threshold. */
const oneFat: ToolSchema[] = [schema("big_tool", 8000, 4000)];

describe("estimateSchemaTokens", () => {
  it("is zero for an empty set and additive across schemas", () => {
    expect(estimateSchemaTokens([])).toBe(0);
    const one = estimateSchemaTokens([schema("a")]);
    const two = estimateSchemaTokens([schema("a"), schema("a")]);
    expect(one).toBeGreaterThan(0);
    expect(two).toBe(one * 2);
  });

  it("counts more tokens for a large schema than a small one", () => {
    expect(estimateSchemaTokens(oneFat)).toBeGreaterThan(estimateSchemaTokens(fewSmall));
  });
});

describe("resolveToolScopeMode", () => {
  it("defaults to 'on' when unset (preserves current always-defer behavior)", () => {
    expect(resolveToolScopeMode(undefined)).toBe("on");
    expect(resolveToolScopeMode({})).toBe("on");
  });

  it("maps legacy '0' and the off aliases to 'off'", () => {
    for (const v of ["0", "off", "OFF", "false", "never", "none"]) {
      expect(resolveToolScopeMode({ VANTA_TOOL_SCOPE: v })).toBe("off");
    }
  });

  it("resolves 'auto' (case-insensitive, trimmed)", () => {
    expect(resolveToolScopeMode({ VANTA_TOOL_SCOPE: "auto" })).toBe("auto");
    expect(resolveToolScopeMode({ VANTA_TOOL_SCOPE: "  AUTO  " })).toBe("auto");
  });

  it("treats any unrecognized value (incl. '1'/'on') as 'on'", () => {
    expect(resolveToolScopeMode({ VANTA_TOOL_SCOPE: "1" })).toBe("on");
    expect(resolveToolScopeMode({ VANTA_TOOL_SCOPE: "on" })).toBe("on");
    expect(resolveToolScopeMode({ VANTA_TOOL_SCOPE: "wat" })).toBe("on");
  });
});

describe("shouldDeferTools", () => {
  it("mode 'on' (the default) always defers, regardless of size", () => {
    expect(shouldDeferTools(fewSmall, {})).toBe(true); // default
    expect(shouldDeferTools(fewSmall, { VANTA_TOOL_SCOPE: "on" })).toBe(true);
    expect(shouldDeferTools([], {})).toBe(true);
  });

  it("mode 'off' never defers, regardless of size", () => {
    expect(shouldDeferTools(oneFat, { VANTA_TOOL_SCOPE: "off" })).toBe(false);
    expect(shouldDeferTools(oneFat, { VANTA_TOOL_SCOPE: "0" })).toBe(false);
  });

  it("mode 'auto' stays inline (no defer) below the threshold", () => {
    expect(estimateSchemaTokens(fewSmall)).toBeLessThan(DEFAULT_TOOL_SCOPE_THRESHOLD);
    expect(shouldDeferTools(fewSmall, { VANTA_TOOL_SCOPE: "auto" })).toBe(false);
  });

  it("mode 'auto' defers above the threshold", () => {
    expect(estimateSchemaTokens(oneFat)).toBeGreaterThan(DEFAULT_TOOL_SCOPE_THRESHOLD);
    expect(shouldDeferTools(oneFat, { VANTA_TOOL_SCOPE: "auto" })).toBe(true);
  });

  it("mode 'auto' honors a configurable VANTA_TOOL_SCOPE_THRESHOLD", () => {
    // A tiny custom threshold flips the small set from inline to deferred.
    const tokens = estimateSchemaTokens(fewSmall);
    const below = { VANTA_TOOL_SCOPE: "auto", VANTA_TOOL_SCOPE_THRESHOLD: String(tokens + 1) };
    const above = { VANTA_TOOL_SCOPE: "auto", VANTA_TOOL_SCOPE_THRESHOLD: String(tokens - 1) };
    expect(shouldDeferTools(fewSmall, below)).toBe(false);
    expect(shouldDeferTools(fewSmall, above)).toBe(true);
  });

  it("mode 'auto' falls back to the default threshold on a bad override", () => {
    for (const bad of ["abc", "-5", "0", ""]) {
      // fewSmall is under the default → still inline despite the junk override
      expect(shouldDeferTools(fewSmall, { VANTA_TOOL_SCOPE: "auto", VANTA_TOOL_SCOPE_THRESHOLD: bad })).toBe(false);
    }
  });
});
