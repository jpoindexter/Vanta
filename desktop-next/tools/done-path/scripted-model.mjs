// A scripted OpenAI-compatible model for the done-path proof. No network, no key.
// A user message carrying `[[call <tool> <json-args>]]` markers makes the model request those tools
// one per round, in order; after the last tool result it answers with a fixed sentence.
// Every request is recorded.
import http from "node:http";

const CALL = /\[\[call (\w+) (\{.*?\})\]\]/gs;

function sse(delta, finish = null) {
  return `data: ${JSON.stringify({ id: "dp", object: "chat.completion.chunk", created: 0, model: "done-path", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => typeof part === "string" || typeof part?.text === "string")
    .map((part) => typeof part === "string" ? part : part.text).join("\n");
}

function imageHashes(content) {
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    const encoded = /^data:image\/[^;,]+;base64,(.+)$/.exec(part?.image_url?.url ?? "");
    return encoded ? [createHash("sha256").update(Buffer.from(encoded[1], "base64")).digest("hex")] : [];
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (part) => (raw += part));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
    });
  });
}

function plan(body) {
  const messages = body.messages ?? [];
  const lastUserAt = messages.findLastIndex((m) => m.role === "user");
  const prompt = textOf(messages[lastUserAt]?.content);
  const calls = [...prompt.matchAll(CALL)].map((m) => ({ name: m[1], args: m[2] }));
  const done = messages.slice(lastUserAt + 1).filter((m) => m.role === "tool").length;
  const next = calls[done];
  const hasImage = JSON.stringify(messages[lastUserAt]?.content ?? "").includes("image_url");
  const toolResult = textOf(messages.slice(lastUserAt + 1).filter((m) => m.role === "tool").at(-1)?.content).slice(0, 200);
  return { needsTool: Boolean(next), name: next?.name, args: next?.args, prompt, promptLength: prompt.length, hasImage, imageHashes: imageHashes(messages[lastUserAt]?.content), toolResult };
}

/** Starts the model on a free port; resolves `{ url, requests, close }` (url ends in /v1). */
export function startScriptedModel() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    if (req.url?.endsWith("/models")) return json(200, { object: "list", data: [{ id: "done-path", object: "model" }] });
    if (!req.url?.endsWith("/chat/completions")) return json(404, { error: "not found" });
    const body = await readBody(req);
    const step = plan(body);
    requests.push({ at: Date.now(), stream: body.stream === true, toolCall: step.needsTool ? step.name : null, prompt: step.prompt.slice(0, 160), promptLength: step.promptLength, hasImage: step.hasImage, imageHashes: step.imageHashes, toolResult: step.toolResult, lastRole: body.messages?.at(-1)?.role, messageCount: body.messages?.length ?? 0 });
    const answer = step.needsTool ? "" : "Scripted turn finished.";
    if (body.stream !== true) return json(200, { id: "dp", object: "chat.completion", model: "done-path", choices: [{ index: 0, message: { role: "assistant", content: answer || "Scripted turn finished." }, finish_reason: "stop" }] });
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    if (step.needsTool) {
      const call = { index: 0, id: `call-${requests.length}`, type: "function", function: { name: step.name, arguments: step.args } };
      res.write(sse({ role: "assistant", tool_calls: [call] }));
      res.end(sse({}, "tool_calls") + "data: [DONE]\n\n");
      return;
    }
    res.write(sse({ role: "assistant", content: answer }));
    res.end(sse({}, "stop") + "data: [DONE]\n\n");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        requests,
        close: () => { server.closeAllConnections(); return new Promise((done) => server.close(() => done())); },
      });
    });
  });
}
import { createHash } from "node:crypto";
