#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chatFirstProviderFixture } from "./lib/chat-first-provider-fixture.mjs";

// Synthetic recorder binary only: the shipped TUI, capture cleanup, ffmpeg and
// cached local Whisper are real. No hardware microphone or hosted STT is used.
const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "vanta-tui-dictation-proof-"));
const project = join(root, "project"), state = join(root, "state"), temp = join(root, "tmp");
const bin = join(root, "bin"), audio = join(root, "synthetic.wav"), log = join(root, "recordings.jsonl");
const artifacts = resolve(".artifacts/tui-dictation-proof");
const session = `vanta-dictation-proof-${process.pid}`;
const launcher = resolve("bin/vanta.mjs");
const kernelBin = resolve(process.env.VANTA_KERNEL_BIN ?? "release/mac-arm64/Vanta.app/Contents/Resources/kernel/vanta-kernel");
const checks = [];
let fixture, kernel;
let kernelLog = "";

try {
  await access(kernelBin); await access(launcher);
  await Promise.all([project, state, temp, bin, artifacts].map((path) => mkdir(path, { recursive: true })));
  await exec("/usr/bin/say", ["-v", "Samantha", "-o", join(root, "speech.aiff"), "Please research the local weather and prepare a short summary."], { timeout: 30_000 });
  await exec("/opt/homebrew/bin/ffmpeg", ["-v", "error", "-i", join(root, "speech.aiff"), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", audio], { timeout: 30_000 });
  await prepareRecorder();
  fixture = await chatFirstProviderFixture();
  const port = await unusedPort();
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME, TMPDIR: temp, LANG: "en_US.UTF-8", TERM: "xterm-256color", NODE_ENV: "production",
    VANTA_HOME: state, VANTA_PROJECT_ROOT: project, VANTA_ROOT: project, VANTA_KERNEL_URL: `http://127.0.0.1:${port}`, VANTA_KERNEL_BIN: kernelBin,
    VANTA_PROVIDER: "custom", VANTA_OPENAI_BASE_URL: fixture.url, VANTA_MODEL: "desktop-proof", VANTA_STT_MODEL: "tiny",
    VANTA_MCP_AUTO_MOUNT: "0", VANTA_TRUST_ALL: "1", VANTA_PROMPT_SUGGESTIONS: "0", VANTA_SELF_IMPROVE: "0", VANTA_BRAIN_LEARN: "0" };
  kernel = spawn(kernelBin, ["serve", String(port)], { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] });
  kernel.stdout.on("data", (chunk) => { kernelLog += chunk; }); kernel.stderr.on("data", (chunk) => { kernelLog += chunk; });
  await waitUntil(async () => { try { return (await fetch(`${env.VANTA_KERNEL_URL}/api/status`)).ok; } catch { return false; } }, "isolated kernel readiness");
  const vars = Object.entries(env).map(([key, value]) => `${key}=${quote(value)}`).join(" ");
  await tmux("new-session", "-d", "-s", session, "-x", "140", "-y", "48", `cd ${quote(project)} && env -i ${vars} ${quote(process.execPath)} ${quote(launcher)}`);
  await waitPane("Ask Vanta anything");
  await check("voice setup remains in the TUI without downloading or recording", async () => {
    await waitPane("text stays a draft");
    await command("/voice setup"); await waitPane("nothing is downloaded here");
    await waitPane("Ask Vanta anything"); assert.equal(await recordingCount(), 0);
    assert.equal(fixture.requests.length, 0); await savePane("01-setup");
  });
  await check("idle indicator and voice menu expose setup, recording and cancellation", async () => {
    const pane = await capture();
    assert.match(pane, /text stays a draft/); assert.match(pane, /record \[seconds\]/);
    assert.match(pane, /\/voice status · \/voice setup · \/voice cancel/);
  });
  await check("Ctrl R records, transcribes locally, and appends an editable unsent draft", async () => {
    await paste("Existing draft."); await press("C-r");
    await waitPane("Recording locally"); await savePane("02-recording");
    await waitPane("Transcribing locally"); await savePane("03-transcribing");
    await waitPane("local weather", 150_000); await waitPane("short summary");
    const pane = await capture(); assert.match(pane, /Existing draft\./); assert.equal(fixture.requests.length, 0);
    await paste(" Edited before sending."); await waitPane("Edited before sending.");
    assert.equal(fixture.requests.length, 0); await waitCaptureCleanup(); await savePane("04-editable-draft");
  });
  await check("Escape cancels capture and preserves the editable draft without sending", async () => {
    await press("C-r"); await waitPane("Recording locally");
    await waitUntil(async () => (await recordingCount()) === 2, "second synthetic recorder started");
    await press("Escape"); await waitPane("Dictation cancelled. Nothing sent.");
    await waitPane("Edited before sending."); await waitCaptureCleanup();
    assert.equal(fixture.requests.length, 0); await savePane("05-cancelled");
  });
  const result = { verdict: "passed", checks, recordings: await recordingCount(), providerRequests: fixture.requests.length,
    boundary: "Real shipped bin/vanta.mjs launcher, tmux/Ink UI, capture cleanup, ffmpeg, isolated Rust kernel and cached local Whisper. Synthetic sox replaces hardware capture; local model provider fixture receives zero requests. No physical microphone, TCC or spoken-reply proof." };
  await writeFile(join(artifacts, "result.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  await savePane("failure").catch(() => {});
  await writeFile(join(artifacts, "result.json"), JSON.stringify({ verdict: "failed", checks, error: String(error), kernelLog }, null, 2)).catch(() => {});
  throw error;
} finally {
  await tmux("kill-session", "-t", session).catch(() => {});
  kernel?.kill("SIGTERM"); await fixture?.close();
  await rm(root, { recursive: true, force: true });
}

async function prepareRecorder() {
  // A Node shim avoids orphaned sleep/cp subprocesses on cancellation. It never
  // delegates to real sox and checks the exact private output before copying.
  const source = `#!${process.execPath}\nconst fs = require('node:fs');\nconst path = require('node:path');\nif (process.argv[2] === '--version') { console.log('synthetic-sox-proof'); process.exit(0); }\nconst args = process.argv.slice(2);\nconst output = args[7];\nif (args[0] !== '-d' || !output || !output.startsWith(${JSON.stringify(temp + "/vanta-voice-")}) || path.basename(output) !== 'audio.wav') process.exit(9);\nfs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({output,pid:process.pid}) + '\\n');\nsetTimeout(() => { fs.copyFileSync(${JSON.stringify(audio)}, output); }, Number(args[10]) * 1000);\n`;
  await writeFile(join(bin, "sox"), source, { mode: 0o700 }); await chmod(join(bin, "sox"), 0o700);
}
async function recordingCount() { return (await readFile(log, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).length; }
async function waitCaptureCleanup() {
  await waitUntil(async () => !(await readdir(temp)).some((name) => name.startsWith("vanta-voice-") || name.startsWith("vanta-dictation-")), "private audio cleanup");
}
async function check(name, run) { await run(); checks.push(name); console.log(`PASS ${name}`); }
async function tmux(...args) { return exec("tmux", args, { maxBuffer: 2_000_000 }); }
async function capture() { return (await tmux("capture-pane", "-t", session, "-p")).stdout; }
async function savePane(name) { await writeFile(join(artifacts, `${name}.txt`), await capture()); }
async function press(key) { await tmux("send-keys", "-t", session, key); }
async function paste(value) {
  const buffer = `vanta-voice-input-${process.pid}`;
  await tmux("set-buffer", "-b", buffer, "--", value);
  await tmux("paste-buffer", "-d", "-p", "-b", buffer, "-t", session); await waitPane(value.trim());
}
async function command(value) {
  await press("C-u"); await paste(value);
  // The real composer intentionally treats Enter inside a paste burst as a
  // newline. Match the existing terminal proofs' separate submit keystroke.
  await new Promise((done) => setTimeout(done, 100)); await press("Enter");
}
async function waitPane(value, timeout = 30_000) { await waitUntil(async () => (await capture()).includes(value), value, timeout); }
async function waitUntil(predicate, label, timeout = 30_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await predicate()) return; await new Promise((done) => setTimeout(done, 50)); }
  throw new Error(`Timed out waiting for ${label}\n${await capture().catch(() => "")}`);
}
async function unusedPort() {
  const server = createServer(); await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port; await new Promise((done) => server.close(done)); return port;
}
function quote(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }
