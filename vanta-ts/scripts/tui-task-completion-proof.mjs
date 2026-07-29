#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const session = `vanta-completion-proof-${process.pid}`;
const home = await mkdtemp(resolve(tmpdir(), "vanta-completion-proof-"));
const repo = resolve(process.cwd(), "..");
const proofName = `.vanta-task-completion-proof-${process.pid}.txt`;
const proofPath = resolve(repo, proofName);
const budgetDirName = `.vanta-task-budget-proof-${process.pid}`;
const budgetDir = resolve(repo, budgetDirName);
const command = process.env.VANTA_COMMAND ?? resolve(repo, "run.sh");
let requestCount = 0;

await writeFile(proofPath, "stale\n");
await mkdir(budgetDir);
await Promise.all(Array.from({ length: 29 }, (_, index) =>
  writeFile(resolve(budgetDir, `${index}.txt`), `evidence ${index}\n`)));

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
  if (requestCount >= 2 && requestCount <= 5) {
    return streamText(response, "Dashboard status captured; the writeback task is still open.");
  }
  if (requestCount === 6) {
    assert(
      body.messages.some((message) => /live checklist still has 1 open item.*Finish the next item now/i.test(message.content ?? "")),
      "automatic continuation nudge was not added",
    );
    assert(names.includes("edit_file"), `edit_file schema was not exposed: ${names.join(", ")}`);
    return streamTools(response, [{
      name: "edit_file",
      id: "completion-edit",
      args: { path: proofName, old_string: "stale\n", new_string: "fresh\n" },
    }]);
  }
  if (requestCount === 7) {
    return streamTools(response, [{
      name: "todo",
      id: "completion-plan-closed",
      args: {
        action: "write",
        items: [
          { text: "Inspect stale dashboard", status: "done" },
          { text: "Write updated dashboard", status: "done" },
        ],
      },
    }]);
  }
  if (requestCount === 8) {
    return streamText(response, "TASK_FINISH_PROOF_OK — dashboard writeback completed and verified.");
  }
  if (requestCount === 9) {
    assert(names.includes("todo"), `todo schema was not exposed: ${names.join(", ")}`);
    assert(names.includes("read_file"), `read_file schema was not exposed: ${names.join(", ")}`);
    return streamTools(response, [{
      name: "todo",
      id: "budget-plan-open",
      args: {
        action: "write",
        items: [
          { text: "Check the collected evidence", status: "in_progress" },
          { text: "Rank usable results", status: "pending" },
        ],
      },
    }, ...readCalls(0, 9)]);
  }
  if (requestCount === 10) return streamTools(response, readCalls(9, 10));
  if (requestCount === 11) return streamTools(response, readCalls(19, 10));
  if (requestCount === 12) {
    assert(
      body.messages.some((message) => /VANTA TOOL-BUDGET CLOSURE[\s\S]*2 open items/i.test(message.content ?? "")),
      "bounded closure directive with the open checklist was not injected",
    );
    return streamTools(response, [{
      name: "todo",
      id: "budget-plan-closed",
      args: {
        action: "write",
        items: [
          { text: "Check the collected evidence", status: "done" },
          { text: "Rank usable results", status: "done" },
        ],
      },
    }]);
  }
  if (requestCount === 13) {
    return streamText(response, "TASK_BUDGET_CLOSURE_OK — ranked results delivered without asking the operator to restart.");
  }
  if (requestCount === 14) {
    assert(names.includes("read_file"), `read_file schema was not exposed: ${names.join(", ")}`);
    return streamTools(response, Array.from({ length: 3 }, (_, index) => ({
      name: "read_file",
      id: `boundary-read-${index}`,
      args: { path: proofName },
    })));
  }
  throw new Error(`unexpected provider request ${requestCount}`);
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
  assert.match(pane, /Dashboard status captured/);
  assert.match(pane, /TASK_FINISH_PROOF_OK/);
  assert.equal(await readFile(proofPath, "utf8"), "fresh\n");
  assert.equal(requestCount, 8);
  await send("Use the evidence, finish every checklist item, and rank the usable results.");
  await waitForPane("TASK_BUDGET_CLOSURE_OK", 30_000);
  const budgetPane = await capture();
  assert.match(budgetPane, /TASK_BUDGET_CLOSURE_OK/);
  assert.match(budgetPane, /2 tasks \(2 done, 0 in progress, 0 open\)/);
  assert.doesNotMatch(budgetPane, /Tell me the one thing to do next/);
  assert.equal(requestCount, 13);
  await send("Demonstrate a visible repeated-call boundary receipt.");
  await waitForPane("Stopped: called read_file");
  assert.match(await capture(), /identical arguments 3 times without progress/);
  assert.equal(requestCount, 14);
  console.log("tui-task-completion: PASS");
  console.log("executed: real TUI → open checklist survives the generic nudge cap → verified edit/closure → 30-call acquisition cutoff → bounded checklist closure → hard repeated-call receipt");
} finally {
  await tmux("kill-session", "-t", session).catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(home, { recursive: true, force: true });
  await rm(proofPath, { force: true });
  await rm(budgetDir, { recursive: true, force: true });
}

function readCalls(offset, count) {
  return Array.from({ length: count }, (_, index) => ({
    name: "read_file",
    id: `budget-read-${offset + index}`,
    args: { path: `${budgetDirName}/${offset + index}.txt` },
  }));
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
