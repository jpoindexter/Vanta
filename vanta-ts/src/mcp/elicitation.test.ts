import { describe, it, expect } from "vitest";
import {
  stripControl,
  parseElicitationRequest,
  buildElicitationPrompt,
  validateElicitationResponse,
  elicitationCancel,
  type ElicitationField,
} from "./elicitation.js";

// Pure parse → prompt → validate, tested against inline fixtures. No transport,
// no kernel, no IO. Mirrors the 2025-11-05 MCP elicitation wire shape:
// params.message + params.requestedSchema.{properties, required}.

const schemaParams = {
  message: "The deploy server needs your release details.",
  requestedSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "the release URL" },
      count: { type: "number", description: "how many builds" },
      confirm: { type: "boolean" },
      note: { type: "string" },
    },
    required: ["url", "count"],
  },
};

describe("stripControl", () => {
  it("removes whole ANSI escape sequences (no '[31m' residue) and neutralizes stray control chars", () => {
    // ESC sequences are dropped entirely; a bare BEL/NUL between words collapses
    // to a single space — no escape-sequence text reaches the terminal.
    expect(stripControl("\u001b[31mred\u001b[0mgreen")).toBe("redgreen");
    expect(stripControl("a\u0007bell\u0000nul")).toBe("a bell nul");
  });
  it("collapses whitespace runs and trims", () => {
    expect(stripControl("  a\t\t b\n\nc  ")).toBe("a b c");
  });
  it("returns empty string for a non-string input", () => {
    expect(stripControl(undefined)).toBe("");
    expect(stripControl(42)).toBe("");
    expect(stripControl(null)).toBe("");
  });
  it("caps absurdly long text", () => {
    expect(stripControl("x".repeat(5000)).length).toBe(500);
  });
});

describe("parseElicitationRequest", () => {
  it("parses the message and a field per schema property with correct types", () => {
    const req = parseElicitationRequest(schemaParams);
    expect(req.message).toBe("The deploy server needs your release details.");
    expect(req.fields).toEqual<ElicitationField[]>([
      { name: "url", type: "string", description: "the release URL", required: true },
      { name: "count", type: "number", description: "how many builds", required: true },
      { name: "confirm", type: "boolean", required: false },
      { name: "note", type: "string", required: false },
    ]);
  });

  it("flags required fields from requestedSchema.required and leaves the rest optional", () => {
    const req = parseElicitationRequest(schemaParams);
    expect(req.fields.filter((f) => f.required).map((f) => f.name)).toEqual(["url", "count"]);
  });

  it("coerces integer to number and unknown/absent type to string", () => {
    const req = parseElicitationRequest({
      requestedSchema: { properties: { n: { type: "integer" }, q: { type: "weird" }, x: {} } },
    });
    expect(req.fields).toEqual<ElicitationField[]>([
      { name: "n", type: "number", required: false },
      { name: "q", type: "string", required: false },
      { name: "x", type: "string", required: false },
    ]);
  });

  it("returns no fields when there is no schema (the unsupported/empty case)", () => {
    expect(parseElicitationRequest({ message: "hi" })).toEqual({ message: "hi", fields: [] });
    expect(parseElicitationRequest({})).toEqual({ message: "", fields: [] });
    expect(parseElicitationRequest(undefined)).toEqual({ message: "", fields: [] });
    expect(parseElicitationRequest("garbage")).toEqual({ message: "", fields: [] });
  });

  it("control-strips the untrusted message and field descriptions", () => {
    const req = parseElicitationRequest({
      message: "\u001b[2Joverwrite",
      requestedSchema: { properties: { f: { type: "string", description: "\u0007desc" } } },
    });
    expect(req.message).toBe("overwrite");
    expect(req.fields).toEqual([{ name: "f", type: "string", description: "desc", required: false }]);
  });

  it("tolerates a malformed schema (non-array required, non-object properties)", () => {
    const req = parseElicitationRequest({ requestedSchema: { properties: 5, required: "nope" } });
    expect(req.fields).toEqual([]);
  });
});

describe("buildElicitationPrompt", () => {
  it("lists fields as a numbered list with type and required/optional flag", () => {
    const prompt = buildElicitationPrompt(parseElicitationRequest(schemaParams));
    expect(prompt).toContain("The deploy server needs your release details.");
    expect(prompt).toContain("1. url (string, required) — the release URL");
    expect(prompt).toContain("2. count (number, required) — how many builds");
    expect(prompt).toContain("3. confirm (boolean, optional)");
    expect(prompt).toContain("4. note (string, optional)");
  });

  it("renders only the message when there are no fields", () => {
    expect(buildElicitationPrompt({ message: "just confirm", fields: [] })).toBe("just confirm");
  });

  it("uses a default header when the message is empty", () => {
    expect(buildElicitationPrompt({ message: "", fields: [] })).toBe(
      "An MCP server is requesting input.",
    );
  });

  it("emits no control chars even if a field name slipped through (defense in depth)", () => {
    const prompt = buildElicitationPrompt(parseElicitationRequest(schemaParams));
    // eslint-disable-next-line no-control-regex
    expect(prompt).not.toMatch(/[\u0000-\u0008\u000e-\u001f\u007f]/);
  });
});

describe("validateElicitationResponse", () => {
  const fields = parseElicitationRequest(schemaParams).fields;

  it("accepts and coerces each field by its type", () => {
    const res = validateElicitationResponse(fields, {
      url: "https://x",
      count: "3",
      confirm: "yes",
      note: "hello",
    });
    expect(res).toEqual({
      action: "accept",
      content: { url: "https://x", count: 3, confirm: true, note: "hello" },
    });
  });

  it("coerces boolean truthy/falsy spellings", () => {
    const bool: ElicitationField[] = [{ name: "b", type: "boolean", required: true }];
    expect(validateElicitationResponse(bool, { b: "no" })).toEqual({
      action: "accept",
      content: { b: false },
    });
    expect(validateElicitationResponse(bool, { b: "1" })).toEqual({
      action: "accept",
      content: { b: true },
    });
  });

  it("declines when a required field is missing", () => {
    expect(validateElicitationResponse(fields, { url: "https://x" })).toEqual({ action: "decline" });
  });

  it("declines when a required field is present but unparseable for its type", () => {
    expect(
      validateElicitationResponse(fields, { url: "https://x", count: "not-a-number" }),
    ).toEqual({ action: "decline" });
  });

  it("omits an absent optional field from content", () => {
    const res = validateElicitationResponse(fields, { url: "https://x", count: "2" });
    expect(res).toEqual({ action: "accept", content: { url: "https://x", count: 2 } });
    if (res.action === "accept") expect("confirm" in res.content).toBe(false);
  });

  it("omits an unparseable optional field rather than declining", () => {
    const optNum: ElicitationField[] = [{ name: "n", type: "number", required: false }];
    expect(validateElicitationResponse(optNum, { n: "abc" })).toEqual({
      action: "accept",
      content: {},
    });
  });

  it("accepts with empty content when there are no fields", () => {
    expect(validateElicitationResponse([], {})).toEqual({ action: "accept", content: {} });
  });
});

describe("elicitationCancel", () => {
  it("returns the current always-cancel default shape", () => {
    expect(elicitationCancel()).toEqual({
      action: "cancel",
      content: {},
      reason: "MCP elicitation UI is not available in this host",
    });
  });

  it("carries a control-stripped custom reason", () => {
    expect(elicitationCancel("\u001b[31moperator declined")).toEqual({
      action: "cancel",
      content: {},
      reason: "operator declined",
    });
  });
});
