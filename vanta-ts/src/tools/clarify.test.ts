import { describe, it, expect } from "vitest";
import { clarifyTool } from "./clarify.js";

const ctx = { root: "/tmp", safety: {} as never, requestApproval: async () => true };

describe("clarify tool — free-text (backward compat)", () => {
  it("returns the question text without options", async () => {
    const res = await clarifyTool.execute({ question: "Which file should I edit?" }, ctx);
    expect(res.ok).toBe(true);
    expect(res.output).toContain("Which file should I edit?");
    expect(res.output).toContain("Await the user's answer before proceeding.");
  });

  it("numbers each option when options are provided", async () => {
    const res = await clarifyTool.execute(
      { question: "Which environment?", options: ["staging", "production"] },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain("1. staging");
    expect(res.output).toContain("2. production");
    expect(res.output).toContain("Which environment?");
  });

  it("returns ok:false when question is empty", async () => {
    const res = await clarifyTool.execute({ question: "" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("Invalid args");
  });

  it("returns ok:false when question is missing", async () => {
    const res = await clarifyTool.execute({}, ctx);
    expect(res.ok).toBe(false);
  });

  it("describeForSafety returns the expected string", () => {
    expect(clarifyTool.describeForSafety?.({})).toBe("ask user a clarifying question");
  });
});

describe("clarify tool — structured interview request (fields, no response)", () => {
  it("renders typed fields as an interview prompt and awaits an answer", async () => {
    const res = await clarifyTool.execute(
      {
        question: "Configure the deploy.",
        fields: [
          { name: "env", type: "enum", choices: ["staging", "production"] },
          { name: "replicas", type: "number", label: "Replica count" },
        ],
      },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain("Configure the deploy.");
    expect(res.output).toContain("env: [staging | production]");
    expect(res.output).toContain("Replica count: <number>");
    expect(res.output).toContain("Await the user's answer before proceeding.");
  });

  it("marks a non-required field as optional in the prompt", async () => {
    const res = await clarifyTool.execute(
      {
        question: "Details?",
        fields: [{ name: "note", type: "string", required: false }],
      },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain("note (optional): <string>");
  });

  it("rejects an enum field declared without choices", async () => {
    const res = await clarifyTool.execute(
      { question: "Pick.", fields: [{ name: "env", type: "enum" }] },
      ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain('enum field "env" requires non-empty choices');
  });
});

describe("clarify tool — structured response validation (fields + response)", () => {
  const fields = [
    { name: "env", type: "enum" as const, choices: ["staging", "production"] },
    { name: "replicas", type: "number" as const },
    { name: "confirm", type: "boolean" as const },
  ];

  it("accepts a valid response and returns typed values", async () => {
    const res = await clarifyTool.execute(
      { question: "Configure.", fields, response: { env: "production", replicas: 3, confirm: true } },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(JSON.parse(res.output)).toEqual({ env: "production", replicas: 3, confirm: true });
  });

  it("rejects a value outside the declared enum choices", async () => {
    const res = await clarifyTool.execute(
      { question: "Configure.", fields, response: { env: "dev", replicas: 3, confirm: true } },
      ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("Invalid response");
  });

  it("rejects a wrong-typed value (string where number expected)", async () => {
    const res = await clarifyTool.execute(
      { question: "Configure.", fields, response: { env: "staging", replicas: "three", confirm: true } },
      ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("Invalid response");
  });

  it("rejects a missing required field", async () => {
    const res = await clarifyTool.execute(
      { question: "Configure.", fields, response: { env: "staging", confirm: true } },
      ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("Invalid response");
  });

  it("rejects unknown keys not declared in fields (strict)", async () => {
    const res = await clarifyTool.execute(
      {
        question: "Configure.",
        fields,
        response: { env: "staging", replicas: 1, confirm: false, sneaky: "x" },
      },
      ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("Invalid response");
  });

  it("allows omitting an optional field", async () => {
    const res = await clarifyTool.execute(
      {
        question: "Name?",
        fields: [
          { name: "name", type: "string" },
          { name: "nickname", type: "string", required: false },
        ],
        response: { name: "Ada" },
      },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(JSON.parse(res.output)).toEqual({ name: "Ada" });
  });
});
