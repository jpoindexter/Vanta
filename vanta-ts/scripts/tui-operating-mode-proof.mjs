#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const session = `vanta-mode-proof-${process.pid}`;
const home = await mkdtemp(resolve(tmpdir(), "vanta-mode-proof-"));
const repo = resolve(process.cwd(), "..");
const proofName = `.vanta-auto-mode-proof-${process.pid}.txt`;
const proofPath = resolve(repo, proofName);
const command = process.env.VANTA_COMMAND ?? resolve(repo, "run.sh");
let requestCount = 0;

await writeFile(proofPath, "before\n");

const server = createServer(async (request, response) => {
  if (request.url === "/v1/models") {
    return json(response, { object: "list", data: [{ id: "mode-proof", object: "model" }] });
  }
  if (request.url !== "/v1/chat/completions") return void response.writeHead(404).end();
  const body = JSON.parse(await readBody(request));
  requestCount += 1;
  if (requestCount === 1) {
    const names = (body.tools ?? []).map((tool) => tool.function?.name);
    assert(names.includes("edit_file"), `edit_file schema was not exposed: ${names.join(", ")}`);
    return streamTools(response, [{
      name: "edit_file",
      id: "auto-edit",
      args: { path: proofName, old_string: "before\n", new_string: "after\n" },
    }]);
  }
  streamText(response, "AUTO_EDIT_PROOF_OK");
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
    VANTA_MODEL: "mode-proof",
    VANTA_OPERATING_MODE: "default",
    VANTA_PERMISSION_MODE: "default",
    VANTA_AUTO_MODE: "0",
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_TRUST_ALL: "1",
    VANTA_PROMPT_SUGGESTIONS: "0",
  }, command, repo));

  await waitForPane("manual mode on");
  await shiftTabTo("accept edits on");
  await shiftTabTo("plan mode on");
  await shiftTabTo("auto mode on");
  await send("Edit the auto-mode proof file and finish without asking me for permission.");
  await waitForPane("AUTO_EDIT_PROOF_OK");
  assert.equal(await readFile(proofPath, "utf8"), "after\n");
  await shiftTabTo("manual mode on");

  const pane = await capture();
  assert.match(pane, /Ask Vanta anything/);
  assert.match(pane, /manual mode on/);
  assert.match(pane, /AUTO_EDIT_PROOF_OK/);
  assert.equal(requestCount, 2);
  console.log("tui-operating-mode: PASS");
  console.log("executed: real TUI launch → Auto → edit_file with zero approval input → verified file → Manual");
} finally {
  await tmux("kill-session", "-t", session).catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(home, { recursive: true, force: true });
  await rm(proofPath, { force: true });
}

async function shiftTabTo(text) {
  await tmux("send-keys", "-t", session, "BTab");
  await waitForPane(text);
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  assert((await capture()).includes(text), `mode transition did not remain on ${text}`);
}

async function send(text) {
  await tmux("send-keys", "-t", session, "-l", text);
  await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  await tmux("send-keys", "-t", session, "Enter");
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
    id: "mode-proof",
    object: "chat.completion.chunk",
    created: 1,
    model: "mode-proof",
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
