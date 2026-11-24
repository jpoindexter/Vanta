import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { _electron as electron } from "playwright-core";
import { chatFirstProviderFixture } from "./lib/chat-first-provider-fixture.mjs";

// This driver never moves focus, clicks, types, or activates VoiceOver. A native
// operator performs those actions. Only the external model is synthetic.
const root = await mkdtemp(join(tmpdir(), "vanta-chat-first-voiceover-"));
const project = join(root, "project");
const proofHome = join(root, "state");
const profile = join(root, "profile");
const artifacts = resolve(".artifacts/chat-first-proof/voiceover");
const executablePath = resolve("release/mac-arm64/Vanta.app/Contents/MacOS/Vanta");
const asar = resolve(dirname(executablePath), "../Resources/app.asar");
const hash = async () => createHash("sha256").update(await readFile(asar)).digest("hex");
const candidateSha256 = await hash();
const keyboardOnly = process.env.VANTA_NATIVE_KEYBOARD_ONLY === "1";
await Promise.all([project, proofHome, profile, artifacts].map((path) => mkdir(path, { recursive: true })));
await writeFile(join(project, "brief.md"), "# Local desktop proof\nDisposable VoiceOver fixture.\n");
const fixture = await chatFirstProviderFixture();
const checkpoints = [];
const rendererErrors = [];
const chats = [];
const approvals = [];
let app;
let completed = false;
const input = createInterface({ input: process.stdin, terminal: false });
const interrupt = () => input.close();
process.once("SIGINT", interrupt);
try {
  app = await electron.launch({
    executablePath, args: ["--project", project, "--no-companion"], cwd: process.cwd(),
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin:/opt/homebrew/bin", TMPDIR: tmpdir(), LANG: "en_US.UTF-8",
      VANTA_HOME: proofHome, VANTA_DESKTOP_USER_DATA: profile, VANTA_DESKTOP_AUTOMATION: "1",
      VANTA_DESKTOP_PORT: "18791", VANTA_PROVIDER: "custom", VANTA_MODEL: "desktop-proof",
      VANTA_OPENAI_BASE_URL: fixture.url, VANTA_MCP_AUTO_MOUNT: "0", VANTA_PROMPT_SUGGESTIONS: "0",
      VANTA_OPERATING_MODE: "default", VANTA_PERMISSION_MODE: "default",
    },
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (new URL(request.url()).pathname === "/api/chat") chats.push(request.postDataJSON());
    if (new URL(request.url()).pathname === "/api/approval") approvals.push(request.postDataJSON());
  });
  await page.locator(".chat-first-shell").waitFor();
  await page.waitForFunction(() => !document.querySelector("#vanta-composer")?.disabled);
  await page.evaluate(async () => {
    const response = await fetch("/api/access-mode", { method: "POST", headers: {
      "content-type": "application/json", "x-vanta-desktop-boundary": window.vantaDesktop.boundaryToken,
    }, body: JSON.stringify({ mode: "ask" }) });
    if (!response.ok) throw new Error(`Permission fixture setup failed: ${response.status}`);
    globalThis.vantaNativeProof = { pointerDowns: 0, keys: [], focus: [] };
    window.addEventListener("pointerdown", () => { globalThis.vantaNativeProof.pointerDowns++; }, true);
    window.addEventListener("keydown", (event) => {
      globalThis.vantaNativeProof.keys.push({ key: event.key, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey, trusted: event.isTrusted });
    }, true);
    window.addEventListener("focusin", (event) => {
      const target = event.target;
      globalThis.vantaNativeProof.focus.push({ role: target.getAttribute("role") ?? target.tagName,
        name: target.getAttribute("aria-label") ?? target.textContent?.slice(0, 120) ?? "" });
    }, true);
  });
  console.log(`NATIVE_VOICEOVER_READY ${project}`);
  console.log(`Use native ${keyboardOnly ? "keyboard (screen-reader proof excluded)" : "VoiceOver and keyboard"}: open context, attach brief.md, request its bounded edit, approve once, read result. Enter checkpoint labels here; verify ends the proof.`);
  for await (const line of input) {
    const label = line.trim();
    if (!label) continue;
    const voiceOverPid = keyboardOnly ? null : execFileSync("pgrep", ["-x", "VoiceOver"], { encoding: "utf8" }).trim();
    if (!keyboardOnly) assert(voiceOverPid, "VoiceOver must be running at each checkpoint");
    const interaction = await page.evaluate(() => globalThis.vantaNativeProof);
    assert.equal(interaction.pointerDowns, 0, "Native proof must not use a pointer");
    const snapshot = await page.locator("body").ariaSnapshot();
    const index = checkpoints.length + 1;
    await page.screenshot({ path: join(artifacts, `${index}.png`) });
    checkpoints.push({ label, voiceOverPid, interaction, snapshot });
    await writeFile(join(artifacts, "checkpoints.json"), JSON.stringify(checkpoints, null, 2));
    console.log(`CHECKPOINT ${index} ${label}`);
    if (label !== "verify") continue;
    assert.equal(await hash(), candidateSha256, "Packaged candidate changed during replay");
    assert.equal(chats.length, 1, "Exactly one native chat submission is required");
    assert.deepEqual(chats[0].files, ["brief.md"], "Structured attachment must reach the real host");
    assert.match(chats[0].message, /Approval proof allowed/);
    assert.equal(approvals.filter((decision) => decision.decision === "allow").length, 1);
    assert.match(await readFile(join(project, "brief.md"), "utf8"), /^# Approved local edit/);
    assert.match(snapshot, /Local provider reply: Approval proof allowed/);
    assert(!snapshot.includes('button "Stop task"'), "Response must have settled");
    assert.equal(fixture.requests.length, 2, "Only the tool request and its settled response are expected");
    assert.deepEqual(rendererErrors, []);
    const receipt = { verdict: "keyboard-passed", candidateSha256, pointerDowns: 0, chatSubmissions: chats.length,
      structuredFiles: chats[0].files, allowOnce: 1, providerRequests: fixture.requests.length, rendererErrors,
      checkpointCount: checkpoints.length, voiceOverProcessRunning: keyboardOnly ? "not assessed" : true,
      screenReaderStatus: "Unverified. Keyboard operation and process presence do not prove speech or VoiceOver cursor operation; independent observation required.",
      boundary: "Native keyboard; real packaged renderer, host, kernel, approval and disposable file effect. External model is synthetic." };
    await writeFile(join(artifacts, "result.json"), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
    completed = true;
    break;
  }
  assert(completed, "Native replay ended before its acceptance assertions ran");
} catch (error) {
  await writeFile(join(artifacts, "failure.json"), JSON.stringify({ candidateSha256, error: String(error), checkpoints }, null, 2));
  throw error;
} finally {
  input.close();
  process.off("SIGINT", interrupt);
  await app?.close().catch(() => {});
  await fixture.close();
  await rm(root, { recursive: true, force: true });
}
