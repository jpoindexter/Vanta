import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { _electron as electron } from "playwright-core";

const home = await mkdtemp(join(tmpdir(), "vanta-desktop-long-session-home-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-long-session-profile-"));
const project = await mkdtemp(join(tmpdir(), "vanta-desktop-long-session-project-"));
const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7955";
const executablePath = process.env.VANTA_DESKTOP_APP;
const rendererErrors = [];
let app;

try {
  await mkdir(join(home, "sessions"), { recursive: true });
  await writeFile(join(project, "README.md"), "# Long session proof\n", "utf8");
  const longMessages = Array.from({ length: 500 }, (_, index) => [
    { role: "user", content: `Prompt ${index + 1}: inspect durable task state without losing my reading position.` },
    { role: "assistant", content: `Result ${index + 1}: the task remains readable, bounded, and recoverable.\n\nThis response provides enough height to exercise offscreen rendering and navigation.` },
  ]).flat();
  await writeSession("long-session-proof", "Navigate five hundred turns", longMessages, "2026-07-17T10:00:00.000Z");
  await writeSession("short-session-proof", "Short comparison task", [
    { role: "user", content: "Keep this task short." },
    { role: "assistant", content: "Short task ready." },
  ], "2026-07-17T09:00:00.000Z");

  app = await launch();
  let page = await readyPage(app);
  await openSession(page, "Navigate five hundred turns");
  await proveFixture(page);

  const detachedView = await detachAndPersist(page, 0.44);
  await openSession(page, "Short comparison task");
  const afterShort = await storedView(page, "long-session-proof");
  assert.equal(afterShort?.anchorIndex, detachedView.anchorIndex, `opening another task should not overwrite the outgoing anchor: ${JSON.stringify(afterShort)}`);
  await openSession(page, "Navigate five hundred turns");
  await expectRestoredPosition(page, detachedView, "task switch");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    window.__vantaScrollBehavior = "";
    const original = HTMLElement.prototype.scrollTo;
    window.__vantaOriginalScrollTo = original;
    HTMLElement.prototype.scrollTo = function patched(options, y) {
      window.__vantaScrollBehavior = typeof options === "object" ? options.behavior ?? "" : "";
      return typeof options === "object" ? original.call(this, options) : original.call(this, options, y);
    };
  });
  await page.getByRole("button", { name: /Jump to prompt: Prompt 1:/ }).click();
  assert.equal(await page.evaluate(() => window.__vantaScrollBehavior), "auto", "reduced motion should disable smooth prompt scrolling");
  await page.evaluate(() => { HTMLElement.prototype.scrollTo = window.__vantaOriginalScrollTo; });
  await page.getByRole("button", { name: "Scroll to latest message" }).click();
  await page.getByRole("button", { name: "Scroll to latest message" }).waitFor({ state: "detached" });

  await page.setViewportSize({ width: 760, height: 700 });
  assert.equal(await page.locator(".prompt-markers").evaluate((element) => getComputedStyle(element).display), "none", "compact mode should hide the prompt minimap");
  await page.locator(".chat-thread").focus();
  await page.keyboard.press("PageUp");
  await page.getByRole("button", { name: "Scroll to latest message" }).waitFor();
  await page.setViewportSize({ width: 1024, height: 640 });

  const streamView = await detachAndPersist(page, 0.52);
  let eventRequests = 0;
  await page.route("**/api/events", async (route) => {
    eventRequests += 1;
    if (eventRequests === 1) await delay(2500);
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: eventRequests === 1 ? `data: ${JSON.stringify({ label: "", delta: "streamed while reading" })}\n\n` : "" });
  });
  await page.reload();
  await page.locator(".app-shell").waitFor();
  await page.getByRole("button", { name: "Scroll to latest message" }).getByText("New messages").waitFor();
  await expectRestoredPosition(page, streamView, "streamed delta");
  await page.unroute("**/api/events");

  const relaunchView = await detachAndPersist(page, 0.36);
  await app.close();
  app = undefined;
  await delay(250);
  app = await launch();
  page = await readyPage(app);
  await openSession(page, "Navigate five hundred turns");
  await expectRestoredPosition(page, relaunchView, "app relaunch");

  await page.locator(".chat-thread").evaluate((element) => {
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: -80, bubbles: true }));
    const start = new Event("touchstart", { bubbles: true });
    Object.defineProperty(start, "touches", { value: [{ clientY: 100 }] });
    element.dispatchEvent(start);
    const move = new Event("touchmove", { bubbles: true });
    Object.defineProperty(move, "touches", { value: [{ clientY: 140 }] });
    element.dispatchEvent(move);
  });
  await page.getByRole("button", { name: "Scroll to latest message" }).waitFor();
  if (rendererErrors.length) throw new Error(`Renderer errors: ${rendererErrors.join(" | ")}`);
  process.stdout.write(`${JSON.stringify({ ok: true, target: executablePath ? "packaged" : "source", turns: 500, renderedMessages: await page.locator(".transcript-turn").count(), promptMarkers: 32, taskSwitch: true, relaunch: true, streamingDetached: true, inputs: ["wheel", "touch", "keyboard"], viewports: ["1440x960", "1024x640", "760x700"], reducedMotion: true, measuredVirtualization: true })}\n`);
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([rm(home, { recursive: true, force: true }), rm(userData, { recursive: true, force: true }), rm(project, { recursive: true, force: true })]);
}

async function writeSession(id, title, messages, updated) {
  await writeFile(join(home, "sessions", `${id}.json`), JSON.stringify({ id, title, started: updated, updated, messages }), "utf8");
}

async function launch() {
  return electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
    cwd: process.cwd(),
    env: { ...process.env, VANTA_HOME: home, VANTA_DESKTOP_USER_DATA: userData, VANTA_DESKTOP_PORT: port, VANTA_DESKTOP_AUTOMATION: "1", OPENAI_API_KEY: "vanta-long-session-proof-key", ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  });
}

async function readyPage(instance) {
  const page = await instance.firstWindow();
  await page.setViewportSize({ width: 1440, height: 960 });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => rendererErrors.push(`page error: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) rendererErrors.push(`console error: ${message.text()}`); });
  await page.locator(".app-shell").waitFor();
  return page;
}

async function openSession(page, title) {
  const target = page.locator(".session-list .session").filter({ hasText: title }).first();
  await target.waitFor();
  await target.click();
  await page.locator(".chat-thread").waitFor();
  if (title.includes("five hundred")) await page.locator(".prompt-markers").waitFor();
  else await page.waitForFunction(() => document.querySelectorAll(".transcript-turn").length === 2);
}

async function proveFixture(page) {
  const rendered = await page.locator(".transcript-turn").count();
  assert.ok(rendered > 0 && rendered < 80, `the 500-turn fixture should render a bounded measured window, received ${rendered}`);
  assert.equal(await page.locator(".prompt-markers button").count(), 32, "the prompt map should stay bounded");
  await page.getByRole("button", { name: /Jump to prompt: Prompt 500:/ }).waitFor();
  assert.ok(await page.locator(".transcript-window").evaluate((element) => element.getBoundingClientRect().height > 10_000), "the measured virtual transcript should preserve the full scroll range");
  await expectStableLatest(page);
  const metrics = await scrollMetrics(page);
  assert.ok(metrics.distance <= 32, `freshly opened task should follow Latest: ${JSON.stringify(metrics)}`);
}

async function detachAt(page, ratio) {
  const top = await page.locator(".chat-thread").evaluate((element, value) => {
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: -80, bubbles: true }));
    element.scrollTop = element.scrollHeight * value;
    element.dispatchEvent(new Event("scroll"));
    return element.scrollTop;
  }, ratio);
  await page.getByRole("button", { name: "Scroll to latest message" }).waitFor();
  return top;
}

async function detachAndPersist(page, ratio) {
  await detachAt(page, ratio);
  let stored = null;
  let actual = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await delay(100);
    stored = await storedView(page, "long-session-proof");
    actual = await page.locator(".chat-thread").evaluate((element) => element.scrollTop);
    if (stored && !stored.stickToBottom && Math.abs(stored.scrollTop - actual) < 180) break;
  }
  assert.ok(stored && !stored.stickToBottom && stored.scrollTop > 0 && Math.abs(stored.scrollTop - actual) < 180, `detached reading position should settle and persist: actual ${actual}, stored ${JSON.stringify(stored)}`);
  assert.equal(typeof stored.anchorIndex, "number", `detached position should include a turn anchor: ${JSON.stringify(stored)}`);
  return stored;
}

async function expectRestoredPosition(page, expected, reason) {
  let actual = null;
  const history = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    actual = await visibleAnchor(page);
    history.push({ actual, stored: await storedView(page, "long-session-proof") });
    if (actual && Math.abs(actual.index - expected.anchorIndex) <= 1) break;
    await delay(80);
  }
  const stored = await storedView(page, "long-session-proof");
  assert.ok(actual && Math.abs(actual.index - expected.anchorIndex) <= 1, `${reason} should restore the reading anchor: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}, stored ${JSON.stringify(stored)}, history ${JSON.stringify(history)}`);
  await page.getByRole("button", { name: "Scroll to latest message" }).waitFor();
}

async function visibleAnchor(page) {
  return page.locator(".chat-thread").evaluate((scroller) => {
    const top = scroller.getBoundingClientRect().top;
    const turns = [...scroller.querySelectorAll(".transcript-turn")];
    const element = turns.find((turn) => turn.getBoundingClientRect().bottom > top);
    if (!(element instanceof HTMLElement)) return null;
    return { index: Number(element.dataset.index), offset: top - element.getBoundingClientRect().top };
  });
}

async function storedView(page, sessionId) {
  return page.evaluate((id) => {
    const raw = localStorage.getItem("vanta.desktop.sessionViewState.v1");
    const entries = raw ? JSON.parse(raw) : [];
    return entries.find(([key]) => key === id)?.[1] ?? null;
  }, sessionId);
}

async function scrollMetrics(page) {
  return page.locator(".chat-thread").evaluate((element) => ({ top: element.scrollTop, height: element.scrollHeight, client: element.clientHeight, distance: element.scrollHeight - element.scrollTop - element.clientHeight }));
}

async function expectStableLatest(page) {
  let consecutive = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const metrics = await scrollMetrics(page);
    consecutive = metrics.distance <= 32 ? consecutive + 1 : 0;
    if (consecutive >= 4) return;
    await delay(80);
  }
  throw new Error(`Latest edge did not stabilize: ${JSON.stringify(await scrollMetrics(page))}`);
}
