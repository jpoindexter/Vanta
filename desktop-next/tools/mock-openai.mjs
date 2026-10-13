// A tiny OpenAI-compatible server for proofs: streams a fixed reply, lists one model.
// Used with VANTA_PROVIDER=custom so the real Vanta server answers without any key or network.
//
// The last user message can steer the reply, so a proof can reach states a canned reply never shows:
//   slow ...        the reply streams one word every 400ms (a turn that stays "running")
//   shell: <cmd>    the model asks to run <cmd> with shell_cmd (an approval card), then finishes
//   clarify ...     the model asks a question with the clarify tool
//   fail ...        the provider answers 500 (a failed turn)
//   image ...       the reply carries a small image
//   long ...        several paragraphs, a list and a code block
//   link ...        the reply holds a web link
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

export const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFklEQVR4nGP8z8Dwn4EIwESMolGF5AEAH8cBF3yb8m8AAAAASUVORK5CYII=";
const LONG = [
  "Here is a longer reply so the thread has something to scroll, copy and quote.",
  "- first point\n- second point\n- third point",
  "```ts\nexport const proof = 'long reply'\n```",
  "That is the end of the long reply."
].join("\n\n");

function lastText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content.map((part) => part?.text ?? "").join(" ") : "";
}

/** What the model does with this request: a tool call, an error, or text (with a per-word delay). */
function plan(body, options) {
  const messages = body.messages ?? [];
  const last = messages[messages.length - 1];
  if (last?.role === "tool") return { text: "Done. The command finished." };
  const prompt = [...messages].reverse().find((message) => message.role === "user");
  const text = lastText(prompt).trim();
  const shell = /^shell:\s*(.+)$/is.exec(text);
  if (shell) return { tool: { name: "shell_cmd", args: { command: shell[1].trim() } } };
  if (/^clarify\b/i.test(text)) {
    return { tool: { name: "clarify", args: { question: "Which option should the proof take?", options: ["Option A", "Option B"] } } };
  }
  if (/^fail\b/i.test(text)) return { fail: true };
  if (/^slow\b/i.test(text)) return { text: REPLY, delay: 400 };
  if (/^image\b/i.test(text)) return { text: `Here is the image.\n\n![proof image](${options.imagePath ?? `data:image/png;base64,${PIXEL}`})` };
  if (/^long\b/i.test(text)) return { text: LONG };
  if (/^link\b/i.test(text)) return { text: "Read the [example page](https://example.com/page) for details." };
  return { text: REPLY };
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function toolChunk(tool) {
  return `data: ${JSON.stringify({
    id: "chatcmpl-proof",
    object: "chat.completion.chunk",
    created: 0,
    model: "vanta-proof",
    choices: [{
      index: 0,
      delta: { tool_calls: [{ index: 0, id: "call_proof", type: "function", function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] },
      finish_reason: null
    }]
  })}\n\n`;
}

async function handle(req, res, options) {
  if (req.url?.endsWith("/models")) {
    return sendJson(res, 200, { object: "list", data: [{ id: "vanta-proof", object: "model" }] });
  }
  if (!req.url?.endsWith("/chat/completions")) return sendJson(res, 404, { error: "not found" });
  const body = await readBody(req);
  const step = plan(body, options);
  if (step.fail) return sendJson(res, 500, { error: { message: "The proof model is set to fail this turn." } });
  if (body.stream !== true) {
    return sendJson(res, 200, {
      id: "chatcmpl-proof",
      object: "chat.completion",
      model: "vanta-proof",
      choices: [{ index: 0, message: { role: "assistant", content: step.text ?? REPLY }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  if (step.tool) {
    res.write(toolChunk(step.tool));
    res.write(chunk("", "tool_calls"));
  } else {
    for (const word of (step.text ?? REPLY).split(/(?<= )/)) {
      res.write(chunk(word));
      if (step.delay) await wait(step.delay);
    }
    res.write(chunk("", "stop"));
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

/** Starts the mock on a free port; resolves `{ url, close }` with url ending in /v1. */
export function startMockOpenAI(options = {}) {
  const server = http.createServer((req, res) => void handle(req, res, options));
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/v1`, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}
