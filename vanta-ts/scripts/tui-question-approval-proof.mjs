#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const session = `vanta-question-proof-${process.pid}`;
const home = await mkdtemp(resolve(tmpdir(), "vanta-question-home-"));
const repo = resolve(process.cwd(), "..");
const proofAName = `.vanta-question-proof-${process.pid}-a.txt`;
const proofBName = `.vanta-question-proof-${process.pid}-b.txt`;
const proofA = resolve(repo, proofAName);
const proofB = resolve(repo, proofBName);
const command = process.env.VANTA_COMMAND ?? resolve(process.cwd(), "../run.sh");
let requestCount = 0;

await writeFile(proofA, "old a\n");
await writeFile(proofB, "old b\n");

const server = createServer(async (request, response) => {
  if (request.url === "/v1/models") {
    return json(response, { object: "list", data: [{ id: "question-proof", object: "model" }] });
  }
  if (request.url !== "/v1/chat/completions") {
    response.writeHead(404).end();
    return;
  }

  const body = JSON.parse(await readBody(request));
  requestCount += 1;
  if (requestCount === 1) {
    const names = (body.tools ?? []).map((tool) => tool.function?.name);
    assert(names.includes("ask_user"), `ask_user schema was not exposed: ${names.join(", ")}`);
    return streamTools(response, [{
      name: "ask_user",
      id: "ask-path",
      args: {
        questions: [{
          header: "Approach",
          question: "Which path should Vanta use?",
          options: [
            { label: "Focused", description: "Change only the proof files", preview: "2 files · reversible" },
            { label: "Broad", description: "Change the full project" },
          ],
        }],
      },
    }]);
  }
  if (requestCount === 2) {
    return streamTools(response, [
      { name: "write_file", id: "write-a", args: { path: proofAName, content: "new a\n" } },
      { name: "write_file", id: "write-b", args: { path: proofBName, content: "new b\n" } },
    ]);
  }
  streamText(response, "QUESTION_APPROVAL_PROOF_OK");
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
assert(address && typeof address === "object");

try {
  await tmux("new-session", "-d", "-s", session, "-x", "100", "-y", "36", shellCommand({
    VANTA_HOME: home,
    VANTA_REPO: repo,
    VANTA_PROVIDER: "custom",
    VANTA_OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    VANTA_MODEL: "question-proof",
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_TRUST_ALL: "1",
    VANTA_PROMPT_SUGGESTIONS: "0",
  }, command, repo));
  await waitForPane("Ask Vanta anything");
  await tmux("send-keys", "-t", session, "-l", "Ask me which implementation path to use, then update both proof files.");
  await tmux("send-keys", "-t", session, "Enter");

  await waitForPane("Which path should Vanta use?");
  const question = await capture();
  assert.match(question, /Approach 1\/1/);
  assert.match(question, /Focused — Change only the proof files/);
  assert.match(question, /Other — Type your own answer/);
  assert.match(question, /2 files · reversible/);
  await tmux("send-keys", "-t", session, "Down", "Enter");

  await waitForPane("go ahead with this task");
  const approval = await capture();
  assert.match(approval, new RegExp(`Target file: ${escapeRegex(proofAName)}`));
  assert.match(approval, /overwriting is destructive/);
  assert.match(approval, /Yes — go ahead with this task/);
  await tmux("send-keys", "-t", session, "Enter");

  // One Enter must authorize both reversible writes. A second prompt leaves the
  // turn paused and this wait fails, proving the reported regression.
  await waitForPane("QUESTION_APPROVAL_PROOF_OK");
  assert.equal(await readFile(proofA, "utf8"), "new a\n");
  assert.equal(await readFile(proofB, "utf8"), "new b\n");
  assert.equal(requestCount, 3);
  console.log("tui-question-approval: PASS");
  console.log("executed: ask_user schema → live Ink picker → selected answer → one task approval → two verified writes");
} finally {
  await tmux("kill-session", "-t", session).catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(home, { recursive: true, force: true });
  await rm(proofA, { force: true });
  await rm(proofB, { force: true });
}

async function tmux(...args) {
  return exec("tmux", args, { maxBuffer: 2_000_000 });
}

async function capture() {
  return (await tmux("capture-pane", "-t", session, "-p")).stdout;
}

async function waitForPane(text, timeoutMs = 20_000) {
  await waitFor(async () => (await capture()).includes(text), JSON.stringify(text), timeoutMs);
}

async function waitFor(predicate, label, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for ${label}\n${await capture().catch(() => "")}`);
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
    id: "question-proof",
    object: "chat.completion.chunk",
    created: 1,
    model: "question-proof",
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
