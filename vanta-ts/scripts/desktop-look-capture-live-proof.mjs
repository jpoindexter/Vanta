import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

if (process.env.VANTA_DESKTOP_LIVE_PROOF !== "1") {
  throw new Error("Refusing provider use. Re-run with VANTA_DESKTOP_LIVE_PROOF=1.");
}

const executablePath = resolve(process.env.VANTA_DESKTOP_APP ?? "release/mac-arm64/Vanta.app/Contents/MacOS/Vanta");
const project = await mkdtemp(join(tmpdir(), "vanta-look-live-project-"));
const home = await mkdtemp(join(tmpdir(), "vanta-look-live-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-look-live-profile-"));
const marker = `VANTA_LOOK_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
let app;

try {
  app = await electron.launch({
    executablePath,
    args: ["--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VANTA_HOME: home,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7837",
      VANTA_DESKTOP_AUTOMATION: "1",
      VANTA_PROVIDER: process.env.VANTA_DESKTOP_LIVE_PROVIDER ?? "codex",
      VANTA_MODEL: process.env.VANTA_DESKTOP_LIVE_MODEL ?? "gpt-5.5",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(300_000);
  await focusVanta(app);
  const composer = page.locator("#vanta-composer");
  await composer.waitFor();
  await page.evaluate((text) => {
    const proof = document.createElement("div");
    proof.id = "vanta-look-live-marker";
    proof.textContent = text;
    proof.style.cssText = "position:fixed;inset:18% 12% auto;z-index:2147483647;padding:48px;background:#fff;color:#000;border:8px solid #000;font:700 64px/1 monospace;text-align:center";
    document.body.append(proof);
  }, marker);
  await focusVanta(app);
  await page.waitForTimeout(750);
  const captureResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/look" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Capture screen context" }).click();
  const menu = page.getByRole("menu", { name: "Screen capture mode" });
  await menu.locator("button", { hasText: "All displays" }).click();
  const captureBody = await (await captureResponse).json();
  assert.equal(captureBody.status, "captured", `Packaged native capture unavailable: ${JSON.stringify(captureBody)}`);
  await page.getByText("LOOK · screen", { exact: true }).waitFor();
  await page.locator("#vanta-look-live-marker").evaluate((node) => node.remove());

  let responseBody;
  page.on("response", async (response) => {
    if (new URL(response.url()).pathname !== "/api/chat" || response.request().method() !== "POST") return;
    responseBody = await response.json().catch(() => null);
  });
  await composer.fill(`Read the unique VANTA_LOOK marker in the attached screen capture. Reply with exactly that marker and nothing else.`);
  await page.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".message.assistant").last();
  await answer.waitFor();
  const rendered = await answer.innerText();
  assert.match(rendered, new RegExp(marker), `Desktop rendered an unexpected answer: ${rendered}`);
  assert.match(responseBody?.finalText ?? "", new RegExp(marker), `Desktop API returned an unexpected answer: ${JSON.stringify(responseBody)}`);
  console.log(JSON.stringify({ desktopLookLive: true, packaged: true, mode: "screen", markerRead: true, provider: process.env.VANTA_DESKTOP_LIVE_PROVIDER ?? "codex", model: process.env.VANTA_DESKTOP_LIVE_MODEL ?? "gpt-5.5" }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([project, home, userData].map((path) => rm(path, { recursive: true, force: true })));
}

async function focusVanta(electronApp) {
  await electronApp.evaluate(({ app: electron, BrowserWindow }) => {
    electron.focus({ steal: true });
    const window = BrowserWindow.getAllWindows()[0];
    window?.show();
    window?.focus();
  });
}
