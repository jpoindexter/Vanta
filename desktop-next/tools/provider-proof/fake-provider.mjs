// Stand-ins for model providers, for the provider-setup proof. Nothing here is a real credential or a real service.
//
//   startKeyedProvider(): an OpenAI-compatible endpoint that only accepts the keys it was told to accept. The
//     proof points the app's `groq` provider at it through the sandbox's providers.json, so the app's real
//     setup route verifies a key against it, and a "revoked" key gets the 401 a real provider sends.
//   startFakeOllama(): Ollama's model list plus an OpenAI-compatible chat endpoint, switchable up and down.
import http from "node:http";

const ANSWER = "Scripted turn finished.";

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (part) => (raw += part));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
    });
  });
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (typeof part === "string" ? part : part?.text ?? "")).join("\n");
}

const sse = (delta, finish = null) =>
  `data: ${JSON.stringify({ id: "pp", object: "chat.completion.chunk", created: 0, model: "proof-model", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

function answer(res, body) {
  if (body.stream !== true) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "pp", object: "chat.completion", model: "proof-model", choices: [{ index: 0, message: { role: "assistant", content: ANSWER }, finish_reason: "stop" }] }));
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  res.write(sse({ role: "assistant", content: ANSWER }));
  res.end(sse({}, "stop") + "data: [DONE]\n\n");
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

/**
 * Accepts a request only when its bearer token is in `accepted`. `log` records, per chat call, which key NAME
 * (never the key) was used, the answer status and the last user message, so the proof can show what was retried.
 */
export async function startKeyedProvider(keys) {
  const accepted = new Set();
  const nameOf = (token) => Object.entries(keys).find(([, value]) => value === token)?.[0] ?? "unknown";
  const log = [];
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const allowed = accepted.has(token);
    if (req.url?.endsWith("/models")) {
      return allowed ? json(200, { object: "list", data: [{ id: "proof-model", object: "model" }] }) : json(401, { error: { message: "Incorrect API key provided", code: "invalid_api_key" } });
    }
    if (!req.url?.endsWith("/chat/completions")) return json(404, { error: "not found" });
    const body = await readBody(req);
    const messages = body.messages ?? [];
    const lastUser = textOf(messages.findLast((m) => m.role === "user")?.content).slice(0, 80);
    log.push({ key: nameOf(token), status: allowed ? 200 : 401, probe: body.max_tokens === 1 || body.max_completion_tokens === 1, lastUser });
    if (!allowed) return json(401, { error: { message: "Incorrect API key provided", type: "invalid_request_error", code: "invalid_api_key" } });
    answer(res, body);
  });
  const port = await listen(server);
  return {
    url: `http://127.0.0.1:${port}/v1`,
    log,
    accept: (name) => accepted.add(keys[name]),
    revoke: (name) => accepted.delete(keys[name]),
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

/** Ollama's `/api/tags` answers only while `up`; chat always works, because the proof never chats with it down. */
export async function startFakeOllama() {
  let up = false;
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    if (req.url === "/api/tags") return up ? json(200, { models: [{ name: "qwen2.5:14b" }] }) : json(503, { error: "not running" });
    if (req.url?.endsWith("/chat/completions")) return answer(res, await readBody(req));
    return json(404, { error: "not found" });
  });
  const port = await listen(server);
  return {
    url: `http://127.0.0.1:${port}/v1`,
    setUp: (value) => { up = value; },
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
