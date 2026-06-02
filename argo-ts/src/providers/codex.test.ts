import { describe, it, expect } from "vitest";
import { CodexProvider, toCodexInput, toCodexTools, sanitizeCodexParams } from "./codex.js";
import type { Message } from "../types.js";

describe("sanitizeCodexParams", () => {
  it("strips top-level combinators the codex backend rejects", () => {
    const out = sanitizeCodexParams({
      type: "object",
      properties: { a: { type: "string" } },
      anyOf: [{}],
      oneOf: [{}],
      allOf: [{}],
      enum: ["x"],
      not: {},
    });
    expect(out).not.toHaveProperty("anyOf");
    expect(out).not.toHaveProperty("oneOf");
    expect(out).not.toHaveProperty("allOf");
    expect(out).not.toHaveProperty("enum");
    expect(out).not.toHaveProperty("not");
    expect(out.properties).toEqual({ a: { type: "string" } });
  });
  it("forces type:object and a properties map", () => {
    const out = sanitizeCodexParams({ type: "string" });
    expect(out.type).toBe("object");
    expect(out.properties).toEqual({});
  });
  it("preserves combinators nested inside properties", () => {
    const out = sanitizeCodexParams({
      type: "object",
      properties: { a: { anyOf: [{ type: "string" }, { type: "number" }] } },
    });
    expect(out.properties).toEqual({ a: { anyOf: [{ type: "string" }, { type: "number" }] } });
  });
});

describe("toCodexTools", () => {
  it("produces flat Responses-API function tools", () => {
    const [tool] = toCodexTools([
      { name: "f", description: "d", parameters: { type: "object", properties: {} } },
    ]) as Array<Record<string, unknown>>;
    expect(tool).toMatchObject({ type: "function", name: "f", description: "d", strict: false });
    expect(tool!.parameters).toMatchObject({ type: "object" });
  });
});

describe("toCodexInput", () => {
  it("attaches images to a user turn as input_image parts", () => {
    const { input } = toCodexInput([
      { role: "user", content: "what is this?", images: [{ mime: "image/png", dataBase64: "AAAA" }] },
    ]);
    expect(input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "what is this?" },
          { type: "input_image", image_url: "data:image/png;base64,AAAA" },
        ],
      },
    ]);
  });

  it("maps each Argo role onto the right Responses item", () => {
    const messages: Message[] = [
      { role: "system", content: "be terse" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "calling", toolCalls: [{ id: "c1", name: "f", arguments: { x: 1 } }] },
      { role: "tool", toolCallId: "c1", name: "f", content: "result" },
    ];
    const { instructions, input } = toCodexInput(messages);
    expect(instructions).toBe("be terse");
    expect(input).toEqual([
      { role: "user", content: [{ type: "input_text", text: "hi" }] },
      { role: "assistant", content: [{ type: "output_text", text: "calling" }] },
      { type: "function_call", call_id: "c1", name: "f", arguments: JSON.stringify({ x: 1 }) },
      { type: "function_call_output", call_id: "c1", output: "result" },
    ]);
  });
});

const SSE = [
  `data: {"type":"response.output_text.delta","delta":"Hello"}`,
  ``,
  `data: {"type":"response.output_text.delta","delta":" there"}`,
  ``,
  `data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call_1","name":"get_weather","arguments":"{\\"city\\":\\"Paris\\"}"}}`,
  ``,
  `data: {"type":"response.completed","response":{"usage":{"input_tokens":42,"output_tokens":7}}}`,
  ``,
].join("\n");

describe("CodexProvider.stream", () => {
  const provider = new CodexProvider({
    model: "gpt-5.5",
    loadCreds: async () => ({ accessToken: "tok", accountId: "acc" }),
    fetchImpl: (async () => new Response(SSE, { status: 200, headers: { "content-type": "text/event-stream" } })) as typeof fetch,
  });

  it("yields text deltas then a done chunk with the assembled tool call", async () => {
    const chunks = [];
    for await (const c of provider.stream([{ role: "user", content: "weather?" }], [])) chunks.push(c);
    const deltas = chunks.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.delta : ""));
    expect(deltas).toEqual(["Hello", " there"]);
    const done = chunks.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type !== "done") throw new Error("no done chunk");
    expect(done.result.text).toBe("Hello there");
    expect(done.result.toolCalls).toEqual([{ id: "call_1", name: "get_weather", arguments: { city: "Paris" } }]);
    expect(done.result.finishReason).toBe("tool_calls");
    expect(done.result.usage).toEqual({ inputTokens: 42, outputTokens: 7 });
  });

  it("complete() returns the same assembled result", async () => {
    const result = await provider.complete([{ role: "user", content: "weather?" }], []);
    expect(result.text).toBe("Hello there");
    expect(result.toolCalls[0]?.name).toBe("get_weather");
  });

  it("throws an actionable error on a non-OK response", async () => {
    const p = new CodexProvider({
      model: "gpt-5.5",
      loadCreds: async () => ({ accessToken: "tok", accountId: "acc" }),
      fetchImpl: (async () => new Response("nope", { status: 401 })) as typeof fetch,
    });
    await expect(p.complete([{ role: "user", content: "x" }], [])).rejects.toThrow(/Codex request failed \(401\)/);
  });
});
