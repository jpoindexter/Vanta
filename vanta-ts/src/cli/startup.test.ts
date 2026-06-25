import { describe, it, expect } from "vitest";
import { parseRunArgs } from "./startup.js";

describe("parseRunArgs", () => {
  it("preserves a flagless instruction (regression: index-0 was being dropped)", () => {
    expect(parseRunArgs(["what is 2+2?"])).toEqual({ instruction: "what is 2+2?", outputFormat: "text", jsonSchema: undefined });
  });

  it("preserves a multi-word flagless instruction (run.sh passes it as one arg)", () => {
    expect(parseRunArgs(["ask claude to reply READY"]).instruction).toBe("ask claude to reply READY");
  });

  it("joins multiple instruction args", () => {
    expect(parseRunArgs(["do", "the", "thing"]).instruction).toBe("do the thing");
  });

  it("strips --output-format + its value, keeps the instruction", () => {
    const r = parseRunArgs(["summarize the diff", "--output-format", "json"]);
    expect(r.instruction).toBe("summarize the diff");
    expect(r.outputFormat).toBe("json");
  });

  it("strips --json-schema + its value, keeps the instruction", () => {
    const r = parseRunArgs(["extract fields", "--json-schema", "/tmp/s.json"]);
    expect(r.instruction).toBe("extract fields");
    expect(r.jsonSchema).toBe("/tmp/s.json");
  });

  it("handles a flag before the instruction without eating instruction words", () => {
    const r = parseRunArgs(["--output-format", "text", "hello world"]);
    expect(r.instruction).toBe("hello world");
    expect(r.outputFormat).toBe("text");
  });
});
