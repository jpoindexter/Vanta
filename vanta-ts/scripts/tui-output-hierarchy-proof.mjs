#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const session = `vanta-output-proof-${process.pid}`;
const home = await mkdtemp(resolve(tmpdir(), "vanta-output-proof-"));
const repo = resolve(process.cwd(), "..");
const command = process.env.VANTA_COMMAND ?? resolve(process.cwd(), "../run.sh");
let requestCount = 0;

const server = createServer(async (request, response) => {
  if (request.url === "/v1/models") {
    return json(response, { object: "list", data: [{ id: "output-proof", object: "model" }] });
  }
  if (request.url !== "/v1/chat/completions") {
    response.writeHead(404).end();
    return;
  }

  const body = JSON.parse(await readBody(request));
  requestCount += 1;
  if (requestCount === 1) {
    const names = (body.tools ?? []).map((tool) => tool.function?.name);
    assert(names.includes("todo"), `todo schema was not exposed: ${names.join(", ")}`);
    return streamTools(response, Array.from({ length: 4 }, (_, index) => ({
      name: "todo",
      args: {
        action: "write",
        items: [{ text: `Output hierarchy step ${index + 1}`, status: "done" }],
      },
      id: `output-proof-${index}`,
    })));
  }
  streamText(response, "## Result\n\nThe output hierarchy proof passed.\n\n## Status\n\nNo follow-up remains.");
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
assert(address && typeof address === "object");

try {
  await tmux("new-session", "-d", "-s", session, "-x", "100", "-y", "32", shellCommand({
    VANTA_HOME: home,
    VANTA_REPO: repo,
    VANTA_PROVIDER: "custom",
    VANTA_OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    VANTA_MODEL: "output-proof",
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_TRUST_ALL: "1",
    VANTA_PROMPT_SUGGESTIONS: "0",
  }, command, repo));
  await waitForPane("Ask Vanta anything");
  await tmux("send-keys", "-t", session, "-l", "Show a clean, organized result.");
  await tmux("send-keys", "-t", session, "Enter");

  await waitForPane("Next: Ready for review");
  const final = await capture();
  assert.match(final, /4 actions · 4 plan updates · Ctrl\+T evidence/);
  assert.match(final, /Result/);
  assert.match(final, /The output hierarchy proof passed\./);
  assert.match(final, /Status/);
  assert.doesNotMatch(final, /## Result/);
  assert.equal((final.match(/⏺ Todo/g) ?? []).length, 0);
  assert(final.indexOf("4 actions · 4 plan updates") < final.indexOf("Result"));
  console.log("tui-output-hierarchy: PASS");
  console.log("executed: project launcher → four provider tool calls → compact evidence → rendered Markdown hierarchy → closeout");
} finally {
  await tmux("kill-session", "-t", session).catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(home, { recursive: true, force: true });
}

async function tmux(...args) {
  return exec("tmux", args, { maxBuffer: 2_000_000 });
}

async function capture() {
  return (await tmux("capture-pane", "-t", session, "-p")).stdout;
}

async function waitForPane(text, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await capture()).includes(text)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(text)}\n${await capture().catch(() => "")}`);
}

function streamTools(response, tools) {
  stream(response, [{
    role: "assistant",
    tool_calls: tools.map((tool, index) => ({
      index,
      id: tool.id,
      type: "function",
      function: { name: tool.name, arguments: JSON.stringify(tool.args) },
    })),
  }], "tool_calls");
}

function streamText(response, text) {
  stream(response, [{ role: "assistant", content: text }], "stop");
}

function stream(response, deltas, finishReason) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  for (const delta of deltas) response.write(`data: ${JSON.stringify(chunk(delta, null))}\n\n`);
  response.write(`data: ${JSON.stringify(chunk({}, finishReason))}\n\n`);
  response.write(`data: ${JSON.stringify({ ...chunk({}, null), choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`);
  response.end("data: [DONE]\n\n");
}

function chunk(delta, finishReason) {
  return {
    id: "output-proof",
    object: "chat.completion.chunk",
    created: 1,
    model: "output-proof",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function json(response, body) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function shellCommand(env, executable, cwd) {
  const vars = Object.entries(env).map(([key, value]) => `${key}=${quote(value)}`).join(" ");
  return `cd ${quote(cwd)} && env ${vars} ${quote(executable)}`;
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
