import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolveProvider } from "../providers/index.js";
import type { Message } from "../types.js";

// PROXY-ENDPOINT: local OpenAI-compatible endpoint backed by Vanta's resolved providers.
// Any tool that accepts an OPENAI_API_KEY + OPENAI_BASE_URL can use Claude/Codex
// subscriptions or local Ollama through this proxy.
// `vanta proxy [port]` starts it; default port 7791.

const DEFAULT_PORT = 7791;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data), "access-control-allow-origin": "*" });
  res.end(data);
}

function errorResponse(res: ServerResponse, status: number, message: string): void {
  jsonResponse(res, status, { error: { message, type: "proxy_error" } });
}

/**
 * Handle a /v1/chat/completions POST. Converts to Vanta's provider format and back.
 * Returns an OpenAI-format completion object.
 */
export async function handleChatCompletion(
  body: string,
  env: NodeJS.ProcessEnv,
): Promise<{ status: number; body: unknown }> {
  let req: { model?: string; messages?: Array<{ role: string; content: string }> };
  try { req = JSON.parse(body); }
  catch { return { status: 400, body: { error: { message: "invalid json", type: "parse_error" } } }; }

  const messages: Message[] = (req.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
    .map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));

  const providerEnv = req.model
    ? { ...env, VANTA_MODEL: req.model }
    : env;

  let provider;
  try { provider = resolveProvider(providerEnv); }
  catch (err) { return { status: 503, body: { error: { message: (err as Error).message, type: "provider_error" } } }; }

  try {
    const result = await provider.complete(messages, []);
    return {
      status: 200,
      body: {
        id: `proxy-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: provider.modelId(),
        choices: [{ index: 0, message: { role: "assistant", content: result.text }, finish_reason: "stop" }],
        usage: result.usage ? { prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens, total_tokens: result.usage.inputTokens + result.usage.outputTokens } : undefined,
      },
    };
  } catch (err) {
    return { status: 502, body: { error: { message: (err as Error).message, type: "upstream_error" } } };
  }
}

/** Start the proxy server. */
export function startProxyServer(port = DEFAULT_PORT, env = process.env): Promise<{ close: () => void; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      if (req.method === "OPTIONS") {
        res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,authorization" });
        res.end();
        return;
      }
      if (req.method === "GET" && req.url === "/v1/models") {
        jsonResponse(res, 200, { object: "list", data: [{ id: env.VANTA_MODEL ?? "vanta-proxy", object: "model" }] });
        return;
      }
      if (req.method === "POST" && req.url?.startsWith("/v1/chat/completions")) {
        const body = await readBody(req);
        const { status, body: respBody } = await handleChatCompletion(body, env);
        jsonResponse(res, status, respBody);
        return;
      }
      errorResponse(res, 404, "not found");
    });
    server.listen(port, "127.0.0.1", () => resolve({ close: () => server.close(), port }));
    server.on("error", reject);
  });
}
