// A tiny OpenAI-compatible server for proofs: streams a fixed reply, lists one model.
// Used with VANTA_PROVIDER=custom so the real Vanta server answers without any key or network.
import http from "node:http";

const REPLY =
  "Hello from the proof model. This reply is canned: it exists so the app can show a chat with messages.";

function chunk(content, finish) {
  return `data: ${JSON.stringify({
    id: "chatcmpl-proof",
    object: "chat.completion.chunk",
    created: 0,
    model: "vanta-proof",
    choices: [{ index: 0, delta: content ? { content } : {}, finish_reason: finish ?? null }],
  })}\n\n`;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (part) => (raw += part));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

async function handle(req, res) {
  if (req.url?.endsWith("/models")) {
    return sendJson(res, 200, { object: "list", data: [{ id: "vanta-proof", object: "model" }] });
  }
  if (!req.url?.endsWith("/chat/completions")) return sendJson(res, 404, { error: "not found" });
  const body = await readBody(req);
  if (body.stream !== true) {
    return sendJson(res, 200, {
      id: "chatcmpl-proof",
      object: "chat.completion",
      model: "vanta-proof",
      choices: [{ index: 0, message: { role: "assistant", content: REPLY }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const word of REPLY.split(/(?<= )/)) res.write(chunk(word));
  res.write(chunk("", "stop"));
  res.write("data: [DONE]\n\n");
  res.end();
}

/** Starts the mock on a free port; resolves `{ url, close }` with url ending in /v1. */
export function startMockOpenAI() {
  const server = http.createServer((req, res) => void handle(req, res));
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/v1`, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}
