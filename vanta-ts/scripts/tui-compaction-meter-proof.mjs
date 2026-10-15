#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const session = `vanta-compaction-proof-${process.pid}`;
const home = await mkdtemp(resolve(tmpdir(), "vanta-compaction-proof-"));
const repo = resolve(process.cwd(), "..");
const command = process.env.VANTA_COMMAND ?? resolve(repo, "run.sh");
let turn = 0;

const server = createServer(async (request, response) => {
  if (request.url === "/v1/models") {
    return json(response, { object: "list", data: [{ id: "compaction-proof", object: "model" }] });
  }
  if (request.url !== "/v1/chat/completions") return void response.writeHead(404).end();
  const body = JSON.parse(await readBody(request));
  if (body.stream === true) {
    turn += 1;
    return streamText(response, `COMPACTION_HISTORY_TURN_${turn}`);
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 800));
  json(response, {
    id: "compaction-summary",
    object: "chat.completion",
    created: 1,
    model: "compaction-proof",
    choices: [{
      index: 0,
      message: { role: "assistant", content: "Earlier proof turns completed." },
      finish_reason: "stop",
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
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
    VANTA_MODEL: "compaction-proof",
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_TRUST_ALL: "1",
    VANTA_PROMPT_SUGGESTIONS: "0",
  }, command, repo));
  await waitForPane("Ask Vanta anything");

  for (let index = 1; index <= 5; index += 1) {
    await send(`Add proof history turn ${index}.`);
    await waitForPane(`COMPACTION_HISTORY_TURN_${index}`);
  }

  await send("/compact");
  const active = await waitForPane("25%");
  const meterLine = active.split("\n").find((line) => line.includes("25%")) ?? "";
  assert.match(active, /Compacting conversation…/);
  assert.match(meterLine, /■■■■■■□□□□□□□□□□□□□□□□□□ 25%/);
  assert.doesNotMatch(meterLine, /[░▱▰▧▨▩]/);

  await waitForPane("compressed 11 →");
  const final = await capture();
  assert.match(final, /Ask Vanta anything/);
  assert.equal(turn, 5);
  console.log("tui-compaction-meter: PASS");
  console.log("executed: project launcher → five real TUI turns → /compact → live square-cell 25% milestone → compacted transcript receipt");
} finally {
  await tmux("kill-session", "-t", session).catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(home, { recursive: true, force: true });
}

async function send(text) {
  await tmux("send-keys", "-t", session, "-l", text);
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
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
    const pane = await capture();
    if (pane.includes(text)) return pane;
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
    id: "compaction-proof",
    object: "chat.completion.chunk",
    created: 1,
    model: "compaction-proof",
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
