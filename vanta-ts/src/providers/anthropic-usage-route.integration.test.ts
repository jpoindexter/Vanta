import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./anthropic.js";
import { consumeStream } from "../agent/stream-dispatch.js";
import { listRouteUsage, recordProviderCall, summarizeRouteUsage } from "../cost/route-ledger.js";

afterEach(() => vi.unstubAllEnvs());

it("retains actual SDK-stream cache usage through consumption and durable route readback", async () => {
  const root = await mkdtemp(join(tmpdir(), "vanta-anthropic-cache-route-"));
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    expect(req.url).toBe("/v1/messages");
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const events = [
        { type: "message_start", message: { id: "synthetic", type: "message", role: "assistant",
          model: "cache-route-proof", content: [], stop_reason: null, stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 1000 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Synthetic reply" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } },
        { type: "message_stop" },
      ];
      for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubEnv("ANTHROPIC_BASE_URL", baseURL);
  vi.stubEnv("VANTA_HOME", root);
  vi.stubEnv("VANTA_KEYCHAIN", "0");
  try {
    const provider = new AnthropicProvider({ apiKey: "synthetic-not-a-real-key", model: "cache-route-proof" });
    const text: string[] = [];
    const result = await consumeStream({
      stream: provider.stream([{ role: "user", content: "Synthetic usage proof" }], []),
      onTextDelta: delta => text.push(delta),
    });
    expect(result?.text).toBe("Synthetic reply");
    expect(text.join("")).toBe(result?.text);
    expect(result?.usage).toEqual({ inputTokens: 10, outputTokens: 5, cacheTokens: 1000 });
    const dataDir = join(root, ".vanta");
    await recordProviderCall(dataDir, {
      callId: "synthetic-stream", sessionId: "synthetic-session", agent: "integration-proof",
      route: { provider: "anthropic", model: provider.modelId(), baseRoute: baseURL, billingMode: "unknown" },
      usage: result?.usage,
    });
    const rows = await listRouteUsage(dataDir);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cacheTokens: 1000, inputTokens: 10, outputTokens: 5, billingStatus: "unknown" });
    expect(summarizeRouteUsage(rows)).toMatchObject({ cacheTokens: 1000, apiCalls: 1 });
    expect(requests).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
