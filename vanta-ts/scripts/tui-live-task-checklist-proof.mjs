#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const session = `vanta-task-proof-${process.pid}`;
const home = await mkdtemp(resolve(tmpdir(), "vanta-task-proof-"));
const command = process.env.VANTA_COMMAND ?? resolve(process.cwd(), "../run.sh");
let requestCount = 0;
let heldActiveResponse;
let heldDoneResponse;

const activeItems = [
  { text: "Inspect the task", status: "done" },
  { text: "Implement the change", activeForm: "Implementing the change", status: "in_progress" },
  { text: "Verify the TUI", status: "pending" },
];
const doneItems = activeItems.map((item) => ({ ...item, status: "done" }));

const server = createServer(async (request, response) => {
  if (request.url === "/v1/models") {
    return json(response, { object: "list", data: [{ id: "task-proof", object: "model" }] });
  }
  if (request.url !== "/v1/chat/completions") {
    response.writeHead(404).end();
    return;
  }

  const body = JSON.parse(await readBody(request));
  requestCount += 1;
  if (requestCount === 1) {
    const names = (body.tools ?? []).map((tool) => tool.function?.name);
    assert(names.includes("todo"), `todo schema was not exposed to the provider: ${names.join(", ")}`);
    return streamTool(response, "todo", { action: "write", items: activeItems }, "task-active");
  }
  if (requestCount === 2) {
    heldActiveResponse = response;
    return;
  }
  if (requestCount === 3) {
    heldDoneResponse = response;
    return;
  }
  streamText(response, "TASK_CHECKLIST_PROOF_OK");
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
assert(address && typeof address === "object");

try {
  await tmux("new-session", "-d", "-s", session, "-x", "100", "-y", "32", shellCommand({
    VANTA_HOME: home,
    VANTA_REPO: resolve(process.cwd(), ".."),
    VANTA_PROVIDER: "custom",
    VANTA_OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    VANTA_MODEL: "task-proof",
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_TRUST_ALL: "1",
    VANTA_PROMPT_SUGGESTIONS: "0",
  }, command));
  await waitForPane("Ask Vanta anything");
  await tmux("send-keys", "-t", session, "-l", "Complete this three-step proof and keep the task list current.");
  await tmux("send-keys", "-t", session, "Enter");

  await waitFor(() => Boolean(heldActiveResponse), "provider's second request");
  const active = await capture();
  assert.match(active, /✻ Implementing the change…/);
  assert.match(active, /✓ Inspect the task/);
  assert.match(active, /■ Implementing the change/);
  assert.match(active, /□ Verify the TUI/);

  streamTool(heldActiveResponse, "todo", { action: "write", items: doneItems }, "task-done");
  heldActiveResponse = undefined;
  await waitFor(() => Boolean(heldDoneResponse), "provider's third request");
  const completed = await capture();
  assert.match(completed, /3 tasks \(3 done, 0 in progress, 0 open\)/);
  assert.match(completed, /✓ Verify the TUI/);

  streamText(heldDoneResponse, "TASK_CHECKLIST_PROOF_OK");
  heldDoneResponse = undefined;
  await waitForPane("TASK_CHECKLIST_PROOF_OK");
  const final = await capture();
  assert.match(final, /3 tasks \(3 done, 0 in progress, 0 open\)/);
  assert.equal((final.match(/3 tasks \(3 done, 0 in progress, 0 open\)/g) ?? []).length, 1);
  console.log("tui-live-task-checklist: PASS");
  console.log("executed: provider schema → todo writes → live Ink checklist → completed turn");
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

function streamTool(response, name, args, id) {
  stream(response, [
    { role: "assistant", tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] },
  ], "tool_calls");
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
  for (const delta of deltas) {
    response.write(`data: ${JSON.stringify(chunk(delta, null))}\n\n`);
  }
  response.write(`data: ${JSON.stringify(chunk({}, finishReason))}\n\n`);
  response.write(`data: ${JSON.stringify({ ...chunk({}, null), choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`);
  response.end("data: [DONE]\n\n");
}

function chunk(delta, finishReason) {
  return {
    id: "task-proof",
    object: "chat.completion.chunk",
    created: 1,
    model: "task-proof",
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

function shellCommand(env, executable) {
  const vars = Object.entries(env).map(([key, value]) => `${key}=${quote(value)}`).join(" ");
  return `env ${vars} ${quote(executable)}`;
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
