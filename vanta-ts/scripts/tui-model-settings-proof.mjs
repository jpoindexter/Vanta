#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const session = `vanta-model-settings-proof-${process.pid}`;
const home = await mkdtemp(resolve(tmpdir(), "vanta-model-settings-proof-"));
const codexHome = join(home, "codex");
const repo = resolve(process.cwd(), "..");
const command = process.env.VANTA_COMMAND ?? resolve(repo, "run.sh");

await mkdir(codexHome, { recursive: true });
// CodexProvider validates that its canonical auth file is readable at startup.
// The proof never sends a model request, so an empty synthetic record is enough
// and prevents this smoke from reading the operator's live credential store.
await writeFile(join(codexHome, "auth.json"), "{}\n", { mode: 0o600 });

try {
  await tmux("new-session", "-d", "-s", session, "-x", "100", "-y", "32", shellCommand({
    VANTA_HOME: home,
    CODEX_HOME: codexHome,
    VANTA_ROOT: repo,
    VANTA_REPO: repo,
    VANTA_PROVIDER: "codex",
    VANTA_MODEL: "gpt-5.6-sol",
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_PROMPT_SUGGESTIONS: "0",
  }, command, repo));

  await acceptFixtureProjectTrustAndWaitForComposer();
  await sendText("/effort ultra --session");
  await waitForPane("effort ultra · this session");
  await sendText("/speed fast --session");
  await waitForPane("speed fast · this session");
  await sendText("/model-settings");
  await waitForPane("gpt-5.6-sol settings");

  const pane = await capture();
  assert.match(pane, /Effort\s+ultra/);
  assert.match(pane, /Speed\s+fast/);
  await press("Escape");
  await waitForPane("✦ ultra");
  const status = await capture();
  assert.match(status, /✦ ultra/);
  assert.match(status, /speed:fast/);
  console.log("tui-model-settings: PASS");
  console.log("executed: real TUI launch → /effort Ultra → /speed Fast → settings overlay → live status");
} finally {
  await tmux("kill-session", "-t", session).catch(() => {});
  await rm(home, { recursive: true, force: true });
}

async function sendText(value) {
  await tmux("send-keys", "-t", session, "C-u");
  const buffer = `vanta-model-settings-input-${process.pid}`;
  // Use tmux's bracketed-paste path so the composer receives one exact value;
  // send-keys can interleave with Ink's slash-palette repaint in a live pane.
  await tmux("set-buffer", "-b", buffer, "--", value);
  await tmux("paste-buffer", "-d", "-p", "-b", buffer, "-t", session);
  await waitForPane(value);
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  await press("Enter");
}

async function press(key) {
  await tmux("send-keys", "-t", session, key);
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
}

async function tmux(...args) {
  return exec("tmux", args, { maxBuffer: 2_000_000 });
}

async function capture() {
  return (await tmux("capture-pane", "-t", session, "-p")).stdout;
}

async function waitForPane(text, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await capture()).includes(text)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(text)}\n${await capture().catch(() => "")}`);
}

async function acceptFixtureProjectTrustAndWaitForComposer(timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  let accepted = false;
  while (Date.now() < until) {
    const pane = await capture();
    if (pane.includes("Ask Vanta anything")) return;
    if (!accepted && pane.includes("Trust this project's context?")) {
      accepted = true;
      await press("y");
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for the trusted fixture composer\n${await capture().catch(() => "")}`);
}

function shellCommand(env, executable, cwd) {
  const vars = Object.entries(env).map(([key, value]) => `${key}=${quote(value)}`).join(" ");
  return `cd ${quote(cwd)} && env ${vars} ${quote(executable)}`;
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
