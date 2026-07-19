import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const project = await mkdtemp(join(tmpdir(), "vanta-origin-project-"));
const home = await mkdtemp(join(tmpdir(), "vanta-origin-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-origin-profile-"));
const hostile = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>hostile fixture</title><p>hostile local page</p>"); });
await new Promise((resolve, reject) => { hostile.once("error", reject); hostile.listen(0, "127.0.0.1", resolve); });
const hostileAddress = hostile.address();
if (!hostileAddress || typeof hostileAddress === "string") throw new Error("hostile fixture did not bind");
const hostileUrl = `http://127.0.0.1:${hostileAddress.port}/`;
const executablePath = process.env.VANTA_DESKTOP_APP;
let app;

try {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
      VANTA_HOME: home,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7837",
      VANTA_DESKTOP_AUTOMATION: "1",
      VANTA_PROVIDER: "openai",
      VANTA_MODEL: "gpt-5.6-sol",
      OPENAI_API_KEY: "vanta-origin-smoke-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.locator(".app-shell").waitFor();
  const trustedUrl = page.url();
  const boundary = await page.evaluate(() => window.vantaDesktop?.boundaryToken ?? "");
  assert.equal(boundary.length, 64, "sandboxed preload should expose one per-launch boundary to the trusted renderer");

  const untrustedRead = await fetch(`${new URL(trustedUrl).origin}/api/sessions`);
  assert.equal(untrustedRead.status, 403, "a local caller without the launch boundary must not read desktop state");

  await page.evaluate((target) => { window.location.href = target; }, hostileUrl);
  await page.waitForTimeout(250);
  assert.equal(page.url(), trustedUrl, "untrusted top-level navigation should be blocked");

  const windowsBefore = app.windows().length;
  await page.evaluate(() => { window.open("data:text/html,hostile", "_blank"); });
  await page.waitForTimeout(250);
  assert.equal(app.windows().length, windowsBefore, "untrusted window creation should be denied");

  const normalRendererRead = await page.evaluate(async () => {
    const token = window.vantaDesktop?.boundaryToken ?? "";
    const response = await fetch("/api/sessions", { headers: { "x-vanta-desktop-boundary": token } });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(normalRendererRead.status, 200);
  assert.ok(Array.isArray(normalRendererRead.body));

  console.log(JSON.stringify({ packaged: Boolean(executablePath), launchBoundary: true, untrustedReadDenied: true, navigationDenied: true, windowDenied: true, trustedRendererPassed: true }));
} finally {
  await app?.close().catch(() => undefined);
  await new Promise((resolve) => hostile.close(resolve));
  await Promise.all([rm(project, { recursive: true, force: true }), rm(home, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })]);
}
