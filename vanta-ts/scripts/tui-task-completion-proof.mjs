#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const session = `vanta-completion-proof-${process.pid}`;
const home = await mkdtemp(resolve(tmpdir(), "vanta-completion-proof-"));
const repo = resolve(process.cwd(), "..");
const proofName = `.vanta-task-completion-proof-${process.pid}.txt`;
const proofPath = resolve(repo, proofName);
const command = process.env.VANTA_COMMAND ?? resolve(repo, "run.sh");
let requestCount = 0;

await writeFile(proofPath, "stale\n");

const server = createServer(async (request, response) => {
  if (request.url === "/v1/models") {
    return json(response, { object: "list", data: [{ id: "completion-proof", object: "model" }] });
  }
  if (request.url !== "/v1/chat/completions") return void response.writeHead(404).end();
  const body = JSON.parse(await readBody(request));
  requestCount += 1;
  const names = (body.tools ?? []).map((tool) => tool.function?.name);

  if (requestCount === 1) {
    assert(names.includes("todo"), `todo schema was not exposed: ${names.join(", ")}`);
    return streamTools(response, [{
      name: "todo",
      id: "completion-plan",
      args: {
        action: "write",
        items: [
          { text: "Inspect stale dashboard", status: "done" },
          { text: "Write updated dashboard", status: "in_progress" },
        ],
      },
    }]);
  }
  if (requestCount === 2) {
    return streamText(response, "Not done: dashboard writeback. I’ll finish by replacing the stale content.");
  }
  if (requestCount === 3) {
    assert(
      body.messages.some((message) => /task is not finished.*next step NOW/i.test(message.content ?? "")),
      "automatic continuation nudge was not added",
    );
    assert(names.includes("edit_file"), `edit_file schema was not exposed: ${names.join(", ")}`);
    return streamTools(response, [{
      name: "edit_file",
      id: "completion-edit",
      args: { path: proofName, old_string: "stale\n", new_string: "fresh\n" },
    }]);
  }
  if (requestCount === 5) {
    assert(names.includes("read_file"), `read_file schema was not exposed: ${names.join(", ")}`);
    return streamTools(response, Array.from({ length: 3 }, (_, index) => ({
      name: "read_file",
      id: `boundary-read-${index}`,
      args: { path: proofName },
    })));
  }
  streamText(response, "TASK_FINISH_PROOF_OK — dashboard writeback completed and verified.");
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
assert(address && typeof address === "object");

try {
  await tmux("new-session", "-d", "-s", session, "-x", "100", "-y", "34", shellCommand({
    VANTA_HOME: home,
    VANTA_REPO: repo,
    VANTA_PROVIDER: "custom",
    VANTA_OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    VANTA_MODEL: "completion-proof",
    VANTA_OPERATING_MODE: "auto",
    VANTA_PERMISSION_MODE: "auto",
    VANTA_AUTO_MODE: "1",
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_TRUST_ALL: "1",
    VANTA_PROMPT_SUGGESTIONS: "0",
  }, command, repo));

  await waitForPane("auto mode on");
  await send("Update the stale dashboard and finish the remaining task.");
  await waitForPane("TASK_FINISH_PROOF_OK");

  const pane = await capture();
  assert.match(pane, /Not done: dashboard writeback/);
  assert.match(pane, /TASK_FINISH_PROOF_OK/);
  assert.equal(await readFile(proofPath, "utf8"), "fresh\n");
  assert.equal(requestCount, 4);
  await send("Demonstrate a visible repeated-call boundary receipt.");
  await waitForPane("Stopped: called read_file");
  assert.match(await capture(), /identical arguments 3 times without progress/);
  assert.equal(requestCount, 5);
  console.log("tui-task-completion: PASS");
  console.log("executed: real TUI → Auto → unfinished answer → automatic continuation → edit → final completion → visible stop receipt");
} finally {
  await tmux("kill-session", "-t", session).catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(home, { recursive: true, force: true });
  await rm(proofPath, { force: true });
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
    id: "completion-proof",
    object: "chat.completion.chunk",
    created: 1,
    model: "completion-proof",
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
