import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const output = await mkdtemp(join(tmpdir(), "vanta-unified-design-proof-"));
const url = new URL("../../docs/design-proposals/unified-desktop-2026-10-25.html", import.meta.url).href;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], network = [], checks = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => { if (/^https?:/.test(request.url())) network.push(request.url()); });
const check = async (name, action) => { await action(); checks.push(name); };
try {
  await page.goto(url);
  await check("all document IDs are unique", async () => {
    const ids = await page.locator("[id]").evaluateAll((nodes) => nodes.map((node) => node.id));
    assert.equal(new Set(ids).size, ids.length);
  });
  await check("whole conversation renders", async () => assert.match(await page.locator("article").innerText(), /simplest option/));
  await page.screenshot({ path: join(output, "conversation-light.png") });
  await check("approved composer metrics retained", async () => {
    const values = await page.locator(".composer").evaluate((el) => ({ radius: getComputedStyle(el).borderRadius, inset: getComputedStyle(el).padding, width: el.getBoundingClientRect().width }));
    assert.equal(values.radius, "22px"); assert.equal(values.inset, "12px"); assert.ok(values.width <= 720);
  });
  await check("draft survives navigation", async () => {
    await page.locator("#draft").fill("Keep my local preview draft");
    await page.locator(".sidebar [data-view='home']").click();
    assert.equal(await page.locator("h1").innerText(), "What’s on your mind?");
    assert.equal(await page.locator("#draft").inputValue(), "Keep my local preview draft");
  });
  await page.screenshot({ path: join(output, "new-chat-light.png") });
  await check("send is explicitly local and non-destructive", async () => {
    await page.locator("#send").click();
    assert.match(await page.locator("#preview-status").innerText(), /nothing was sent/);
    assert.equal(await page.locator("#draft").inputValue(), "Keep my local preview draft");
  });
  await check("Today Inbox and project share the canvas", async () => {
    for (const [view, title] of [["today", "Today"], ["inbox", "Inbox"], ["project", "My business"]]) {
      await page.locator(`[data-view='${view}']`).first().click();
      assert.equal(await page.locator("h1").innerText(), title);
    }
  });
  await check("settings Escape returns focus", async () => {
    await page.locator(".profile").click();
    assert.equal(await page.locator("dialog").evaluate((el) => el.open), true);
    await page.screenshot({ path: join(output, "settings-light.png") });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog").evaluate((el) => el.open), false);
    assert.equal(await page.locator(".profile").evaluate((el) => el === document.activeElement), true);
  });
  await check("work panel opens and returns focus", async () => {
    await page.locator(".sidebar [data-view='conversation']").first().click();
    await page.locator("#workbench").click();
    assert.equal(await page.locator("#work-panel").isVisible(), true);
    await page.screenshot({ path: join(output, "work-panel-light.png") });
    await page.locator("#panel-close").click();
    assert.equal(await page.locator("#workbench").evaluate((el) => el === document.activeElement), true);
  });
  await check("search filters sample conversations", async () => {
    await page.locator("#search").click(); await page.locator("#chat-search").fill("document");
    assert.equal(await page.locator(".sidebar [data-view='conversation']:visible").count(), 1);
    await page.locator("#chat-search").fill("");
  });
  await check("same theme covers dialog and shell", async () => {
    await page.locator("#appearance").click(); await page.locator(".profile").click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    const fills = await page.evaluate(() => ["dialog", ".composer", ".canvas"].map((s) => getComputedStyle(document.querySelector(s)).backgroundColor));
    assert.equal(new Set(fills).size, 1);
    await page.screenshot({ path: join(output, "settings-dark.png") }); await page.keyboard.press("Escape");
  });
  await page.screenshot({ path: join(output, "conversation-dark.png") });
  for (const width of [1100, 800, 400]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await check(`no horizontal overflow at ${width}px`, async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true));
    await page.screenshot({ path: join(output, `narrow-${width}.png`) });
  }
  await check("collapsed navigation remains reachable", async () => {
    await page.locator("#sidebar-toggle").click();
    assert.equal(await page.locator(".sidebar").isVisible(), true);
    await page.locator(".sidebar [data-view='today']").click();
    assert.equal(await page.locator("h1").innerText(), "Today");
    assert.equal(await page.locator(".sidebar").isVisible(), false);
  });
  await check("no page exceptions or network requests", async () => { assert.deepEqual(errors, []); assert.deepEqual(network, []); });
  await writeFile(join(output, "result.json"), JSON.stringify({ source: fileURLToPath(url), checks, errors, network, scope: "Static proposal only; not production or installed acceptance" }, null, 2));
  process.stdout.write(JSON.stringify({ output, passed: checks.length, errors: errors.length, network: network.length }) + "\n");
} catch (error) {
  await writeFile(join(output, "failure.json"), JSON.stringify({ checks, errors, network, error: String(error) }, null, 2));
  process.stderr.write(`Proof retained: ${output}\n`); throw error;
} finally { await browser.close(); }
