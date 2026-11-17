#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const session = `vanta-question-navigation-${process.pid}`;
const home = await mkdtemp(resolve(tmpdir(), "vanta-question-navigation-home-"));
const repo = resolve(process.cwd(), "..");
const command = process.env.VANTA_COMMAND ?? resolve(process.cwd(), "../run.sh");
let requestCount = 0;

const server = createServer(async (request, response) => {
  if (request.url === "/v1/models") {
    return json(response, { object: "list", data: [{ id: "question-navigation", object: "model" }] });
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
    return stream(response, {
      role: "assistant",
      tool_calls: [{
        index: 0,
        id: "ask-navigation",
        type: "function",
        function: {
          name: "ask_user",
          arguments: JSON.stringify({
            questions: [
              {
                header: "Access",
                question: "Who can you reach?",
                options: [
                  { label: "Customers", description: "Existing customers" },
                  { label: "Partners", description: "Existing partners" },
                ],
              },
              {
                header: "Scope",
                question: "Which scope should Vanta use?",
                allowOther: false,
                options: [
                  { label: "Narrow", description: "Focused files" },
                  { label: "Full", description: "Whole suite" },
                ],
              },
            ],
          }),
        },
      }],
    }, "tool_calls");
  }

  const messages = JSON.stringify(body.messages ?? []);
  assert.match(messages, /No direct access/);
  assert.match(messages, /Full/);
  stream(response, { role: "assistant", content: "QUESTION_NAVIGATION_PROOF_OK" }, "stop");
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
    VANTA_MODEL: "question-navigation",
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_TRUST_ALL: "1",
    VANTA_PROMPT_SUGGESTIONS: "0",
  }, command, repo));
  await waitForPane("Ask Vanta anything");
  await send("Ask both navigation questions.");

  await waitForPane("Who can you reach?");
  assert.match(await capture(), /Access 1\/2/);
  await tmux("send-keys", "-t", session, "Down", "Down", "Enter");
  await waitForPane("Type your answer");
  await send("No direct access");

  await waitForPane("Which scope should Vanta use?");
  assert.match(await capture(), /Scope 2\/2/);
  await tmux("send-keys", "-t", session, "Down", "Enter");
  await waitForPane("QUESTION_NAVIGATION_PROOF_OK");
  assert.equal(requestCount, 2);
  console.log("tui-question-navigation: PASS");
  console.log("executed: Other answer → next question → Down arrow → Full selection → model response");
} finally {
  await tmux("kill-session", "-t", session).catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(home, { recursive: true, force: true });
}

async function tmux(...args) {
  return exec("tmux", args, { maxBuffer: 2_000_000 });
}

async function send(value) {
  await tmux("send-keys", "-t", session, "-l", value);
  await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  await tmux("send-keys", "-t", session, "Enter");
}

async function capture() {
  return (await tmux("capture-pane", "-t", session, "-p")).stdout;
}

async function waitForPane(value, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await capture()).includes(value)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(value)}\n${await capture().catch(() => "")}`);
}

function stream(response, delta, finishReason) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  response.write(`data: ${JSON.stringify(chunk(delta, null))}\n\n`);
  response.write(`data: ${JSON.stringify(chunk({}, finishReason))}\n\n`);
  response.write(`data: ${JSON.stringify({ ...chunk({}, null), choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`);
  response.end("data: [DONE]\n\n");
}

function chunk(delta, finishReason) {
  return {
    id: "question-navigation",
    object: "chat.completion.chunk",
    created: 1,
    model: "question-navigation",
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
