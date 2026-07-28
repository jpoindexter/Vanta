#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const session = `vanta-mode-proof-${process.pid}`;
const home = await mkdtemp(resolve(tmpdir(), "vanta-mode-proof-"));
const command = process.env.VANTA_COMMAND ?? resolve(process.cwd(), "../run.sh");

const server = createServer((request, response) => {
  if (request.url === "/v1/models") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ object: "list", data: [{ id: "mode-proof", object: "model" }] }));
    return;
  }
  response.writeHead(404).end();
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
    VANTA_MODEL: "mode-proof",
    VANTA_OPERATING_MODE: "default",
    VANTA_PERMISSION_MODE: "default",
    VANTA_AUTO_MODE: "0",
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_TRUST_ALL: "1",
    VANTA_PROMPT_SUGGESTIONS: "0",
  }, command));

  await waitForPane("manual mode on");
  await shiftTabTo("accept edits on");
  await shiftTabTo("plan mode on");
  await shiftTabTo("auto mode on");
  await shiftTabTo("manual mode on");

  const pane = await capture();
  assert.match(pane, /Ask Vanta anything/);
  assert.match(pane, /manual mode on/);
  console.log("tui-operating-mode: PASS");
  console.log("executed: real TUI launch → Shift+Tab ×4 → manual/accept edits/plan/auto/manual");
} finally {
  await tmux("kill-session", "-t", session).catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(home, { recursive: true, force: true });
}

async function shiftTabTo(text) {
  await tmux("send-keys", "-t", session, "BTab");
  await waitForPane(text);
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

function shellCommand(env, executable) {
  const vars = Object.entries(env).map(([key, value]) => `${key}=${quote(value)}`).join(" ");
  return `env ${vars} ${quote(executable)}`;
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
