import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const project = await mkdtemp(join(tmpdir(), "vanta-desktop-look-project-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-look-profile-"));
const png = await readFile(join(process.cwd(), "desktop-app", "build", "icon.png"));
const executablePath = process.env.VANTA_DESKTOP_APP;
const calls = [];
let screenAttempts = 0;
let submitted;
let app;

try {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: { ...process.env, VANTA_PROJECT_ROOT: project, VANTA_DESKTOP_USER_DATA: userData, VANTA_DESKTOP_PORT: "7835", VANTA_DESKTOP_AUTOMATION: "1", OPENAI_API_KEY: "vanta-look-smoke-key", ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.route("**/api/look", async (route) => {
    const mode = JSON.parse(route.request().postData() ?? "{}").mode;
    calls.push(mode);
    if (mode === "marquee") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "cancelled" }) });
    if (mode === "screen" && screenAttempts++ === 0) return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ status: "denied", recovery: "Allow Vanta in Screen Recording.", error: "Allow Vanta in Screen Recording." }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(captured(mode)) });
  });
  await page.route("**/api/chat", (route) => {
    submitted = JSON.parse(route.request().postData() ?? "{}");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ finalText: "I can see the Vanta window.", events: [] }) });
  });
  await page.setViewportSize({ width: 760, height: 700 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.querySelector("#vanta-composer")?.disabled);

  const look = page.getByRole("button", { name: "Capture screen context" });
  await look.click();
  const menu = page.getByRole("menu", { name: "Screen capture mode" });
  const bounds = await menu.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 760, `look menu outside compact viewport: ${JSON.stringify(bounds)}`);
  await selectCaptureMode(menu, "Select area");
  await page.waitForFunction(() => !document.querySelector("[aria-label='Capture screen context']")?.hasAttribute("disabled"));
  assert.equal(await page.locator(".image-context-chip").count(), 0, "cancelled marquee attached an image");
  assert.equal(submitted, undefined, "cancelled marquee sent a model request");

  await look.click();
  await selectCaptureMode(menu, "All displays");
  await page.getByText("Allow Vanta in Screen Recording.", { exact: true }).waitFor();
  await look.click();
  await selectCaptureMode(menu, "All displays");
  await page.getByText("LOOK · screen", { exact: true }).waitFor();
  await page.locator(".image-context-chip button").click();
  assert.equal(await page.locator(".image-context-chip").count(), 0);

  const composer = page.locator("#vanta-composer");
  await composer.fill("/look window");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("LOOK · window", { exact: true }).waitFor();
  assert.equal(await composer.inputValue(), "");
  assert.equal(submitted, undefined, "/look command sent before the operator asked a question");

  await composer.fill("What is visible?");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("I can see the Vanta window.", { exact: true }).waitFor();
  assert.equal(submitted.message, "What is visible?");
  assert.equal(submitted.images.length, 1);
  assert.equal(submitted.images[0].capture.mode, "window");
  assert.equal(submitted.images[0].capture.source, "macos-screencapture");
  console.log(JSON.stringify({ calls, compactMenu: true, cancelSafe: true, denialRecovery: true, removable: true, slashLook: true, receiptSubmitted: true }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([rm(project, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })]);
}

function captured(mode) {
  return { status: "captured", images: [{ name: `look-${mode}.png`, mime: "image/png", dataBase64: png.toString("base64"), capture: { source: "macos-screencapture", capturedAt: "2026-07-20T12:00:00.000Z", expiresAt: "2026-07-20T12:05:00.000Z", scope: "abcdef123456", mode, display: 1, bytes: png.length, pixelWidth: 1024, pixelHeight: 1024 } }] };
}

async function selectCaptureMode(menu, label) {
  const option = menu.locator("button", { hasText: label });
  await option.getByText(label, { exact: true }).waitFor();
  await option.click();
}
