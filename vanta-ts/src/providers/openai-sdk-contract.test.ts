import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { expect, it } from "vitest";
import { OpenAIProvider } from "./openai.js";
import type { StreamChunk, ToolSchema } from "./interface.js";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

async function withProvider(handler: Handler, run: (provider: OpenAIProvider) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing loopback address");
  const provider = new OpenAIProvider({
    apiKey: "test-only-not-a-real-token", model: "fixture-model",
    baseURL: `http://127.0.0.1:${address.port}/v1`, timeoutMs: 500,
  });
  try { await run(provider); }
  finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const tools: ToolSchema[] = [{
  name: "read_file", description: "Read a fixture",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
}];
const messages = [{ role: "user" as const, content: "Read the fixture" }];
const usage = { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 };

it("serializes the real SDK request and maps a tool completion", async () => {
  let requestBody = "";
  let requestPath = "";
  await withProvider((request, response) => {
    requestPath = request.url ?? "";
    request.on("data", (chunk) => { requestBody += String(chunk); });
    request.on("end", () => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: "fixture", object: "chat.completion", created: 1, model: "fixture-model", usage,
        choices: [{ index: 0, finish_reason: "tool_calls", message: {
          role: "assistant", content: "Inspecting", tool_calls: [{ id: "call-1", type: "function",
            function: { name: "read_file", arguments: '{"path":"fixture.md"}' } }],
        } }],
      }));
    });
  }, async (provider) => {
    expect(await provider.complete(messages, tools)).toMatchObject({
      text: "Inspecting", finishReason: "tool_calls", usage: { inputTokens: 12, outputTokens: 5 },
      toolCalls: [{ id: "call-1", name: "read_file", arguments: { path: "fixture.md" } }],
    });
  });
  expect(requestPath).toBe("/v1/chat/completions");
  expect(JSON.parse(requestBody)).toMatchObject({ model: "fixture-model", messages,
    tools: [{ type: "function", function: { name: "read_file", parameters: tools[0]!.parameters } }],
  });
});

it("consumes actual SDK SSE text, split arguments, finish reason and usage", async () => {
  await withProvider((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const frame = (delta: unknown, finish: string | null = null) => ({
      id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model",
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    for (const value of [
      frame({ content: "Ready", tool_calls: [{ index: 0, id: "call-1", type: "function",
        function: { name: "read_file", arguments: '{"path":' } }] }),
      frame({ tool_calls: [{ index: 0, function: { arguments: '"fixture.md"}' } }] }),
      frame({}, "tool_calls"), { choices: [], usage },
    ]) response.write(`data: ${JSON.stringify(value)}\n\n`);
    response.end("data: [DONE]\n\n");
  }, async (provider) => {
    const chunks: StreamChunk[] = [];
    for await (const chunk of provider.stream(messages, tools)) chunks.push(chunk);
    expect(chunks[0]).toEqual({ type: "text", delta: "Ready" });
    expect(chunks.at(-1)).toMatchObject({ type: "done", result: {
      text: "Ready", finishReason: "tool_calls", usage: { inputTokens: 12, outputTokens: 5 },
      toolCalls: [{ id: "call-1", name: "read_file", arguments: { path: "fixture.md" } }],
    } });
  });
});

it("reports authentication rejection without retrying it", async () => {
  let requests = 0;
  await withProvider((_request, response) => {
    requests += 1;
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: "fixture unauthorized", type: "authentication_error" } }));
  }, async (provider) => {
    await expect(provider.complete(messages, [])).rejects.toThrow("fixture unauthorized");
  });
  expect(requests).toBe(1);
});

it("honors an abort on an in-flight SDK request", async () => {
  let requests = 0;
  const controller = new AbortController();
  await withProvider((_request, _response) => {
    requests += 1;
    controller.abort();
  }, async (provider) => {
    await expect(provider.complete(messages, [], { signal: controller.signal })).rejects.toThrow(/abort/i);
  });
  expect(requests).toBe(1);
});
