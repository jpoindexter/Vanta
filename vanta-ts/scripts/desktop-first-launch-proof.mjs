import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";
import { chatFirstProviderFixture } from "./lib/chat-first-provider-fixture.mjs";

const root = await mkdtemp(join(tmpdir(), "vanta-no-project-launch-"));
const home = join(root, "home"), state = join(root, "state"), profile = join(root, "profile");
const artifacts = resolve(".artifacts/first-launch-proof");
await Promise.all([home, state, profile, artifacts].map((path) => mkdir(path, { recursive: true })));
const executablePath = resolve(process.env.VANTA_DESKTOP_APP ?? "release/mac-arm64/Vanta.app/Contents/MacOS/Vanta");
const archive = resolve(dirname(executablePath), "../Resources/app.asar");
const digest = async () => createHash("sha256").update(await readFile(archive)).digest("hex");
const candidateSha256 = await digest();
const fixture = await chatFirstProviderFixture();
const rendererErrors = [], checks = [];
let app, page;

async function launch() {
  app = await electron.launch({ executablePath, args: ["--no-companion"], cwd: home, env: {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/opt/homebrew/bin", HOME: home, TMPDIR: tmpdir(), LANG: "en_US.UTF-8",
    VANTA_HOME: state, VANTA_DESKTOP_USER_DATA: profile, VANTA_DESKTOP_AUTOMATION: "1",
    VANTA_DESKTOP_PORT: "18990", VANTA_PROVIDER: "custom", VANTA_MODEL: "desktop-proof",
    VANTA_OPENAI_BASE_URL: fixture.url, VANTA_MCP_AUTO_MOUNT: "0", VANTA_PROMPT_SUGGESTIONS: "0",
  } });
  page = await app.firstWindow(); page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  await page.locator(".chat-first-shell").waitFor();
  await page.waitForFunction(() => !document.querySelector("#vanta-composer")?.disabled);
}

try {
  await launch();
  const status = await page.evaluate(async () => (await fetch("/api/status", {
    headers: { "x-vanta-desktop-boundary": window.vantaDesktop.boundaryToken },
  })).json());
  assert.equal(status.root, home);
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  await page.locator("button.chat-new").click();
  await page.waitForFunction(() => {
    const input = document.querySelector("#vanta-composer");
    return input && !input.disabled && input.value === "";
  });
  await page.locator("#vanta-composer").fill("Editable first-launch draft; no project selected.");
  assert.equal(fixture.requests.length, 0);
  await page.screenshot({ path: join(artifacts, "01-no-project-chat.png") });
  checks.push("no-project native launch reaches editable New chat without a folder/setup form or model completion");
  await page.getByText("Draft saved", { exact: false }).waitFor();
  await app.close(); app = undefined; await launch();
  assert.equal(await page.locator("#vanta-composer").inputValue(), "Editable first-launch draft; no project selected.");
  assert.equal(fixture.requests.length, 0);
  checks.push("default workspace restart restores the unsent draft without requiring project selection");
  assert.deepEqual(rendererErrors, []); assert.equal(await digest(), candidateSha256);
  const result = { verdict: "passed", candidateSha256, checks, providerCompletions: fixture.requests.length,
    boundary: "Actual signed Electron with no --project, disposable HOME/state/profile, fixture discovery only", rendererErrors };
  await writeFile(join(artifacts, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page?.screenshot({ path: join(artifacts, "failure.png") }).catch(() => {});
  await writeFile(join(artifacts, "result.json"), JSON.stringify({ verdict: "failed", candidateSha256, checks, error: String(error) }));
  throw error;
} finally { await app?.close().catch(() => {}); await fixture.close(); }
