#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const tmuxSession = `vanta-restart-proof-${process.pid}`;
const home = await mkdtemp(resolve(tmpdir(), "vanta-restart-proof-"));
const repo = resolve(process.cwd(), "..");
const command = process.env.VANTA_COMMAND ?? resolve(repo, "run.sh");
const firstPrompt = "Remember that my job-search scripts are in Desktop jobs.";
let requestCount = 0;
let resumedWithContext = false;

const server = createServer(async (request, response) => {
  if (request.url === "/v1/models") {
    return json(response, { object: "list", data: [{ id: "restart-proof", object: "model" }] });
  }
  if (request.url !== "/v1/chat/completions") return void response.writeHead(404).end();
  const body = JSON.parse(await readBody(request));
  requestCount += 1;
  const transcript = (body.messages ?? []).map((message) => message.content ?? "").join("\n");
  if (requestCount === 1) return streamText(response, "FIRST_TURN_OK");
  resumedWithContext = transcript.includes(firstPrompt) && transcript.includes("FIRST_TURN_OK");
  return streamText(response, resumedWithContext ? "CONTEXT_OK" : "CONTEXT_MISSING");
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
assert(address && typeof address === "object");

try {
  await tmux("new-session", "-d", "-s", tmuxSession, "-x", "100", "-y", "32", shellCommand({
    VANTA_HOME: home,
    VANTA_PROJECT_ROOT: repo,
    VANTA_PROVIDER: "custom",
    VANTA_OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    VANTA_MODEL: "restart-proof",
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_TRUST_ALL: "1",
    VANTA_PROMPT_SUGGESTIONS: "0",
  }, command, repo));
  await waitForPane("Ask Vanta anything");
  await send(firstPrompt);
  await waitForPane("FIRST_TURN_OK");
  await send("/restart");
  await waitForPane("Reloaded session");
  await send("What did I ask before the reload? Reply with the proof token.");
  await waitForPane("CONTEXT_OK");

  const final = await capture();
  assert(resumedWithContext, "the provider did not receive the pre-reload conversation");
  assert.match(final, /Reloaded session/);
  assert.match(final, /CONTEXT_OK/);
  assert.doesNotMatch(final, /CONTEXT_MISSING/);
  console.log("tui-restart-continuity: PASS");
  console.log("executed: turn → /restart → process relaunch → saved transcript reload → provider receives prior context");
} finally {
  await tmux("kill-session", "-t", tmuxSession).catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(home, { recursive: true, force: true });
}

async function send(text) {
  await tmux("send-keys", "-t", tmuxSession, "-l", text);
  // Ink receives the literal text as a burst; let it drain before the submit
  // key so slower CI terminals do not process Enter ahead of the final bytes.
  await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  await tmux("send-keys", "-t", tmuxSession, "Enter");
}

async function tmux(...args) {
  return exec("tmux", args, { maxBuffer: 2_000_000 });
}

async function capture() {
  return (await tmux("capture-pane", "-t", tmuxSession, "-p")).stdout;
}

async function waitForPane(text, timeoutMs = 25_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await capture()).includes(text)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(text)}\n${await capture().catch(() => "")}`);
}

function streamText(response, text) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  response.write(`data: ${JSON.stringify(chunk({ role: "assistant", content: text }, null))}\n\n`);
  response.write(`data: ${JSON.stringify(chunk({}, "stop"))}\n\n`);
  response.write(`data: ${JSON.stringify({ ...chunk({}, null), choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`);
  response.end("data: [DONE]\n\n");
}

function chunk(delta, finishReason) {
  return {
    id: "restart-proof",
    object: "chat.completion.chunk",
    created: 1,
    model: "restart-proof",
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
