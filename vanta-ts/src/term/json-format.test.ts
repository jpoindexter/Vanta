import { describe, it, expect } from "vitest";
import { formatJsonInOutput } from "./json-format.js";

describe("formatJsonInOutput", () => {
  it("pretty-prints a whole compact JSON object", () => {
    const input = '{"a":1,"b":[2,3]}';
    const result = formatJsonInOutput(input);
    expect(result).toContain("\n");
    expect(result).toContain('"a": 1');
    expect(result).toMatch(/^ {2}"a"/m);
  });

  it("pretty-prints a whole compact JSON array", () => {
    const input = '[1,2,3]';
    const result = formatJsonInOutput(input);
    expect(result).toContain("\n");
    expect(result).toContain("1,");
  });

  it("expands JSON lines in mixed log, leaving plain lines unchanged", () => {
    const input = 'starting\n{"event":"x","n":5}\ndone';
    const result = formatJsonInOutput(input);
    const lines = result.split("\n");
    expect(lines[0]).toBe("starting");
    expect(result).toContain('"event": "x"');
    expect(result).toContain('"n": 5');
    expect(lines[lines.length - 1]).toBe("done");
  });

  it("expands both lines in JSONL (two JSON lines)", () => {
    const line1 = '{"id":1,"val":"a"}';
    const line2 = '{"id":2,"val":"b"}';
    const input = `${line1}\n${line2}`;
    const result = formatJsonInOutput(input);
    expect(result).toContain('"id": 1');
    expect(result).toContain('"val": "a"');
    expect(result).toContain('"id": 2');
    expect(result).toContain('"val": "b"');
  });

  it("returns plain text unchanged when no JSON present", () => {
    const input = "no json here\njust plain text\n42 numbers but not objects";
    expect(formatJsonInOutput(input)).toBe(input);
  });

  it("returns malformed JSON line unchanged without throwing", () => {
    const input = "{not json";
    expect(() => formatJsonInOutput(input)).not.toThrow();
    expect(formatJsonInOutput(input)).toBe(input);
  });

  it("returns output unchanged when length exceeds maxLen", () => {
    const input = '{"a":1}';
    expect(formatJsonInOutput(input, 3)).toBe(input);
  });

  it("returns output unchanged when length equals maxLen boundary (just under)", () => {
    const input = '{"a":1}';
    expect(formatJsonInOutput(input, input.length)).not.toBe(input);
  });

  it("preserves leading indentation on JSON lines in mixed output", () => {
    // Per-line path: non-JSON prefix ensures whole-output parse doesn't fire
    const input = 'log\n  {"x":1}\nend';
    const result = formatJsonInOutput(input);
    const lines = result.split("\n");
    // First expanded line of the JSON block should carry the two-space indent
    expect(lines[1]).toBe("  {");
  });

  it("handles empty string without throwing", () => {
    expect(() => formatJsonInOutput("")).not.toThrow();
    expect(formatJsonInOutput("")).toBe("");
  });
});
