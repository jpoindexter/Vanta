import { describe, it, expect } from "vitest";
import { parseBlueprint, parseVarArgs, resolveVars, applyTemplate, planBlueprint, type Blueprint } from "./apply.js";

// VANTA-BLUEPRINTS — pure scaffold core.

const bp: Blueprint = {
  name: "demo",
  description: "d",
  vars: [{ key: "name", description: "", default: undefined }, { key: "greeting", description: "", default: "hi" }],
  files: [{ path: "src/{{name}}.ts", content: "// {{greeting}} from {{name}}\nexport const x = \"{{name}}\";" }],
};

describe("parseBlueprint", () => {
  it("validates a well-formed blueprint and applies defaults", () => {
    const p = parseBlueprint({ name: "x", files: [{ path: "a", content: "b" }] });
    expect(p?.description).toBe("");
    expect(p?.vars).toEqual([]);
  });
  it("rejects a blueprint with no files", () => {
    expect(parseBlueprint({ name: "x", files: [] })).toBeNull();
    expect(parseBlueprint({ files: [{ path: "a", content: "b" }] })).toBeNull(); // no name
  });
});

describe("parseVarArgs", () => {
  it("parses k=v pairs (values may contain =)", () => {
    expect(parseVarArgs(["name=foo", "url=http://x?a=b"])).toEqual({ name: "foo", url: "http://x?a=b" });
  });
  it("ignores args without =", () => {
    expect(parseVarArgs(["bare", "k=v"])).toEqual({ k: "v" });
  });
});

describe("resolveVars", () => {
  it("uses provided values, falls back to defaults", () => {
    const r = resolveVars(bp, { name: "auth" });
    expect(r).toEqual({ values: { name: "auth", greeting: "hi" } });
  });
  it("reports missing required vars (no value, no default)", () => {
    const r = resolveVars(bp, {});
    expect(r).toEqual({ missing: ["name"] });
  });
});

describe("applyTemplate", () => {
  it("substitutes {{key}} and leaves unknown placeholders intact", () => {
    expect(applyTemplate("{{a}}-{{b}}", { a: "X" })).toBe("X-{{b}}");
    expect(applyTemplate("{{ spaced }}", { spaced: "ok" })).toBe("ok");
  });
});

describe("planBlueprint", () => {
  it("substitutes vars in both paths and contents, joined under the target dir", () => {
    const plan = planBlueprint(bp, { name: "auth", greeting: "yo" }, "/tmp/proj/");
    expect(plan).toHaveLength(1);
    expect(plan[0]!.path).toBe("/tmp/proj/src/auth.ts");
    expect(plan[0]!.content).toContain("// yo from auth");
    expect(plan[0]!.content).toContain('export const x = "auth";');
  });
});
