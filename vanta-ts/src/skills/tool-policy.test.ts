import { describe, it, expect } from "vitest";
import {
  parseSkillToolPolicy,
  skillAllowedToolNames,
  isModelInvocable,
  type SkillToolPolicy,
} from "./tool-policy.js";

const ALL_TOOLS = ["read_file", "write_file", "shell_cmd", "grep_files"];

describe("parseSkillToolPolicy — allowedTools", () => {
  it("absent allowedTools => undefined (unrestricted)", () => {
    expect(parseSkillToolPolicy({ name: "x" }).allowedTools).toBeUndefined();
  });

  it("parses an array of tool names into a clean allowlist", () => {
    const p = parseSkillToolPolicy({ allowedTools: ["read_file", "grep_files"] });
    expect(p.allowedTools).toEqual(["read_file", "grep_files"]);
  });

  it("preserves an empty array as a meaningful empty allowlist (not unset)", () => {
    expect(parseSkillToolPolicy({ allowedTools: [] }).allowedTools).toEqual([]);
  });

  it("trims, drops blanks/non-strings, and dedupes (first-seen order)", () => {
    const p = parseSkillToolPolicy({
      allowedTools: [" read_file ", "read_file", "", 7, null, "grep_files"],
    });
    expect(p.allowedTools).toEqual(["read_file", "grep_files"]);
  });

  it("treats a non-array (string) allowedTools as unset (unrestricted), not empty", () => {
    expect(parseSkillToolPolicy({ allowedTools: "read_file" }).allowedTools).toBeUndefined();
  });

  it("treats garbage (object / number / null) allowedTools as unset", () => {
    expect(parseSkillToolPolicy({ allowedTools: { a: 1 } }).allowedTools).toBeUndefined();
    expect(parseSkillToolPolicy({ allowedTools: 42 }).allowedTools).toBeUndefined();
    expect(parseSkillToolPolicy({ allowedTools: null }).allowedTools).toBeUndefined();
  });
});

describe("parseSkillToolPolicy — disableModelInvocation", () => {
  it("absent => false (model-invocable, default)", () => {
    expect(parseSkillToolPolicy({}).disableModelInvocation).toBe(false);
  });

  it("boolean true => true", () => {
    expect(parseSkillToolPolicy({ disableModelInvocation: true }).disableModelInvocation).toBe(true);
  });

  it('flat-YAML string "true" (any case, trimmed) => true', () => {
    expect(parseSkillToolPolicy({ disableModelInvocation: "true" }).disableModelInvocation).toBe(true);
    expect(parseSkillToolPolicy({ disableModelInvocation: " TRUE " }).disableModelInvocation).toBe(true);
  });

  it("false / 'false' / garbage => false", () => {
    expect(parseSkillToolPolicy({ disableModelInvocation: false }).disableModelInvocation).toBe(false);
    expect(parseSkillToolPolicy({ disableModelInvocation: "false" }).disableModelInvocation).toBe(false);
    expect(parseSkillToolPolicy({ disableModelInvocation: "yes" }).disableModelInvocation).toBe(false);
    expect(parseSkillToolPolicy({ disableModelInvocation: 1 }).disableModelInvocation).toBe(false);
  });
});

describe("parseSkillToolPolicy — combined / unchanged-behavior default", () => {
  it("a skill with neither field = unrestricted + model-invocable", () => {
    const p = parseSkillToolPolicy({ name: "plain", description: "no policy fields" });
    expect(p.allowedTools).toBeUndefined();
    expect(isModelInvocable(p)).toBe(true);
    expect(skillAllowedToolNames(p, ALL_TOOLS)).toEqual(ALL_TOOLS);
  });
});

describe("skillAllowedToolNames", () => {
  it("undefined allowedTools => every present tool (deduped, order-preserving)", () => {
    const p: SkillToolPolicy = { disableModelInvocation: false };
    expect(skillAllowedToolNames(p, ["read_file", "read_file", "shell_cmd"])).toEqual([
      "read_file",
      "shell_cmd",
    ]);
  });

  it("intersects the allowlist with present names, following present-name order", () => {
    const p = parseSkillToolPolicy({ allowedTools: ["grep_files", "read_file"] });
    expect(skillAllowedToolNames(p, ALL_TOOLS)).toEqual(["read_file", "grep_files"]);
  });

  it("never grants an absent tool (allowlisted-but-missing is a no-op)", () => {
    const p = parseSkillToolPolicy({ allowedTools: ["read_file", "no_such_tool"] });
    expect(skillAllowedToolNames(p, ALL_TOOLS)).toEqual(["read_file"]);
  });

  it("empty allowlist => no tools", () => {
    const p = parseSkillToolPolicy({ allowedTools: [] });
    expect(skillAllowedToolNames(p, ALL_TOOLS)).toEqual([]);
  });

  it("empty present set => [] regardless of allowlist", () => {
    expect(skillAllowedToolNames(parseSkillToolPolicy({ allowedTools: ["read_file"] }), [])).toEqual([]);
  });
});

describe("isModelInvocable", () => {
  it("true when disableModelInvocation is false (default)", () => {
    expect(isModelInvocable(parseSkillToolPolicy({}))).toBe(true);
  });

  it("false when disableModelInvocation is true", () => {
    expect(isModelInvocable(parseSkillToolPolicy({ disableModelInvocation: true }))).toBe(false);
  });
});
