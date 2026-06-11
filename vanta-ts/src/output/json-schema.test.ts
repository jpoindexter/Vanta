import { describe, it, expect } from "vitest";
import {
  extractJson,
  validateAgainstSchema,
  validateOutput,
  buildSchemaInstruction,
} from "./json-schema.js";

const OBJ_SCHEMA = {
  type: "object",
  required: ["name", "score"],
  properties: {
    name: { type: "string" },
    score: { type: "number" },
    active: { type: "boolean" },
  },
};

// --- extractJson ---

describe("extractJson", () => {
  it("parses raw JSON object", () => {
    const r = extractJson('{"a":1}');
    expect(r.found).toBe(true);
    expect((r as { found: true; data: unknown }).data).toEqual({ a: 1 });
  });

  it("parses raw JSON array", () => {
    const r = extractJson("[1,2,3]");
    expect(r.found).toBe(true);
    expect((r as { found: true; data: unknown }).data).toEqual([1, 2, 3]);
  });

  it("extracts from fenced ```json block", () => {
    const text = "Here is your answer:\n```json\n{\"key\": \"value\"}\n```";
    const r = extractJson(text);
    expect(r.found).toBe(true);
    expect((r as { found: true; data: unknown }).data).toEqual({ key: "value" });
  });

  it("extracts from fenced ``` block without language hint", () => {
    const text = "```\n{\"x\": 42}\n```";
    const r = extractJson(text);
    expect(r.found).toBe(true);
    expect((r as { found: true; data: unknown }).data).toEqual({ x: 42 });
  });

  it("extracts first balanced JSON block from prose", () => {
    const text = 'I analyzed it. {"result": "ok"} Looks good.';
    const r = extractJson(text);
    expect(r.found).toBe(true);
    expect((r as { found: true; data: unknown }).data).toEqual({ result: "ok" });
  });

  it("returns not-found for plain text", () => {
    expect(extractJson("no json here")).toEqual({ found: false });
  });

  it("returns not-found for unclosed brace", () => {
    expect(extractJson("{ unclosed")).toEqual({ found: false });
  });
});

// --- validateAgainstSchema ---

describe("validateAgainstSchema", () => {
  it("returns no errors for a valid object", () => {
    expect(validateAgainstSchema({ name: "Alice", score: 0.9 }, OBJ_SCHEMA)).toEqual([]);
  });

  it("reports missing required fields", () => {
    const errors = validateAgainstSchema({ name: "Alice" }, OBJ_SCHEMA);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/score.*required/);
  });

  it("reports wrong type for a property", () => {
    const errors = validateAgainstSchema({ name: 42, score: 0.5 }, OBJ_SCHEMA);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/name.*expected string/);
  });

  it("passes when optional properties are absent", () => {
    expect(validateAgainstSchema({ name: "Bob", score: 0.5 }, OBJ_SCHEMA)).toEqual([]);
  });

  it("validates array items", () => {
    const schema = { type: "array", items: { type: "string" } };
    expect(validateAgainstSchema(["a", "b"], schema)).toEqual([]);
    const errors = validateAgainstSchema(["a", 42], schema);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/expected string/);
  });

  it("reports non-object when object expected", () => {
    const errors = validateAgainstSchema("not an object", OBJ_SCHEMA);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/expected object/);
  });

  it("reports non-array when array expected", () => {
    const errors = validateAgainstSchema("not an array", { type: "array" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/expected array/);
  });

  it("returns no errors when schema has no type", () => {
    expect(validateAgainstSchema("anything", {})).toEqual([]);
  });
});

// --- validateOutput ---

describe("validateOutput", () => {
  it("returns valid=true for correct JSON in text", () => {
    const result = validateOutput('{"name":"Carol","score":0.8}', OBJ_SCHEMA);
    expect(result.valid).toBe(true);
    expect((result as { valid: true; data: unknown }).data).toEqual({ name: "Carol", score: 0.8 });
  });

  it("returns valid=false when no JSON present", () => {
    const result = validateOutput("Here is my analysis.", OBJ_SCHEMA);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; errors: string[] }).errors[0]).toMatch(/no valid JSON/);
  });

  it("returns valid=false with schema errors", () => {
    const result = validateOutput('{"name":"Dave"}', OBJ_SCHEMA);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; errors: string[] }).errors[0]).toMatch(/score.*required/);
  });
});

// --- buildSchemaInstruction ---

describe("buildSchemaInstruction", () => {
  it("includes the schema JSON and format instruction", () => {
    const text = buildSchemaInstruction({ type: "object" });
    expect(text).toMatch(/MUST be a valid JSON/);
    expect(text).toMatch(/"type": "object"/);
  });
});
