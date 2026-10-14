// A scripted OpenAI-compatible model for the receipts-and-queue proof. No network, no key.
// The latest user message picks the behaviour:
//   hold ...     streams a first sentence, then waits until release() (or the app goes away): a run that stays busy
//   echo ...     answers "echo: ..." so the order queued messages ran in can be read from the requests
//   flaky NAME   the first time it sees NAME: streams a sentence, then keeps calling a tool that does not exist
//                with the same arguments, so the agent stops with repeated_failure; afterwards: "Recovered: NAME"
//   anything else answers "Scripted turn finished."
// Every request is recorded.
import http from "node:http";

const CHUNK = (delta, finish = null) => `data: ${JSON.stringify({ id: "rq", object: "chat.completion.chunk", created: 0, model: "receipts-queue", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (typeof part === "string" ? part : part?.text ?? "")).join("\n");
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (part) => (raw += part));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}

/** Starts the model on a free port; resolves `{ url, requests, release, close }` (url ends in /v1). */
export function startScriptedModel() {
  const requests = [];
  const attempts = new Map();
  const holds = new Set();
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    if (req.url?.endsWith("/models")) return json(200, { object: "list", data: [{ id: "receipts-queue", object: "model" }] });
    if (!req.url?.endsWith("/chat/completions")) return json(404, { error: "not found" });
    const body = await readBody(req);
    const messages = body.messages ?? [];
    const lastUser = textOf(messages.findLast((m) => m.role === "user")?.content);
    const turnStart = messages.at(-1)?.role === "user";
    const flaky = /flaky (\w+)/.exec(lastUser)?.[1];
    if (flaky && turnStart) attempts.set(flaky, (attempts.get(flaky) ?? 0) + 1);
    const failing = Boolean(flaky) && (attempts.get(flaky) ?? 0) === 1;
    const record = { at: Date.now(), lastUser: lastUser.slice(0, 200), stream: body.stream === true, turnStart, flaky: flaky ?? null, attempt: flaky ? attempts.get(flaky) : null, failing, messageCount: messages.length };
    requests.push(record);

    let answer = "Scripted turn finished.";
    if (lastUser.startsWith("echo ")) answer = `echo: ${lastUser.slice(5)}`;
    else if (flaky && !failing) answer = `Recovered: ${flaky}`;
    else if (lastUser.startsWith("hold")) answer = "Held and released.";

    if (body.stream !== true) return json(200, { id: "rq", object: "chat.completion", model: "receipts-queue", choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }] });
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });

    if (failing) {
      const call = { index: 0, id: `call-${requests.length}`, type: "function", function: { name: "no_such_tool", arguments: JSON.stringify({ id: "x" }) } };
      res.write(CHUNK({ role: "assistant", content: `I started on ${flaky} and made some progress. ` }));
      res.write(CHUNK({ tool_calls: [call] }));
      res.end(CHUNK({}, "tool_calls") + "data: [DONE]\n\n");
      return;
    }
    const holding = lastUser.startsWith("hold") && turnStart;
    if (holding) {
      res.write(CHUNK({ role: "assistant", content: "Holding the line. " }));
      await new Promise((resolve) => {
        const entry = { resolve };
        holds.add(entry);
        req.on("close", () => { holds.delete(entry); resolve(); });
      });
    }
    if (res.writableEnded || res.destroyed) return;
    res.write(CHUNK(holding ? { content: answer } : { role: "assistant", content: answer }));
    res.end(CHUNK({}, "stop") + "data: [DONE]\n\n");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        requests,
        release: () => { for (const entry of holds) entry.resolve(); holds.clear(); },
        close: () => { server.closeAllConnections(); return new Promise((done) => server.close(() => done())); },
      });
    });
  });
}
