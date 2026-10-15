import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";
import { chatFirstProviderFixture } from "./lib/chat-first-provider-fixture.mjs";

// Synthetic microphone input only. Electron capture, HTTP and cached Whisper are real.
const root = await mkdtemp(join(tmpdir(), "vanta-dictation-proof-"));
const artifacts = resolve(".artifacts/dictation-proof");
const executablePath = resolve(process.env.VANTA_DESKTOP_APP ?? "release/mac-arm64/Vanta.app/Contents/MacOS/Vanta");
const asar = resolve(dirname(executablePath), "../Resources/app.asar");
const hash = async () => createHash("sha256").update(await readFile(asar)).digest("hex");
const candidateSha256 = await hash();
const checks = [];
const rendererErrors = [];
let app;
let page;
let fixture;
async function check(name, run) { await run(); checks.push(name); console.log(`PASS ${name}`); }
async function capture(name) { await page.screenshot({ path: join(artifacts, `${name}.png`) }); }

try {
  await Promise.all(["project", "profile", "state"].map((name) => mkdir(join(root, name))));
  await mkdir(artifacts, { recursive: true });
  const audio = join(root, "synthetic.wav");
  execFileSync("/usr/bin/say", ["-v", "Samantha", "-o", join(root, "speech.aiff"), "Please research the local weather and prepare a short summary."], { timeout: 30_000 });
  execFileSync("/opt/homebrew/bin/ffmpeg", ["-v", "error", "-i", join(root, "speech.aiff"), "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", audio], { timeout: 30_000 });
  fixture = await chatFirstProviderFixture();
  app = await electron.launch({ executablePath, cwd: process.cwd(), args: [
    // Test-only: Chromium's audio utility otherwise cannot read this temporary fixture.
    // Production renderer isolation and microphone policy remain unchanged.
    "--disable-features=AudioServiceSandbox", "--enable-logging=stderr",
    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${audio}%noloop`,
    "--project", join(root, "project"), "--no-companion",
  ], env: { PATH: process.env.PATH, TMPDIR: tmpdir(), LANG: "en_US.UTF-8",
    VANTA_HOME: join(root, "state"), VANTA_DESKTOP_USER_DATA: join(root, "profile"), VANTA_DESKTOP_AUTOMATION: "1",
    VANTA_DESKTOP_PORT: "18794", VANTA_PROVIDER: "custom", VANTA_MODEL: "desktop-proof", VANTA_OPENAI_BASE_URL: fixture.url,
    VANTA_MCP_AUTO_MOUNT: "0", VANTA_PROMPT_SUGGESTIONS: "0", VANTA_STT_MODEL: "tiny",
  } });
  app.process().stderr.on("data", (chunk) => { if (/fake device|ReadWavFile/.test(chunk.toString())) console.error(chunk.toString()); });
  page = await app.firstWindow(); page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  await page.locator(".chat-first-shell").waitFor();
  await page.waitForFunction(() => !document.querySelector("#vanta-composer")?.disabled);
  await check("shortcut starts visible local recording without submitting", async () => {
    await page.locator("#vanta-composer").fill("Existing draft.");
    await page.keyboard.press("Meta+Shift+D");
    await page.getByRole("button", { name: "Stop recording and transcribe", exact: true }).waitFor();
    assert.match(await page.locator(".voice-status").innerText(), /Recording/);
    assert.equal(fixture.requests.length, 0); await capture("01-recording");
  });
  await check("real local Whisper appends an editable draft; no automatic Send", async () => {
    // Allow the finite synthetic speech fixture to play through the real recorder.
    await page.waitForTimeout(7_000);
    await page.keyboard.press("Meta+Shift+D");
    await page.getByText("Dictation added to your draft. Review it before sending.", { exact: true }).waitFor({ timeout: 150_000 });
    const draft = await page.locator("#vanta-composer").inputValue();
    assert.match(draft, /^Existing draft\./); assert.match(draft, /local weather/i); assert.match(draft, /summary/i);
    await page.locator("#vanta-composer").fill(`${draft} Edited before sending.`);
    assert.equal(fixture.requests.length, 0); await capture("02-editable-transcript");
  });
  await check("Escape cancels recording and preserves the draft", async () => {
    const draft = await page.locator("#vanta-composer").inputValue();
    await page.keyboard.press("Meta+Shift+D");
    await page.getByRole("button", { name: "Stop recording and transcribe", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByText("Dictation canceled. Your draft is unchanged.", { exact: true }).waitFor();
    assert.equal(await page.locator("#vanta-composer").inputValue(), draft);
    assert.equal(fixture.requests.length, 0); await capture("03-canceled");
  });
  await check("new chat cancels dictation without leaking text into another chat", async () => {
    await page.locator("#vanta-composer").focus(); await page.keyboard.press("Meta+Shift+D");
    await page.getByRole("button", { name: "Stop recording and transcribe", exact: true }).waitFor();
    await page.locator("button.chat-new").click();
    await page.waitForFunction(() => document.querySelector("#vanta-composer")?.value === "");
    assert.equal(await page.getByRole("button", { name: "Stop recording and transcribe", exact: true }).count(), 0);
    assert.equal(fixture.requests.length, 0);
  });
  await check("keyboard help exposes dictation without starting a recording", async () => {
    await page.keyboard.press("Meta+k");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Keyboard shortcuts");
    await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor();
    await page.getByText("Start or stop local dictation (composer focused)", { exact: true }).waitFor();
    await page.getByText("Cancel dictation without sending", { exact: true }).waitFor();
    await capture("04-shortcuts"); await page.keyboard.press("Escape");
  });
  await check("digital silence is rejected without producing draft text", async () => {
    const wav = Buffer.alloc(44 + 32_000);
    wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16_000, 24); wav.writeUInt32LE(32_000, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(32_000, 40);
    const result = await page.evaluate(async (audioBase64) => {
      const response = await fetch("/api/voice/transcribe", { method: "POST",
        headers: { "content-type": "application/json", "x-vanta-desktop-boundary": window.vantaDesktop.boundaryToken },
        body: JSON.stringify({ audioBase64, mimeType: "audio/wav" }) });
      return { status: response.status, body: await response.json() };
    }, wav.toString("base64"));
    assert.equal(result.status, 422); assert.match(result.body.error, /No speech/);
    assert.equal(await page.locator("#vanta-composer").inputValue(), ""); assert.equal(fixture.requests.length, 0);
  });
  assert.deepEqual(rendererErrors, []); assert.equal(await hash(), candidateSha256);
  const result = { verdict: "passed", candidateSha256, checks, providerRequests: fixture.requests.length,
    boundary: "Synthetic microphone file with test-only AudioServiceSandbox disabled for fixture access; actual packaged capture, HTTP and cached local Whisper. Not production microphone/TCC acceptance." };
  await writeFile(join(artifacts, "result.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  await capture("failure").catch(() => {});
  await writeFile(join(artifacts, "result.json"), JSON.stringify({ verdict: "failed", candidateSha256, checks, error: String(error), rendererErrors }, null, 2));
  throw error;
} finally {
  await app?.close().catch(() => {}); await fixture?.close();
  await rm(root, { recursive: true, force: true });
}
