import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const PNG_PATH = join(process.cwd(), "desktop-app", "build", "icon.png");
const project = await mkdtemp(join(tmpdir(), "vanta-desktop-clipboard-project-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-clipboard-profile-"));
const executablePath = process.env.VANTA_DESKTOP_APP;
let app;
let submitted = {};
let submitAttempt = 0;

try {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VANTA_PROJECT_ROOT: project,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7834",
      VANTA_DESKTOP_AUTOMATION: "1",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-clipboard-smoke-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.route("**/api/chat", (route) => {
    submitAttempt += 1;
    submitted = JSON.parse(route.request().postData() ?? "{}");
    const body = submitAttempt === 1
      ? { finalText: "Clipboard failed safely.", events: [{ label: "Vision provider unavailable.", ok: false }] }
      : { finalText: "Clipboard received.", events: [] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#vanta-composer") instanceof HTMLTextAreaElement && !document.querySelector("#vanta-composer").disabled);
  const composer = page.locator("#vanta-composer");
  await page.evaluate(() => {
    window.__vantaPasteEvents = [];
    document.addEventListener("paste", (event) => window.__vantaPasteEvents.push({ types: [...event.clipboardData.types], items: [...event.clipboardData.items].map((item) => [item.kind, item.type]), files: event.clipboardData.files.length }));
  });
  const foreground = async () => {
    await app.evaluate(({ app: electronApp, BrowserWindow }) => {
      electronApp.focus({ steal: true });
      const window = BrowserWindow.getAllWindows()[0];
      window?.show();
      window?.focus();
    });
    await page.bringToFront();
  };

  await composer.fill("before after");
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), "pasted\ntext");
  await foreground();
  await composer.focus();
  await composer.evaluate((element) => element.setSelectionRange(7, 12));
  await composer.press("Meta+V");
  assert.equal(await composer.inputValue(), "before pasted\ntext");

  await page.setViewportSize({ width: 760, height: 700 });
  await composer.fill("");
  await app.evaluate(({ clipboard, nativeImage }, imagePath) => {
    const image = nativeImage.createFromPath(imagePath);
    clipboard.write({ text: "Inspect this", image });
  }, PNG_PATH);
  const nativeClipboard = await app.evaluate(({ clipboard }) => ({ formats: clipboard.availableFormats(), text: clipboard.readText(), imageBytes: clipboard.readImage().toPNG().length }));
  await foreground();
  await composer.focus();
  await composer.press("Meta+V");
  await page.waitForTimeout(500);
  const pasteDiagnostic = await page.evaluate(async () => {
    const native = await window.vantaDesktop?.readClipboard?.();
    return {
      bridge: typeof window.vantaDesktop?.readClipboard,
      events: window.__vantaPasteEvents,
      native: native
        ? {
            text: native.text,
            imageBytes: native.image?.bytes ?? 0,
            imageMime: native.image?.mime ?? null,
          }
        : null,
      chips: document.querySelectorAll(".image-context-chip").length,
    };
  });
  console.log(JSON.stringify({ nativeClipboard, pasteDiagnostic }));
  assert.equal(pasteDiagnostic.chips, 1, "native image paste did not create a context chip");
  assert.equal(await composer.inputValue(), "Inspect this");

  await app.evaluate(({ clipboard, nativeImage }, imagePath) => {
    clipboard.write({ image: nativeImage.createFromPath(imagePath) });
  }, PNG_PATH);
  await composer.press("Meta+V");
  assert.equal(await page.locator(".image-context-chip").count(), 1, "duplicate paste added a second image");
  const geometry = await page.locator(".context-chips").evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  assert.ok(geometry.scroll <= geometry.client, `clipboard chip overflowed: ${JSON.stringify(geometry)}`);

  await page.locator(".image-context-chip button").click();
  assert.equal(await page.locator(".image-context-chip").count(), 0, "remove action left the image attached");
  await composer.press("Meta+V");
  assert.equal(await page.locator(".image-context-chip").count(), 1, "image could not be reattached after removal");

  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Clipboard failed safely.", { exact: true }).waitFor();
  assert.equal(await composer.inputValue(), "Inspect this", "failed submit cleared the draft");
  assert.equal(await page.locator(".image-context-chip").count(), 1, "failed submit cleared the image");

  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Clipboard received.").waitFor();
  assert.equal(submitted.message, "Inspect this");
  assert.equal(submitted.images?.length, 1);
  assert.equal(submitted.images?.[0]?.mime, "image/png");
  assert.ok(submitted.images?.[0]?.dataBase64?.length > 10);
  await page.waitForFunction(() => document.querySelectorAll(".image-context-chip").length === 0);
  assert.equal(await page.locator(".image-context-chip").count(), 0);
  assert.equal(await composer.inputValue(), "");

  console.log(JSON.stringify({ nativeTextPaste: true, nativeMixedPaste: true, deduplicated: true, removable: true, preservedAfterFailure: true, submittedImage: true, clearedAfterSuccess: true, viewports: ["1360x900", "760x700"], geometry }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([rm(project, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })]);
}
