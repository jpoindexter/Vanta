import { describe, it, expect } from "vitest";
import { repairToolArgs, coerceToSchema, repairAndCoerce } from "./tool-call-repair.js";

describe("repairToolArgs — clean input", () => {
  it("parses valid JSON without marking repaired", () => {
    const r = repairToolArgs('{"path":"a.ts","line":3}');
    expect(r.repaired).toBe(false);
    expect(r.strategy).toBe("json");
    expect(r.args).toEqual({ path: "a.ts", line: 3 });
  });
  it("treats empty / {} as empty args", () => {
    expect(repairToolArgs("").args).toEqual({});
    expect(repairToolArgs("{}").repaired).toBe(false);
    expect(repairToolArgs(null).args).toEqual({});
  });
});

describe("repairToolArgs — weak-model malformations", () => {
  it("strips ```json code fences", () => {
    const r = repairToolArgs('```json\n{"q":"hi"}\n```');
    expect(r.args).toEqual({ q: "hi" });
    expect(r.repaired).toBe(true);
    expect(r.strategy).toBe("fences");
  });
  it("extracts an object buried in prose", () => {
    const r = repairToolArgs('Here are the args: {"name":"x"} thanks');
    expect(r.args).toEqual({ name: "x" });
    expect(r.strategy).toBe("extract-object");
  });
  it("fixes trailing commas, single quotes, and Python literals", () => {
    const r = repairToolArgs("{'path': 'a.ts', 'recursive': True, 'limit': 5,}");
    expect(r.args).toEqual({ path: "a.ts", recursive: true, limit: 5 });
    expect(r.repaired).toBe(true);
  });
  it("quotes bare keys", () => {
    const r = repairToolArgs("{path: \"a.ts\", line: 2}");
    expect(r.args).toEqual({ path: "a.ts", line: 2 });
  });
  it("completes a truncated object (cut-off output)", () => {
    const r = repairToolArgs('{"command":"ls -la","cwd":"/tmp"');
    expect(r.args).toEqual({ command: "ls -la", cwd: "/tmp" });
    expect(r.strategy).toBe("complete-truncated");
  });
  it("completes a truncation that ends mid-string", () => {
    const r = repairToolArgs('{"text":"hello wor');
    expect(r.args).toEqual({ text: "hello wor" });
  });
  it("returns empty args (not {_raw}) when unrecoverable", () => {
    const r = repairToolArgs("total garbage <<<>>> no json here");
    expect(r.args).toEqual({});
    expect(r.strategy).toBe("unrecoverable");
    expect(r.args).not.toHaveProperty("_raw");
  });
});

describe("coerceToSchema", () => {
  const schema = {
    type: "object",
    properties: {
      line: { type: "integer" },
      ratio: { type: "number" },
      recursive: { type: "boolean" },
      label: { type: "string" },
      cap: { type: "integer", default: 10 },
    },
  };
  it("coerces stringified numbers and booleans", () => {
    const out = coerceToSchema({ line: "5", ratio: "0.5", recursive: "yes", label: 42 }, schema);
    expect(out).toEqual({ line: 5, ratio: 0.5, recursive: true, label: "42", cap: 10 });
  });
  it("fills declared defaults for missing keys", () => {
    expect(coerceToSchema({ line: 1 }, schema).cap).toBe(10);
  });
  it("leaves args untouched without a schema", () => {
    expect(coerceToSchema({ a: "1" }, undefined)).toEqual({ a: "1" });
  });
  it("does not coerce non-numeric strings", () => {
    expect(coerceToSchema({ line: "abc" }, schema).line).toBe("abc");
  });
});

describe("repairAndCoerce — the end-to-end weak-model path", () => {
  it("repairs malformed JSON AND coerces to the tool schema in one pass", () => {
    // A realistic fumble: fences + single quotes + a stringified number.
    const raw = "```\n{'path': 'src/x.ts', 'line': '12'}\n```";
    const r = repairAndCoerce(raw, {
      type: "object",
      properties: { path: { type: "string" }, line: { type: "integer" } },
    });
    expect(r.repaired).toBe(true);
    expect(r.args).toEqual({ path: "src/x.ts", line: 12 });
  });
});
