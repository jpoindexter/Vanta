import assert from "node:assert/strict";
import fs from "node:fs";
import { makeSandbox, launchApp, killLeftovers } from "../done-path/harness.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { waitForShell, newChat, sendText, waitFinished } from "../done-path/lib.mjs";

const box = await makeSandbox();
const model = await startScriptedModel();
const ctx = await launchApp({ box, project: box.projectA, modelUrl: model.url });
await ctx.page.emulateMedia({ reducedMotion: "reduce" });
const checks = [];
const states = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const viewport = '[data-slot="aui_thread-viewport"]';
const live = '[data-slot="aui_live-region"]';
const editor = ctx.page.locator('[data-vp="composer-input"]:visible');
async function jump(name, action, target) {
  await ctx.page.evaluate(selector => {
    const el = document.querySelector(selector);
    window.__navigationSamples = { active: true, values: [el.scrollTop] };
    const sample = () => { if (window.__navigationSamples.active) { window.__navigationSamples.values.push(el.scrollTop); requestAnimationFrame(sample); } };
    requestAnimationFrame(sample);
  }, viewport);
  await action();
  await ctx.page.waitForFunction(({ selector, target }) => {
    const el = document.querySelector(selector);
    return target === "top" ? el.scrollTop < 40 : el.scrollHeight - el.clientHeight - el.scrollTop < 3;
  }, { selector: viewport, target }, { timeout: 5000 });
  const values = await ctx.page.evaluate(selector => { window.__navigationSamples.active = false; return [...window.__navigationSamples.values, document.querySelector(selector).scrollTop]; }, viewport);
  states.push({ name, values });
  const first = values[0], last = values.at(-1);
  check(`${name} actually changes scroll position`, Math.abs(first - last) > 100);
  check(`${name} has no intermediate animated scroll positions`, values.every(value => Math.abs(value - first) < 1 || Math.abs(value - last) < 1));
}
try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  check("Reduced motion is enabled only for this test window", await ctx.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
  check("A polite empty log exists before the first reply", await ctx.page.locator(live).first().evaluate(el => el.getAttribute("role") === "log" && el.getAttribute("aria-live") === "polite" && el.textContent === ""));
  for (let index = 0; index < 4; index++) {
    const previous = index > 0 ? await ctx.page.locator(live).first().locator("p").last().elementHandle() : null;
    await sendText(ctx.page, `Motion prompt ${index + 1}: ${("Local navigation paragraph.\n").repeat(20)}`);
    check(`Local reply ${index + 1} finishes`, await waitFinished(ctx.page, { finishedBefore: index }));
    await ctx.page.waitForFunction(({ live, count }) => [...document.querySelectorAll(`${live} p`)].filter(el => el.textContent === "Response complete").length === count, { live, count: Math.min(index + 1, 3) }, { timeout: 1500 });
    if (previous) {
      await ctx.page.waitForFunction(el => el !== document.querySelector('[data-slot="aui_live-region"]').lastElementChild, previous, { timeout: 1500 });
      await previous.dispose();
    }
    const lines = await ctx.page.locator(live).first().locator("p").allTextContents();
    states.push({ name: `announcement-${index + 1}`, lines });
    check(`Reply ${index + 1} adds a fresh completion node within the six-line log`, lines.filter(line => line === "Response complete").length === Math.min(index + 1, 3));
  }
  await editor.click();
  await ctx.page.keyboard.insertText("Unsent reduced-motion draft");
  for (let index = 0; index < 35; index++) {
    await ctx.page.keyboard.press("Shift+Tab");
    if (await ctx.page.evaluate(() => document.activeElement.hasAttribute("data-timeline-index"))) break;
  }
  check("Native Shift+Tab reaches the timeline", await ctx.page.evaluate(() => document.activeElement.hasAttribute("data-timeline-index")));
  await ctx.page.keyboard.press("Home");
  await jump("Timeline Enter", () => ctx.page.keyboard.press("Enter"), "top");
  await ctx.page.getByRole("button", { name: "Scroll to bottom", exact: true }).waitFor({ timeout: 1500 });
  await ctx.page.keyboard.press("Tab");
  check("Tab reaches Scroll to bottom", await ctx.page.evaluate(() => document.activeElement.getAttribute("aria-label") === "Scroll to bottom"));
  await jump("Scroll to bottom Enter", () => ctx.page.keyboard.press("Enter"), "bottom");
  await ctx.page.keyboard.press("Meta+l");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-vp="composer-input"]'));
  check("Navigation preserves the draft", await editor.textContent() === "Unsent reduced-motion draft");
  check("Navigation does not reannounce completed history", (await ctx.page.locator(live).first().locator("p").allTextContents()).filter(line => line === "Response complete").length === 3);
  check("No extra model request", model.requests.length === 4);
  check("No renderer errors", ctx.errors.length === 0);
  process.stdout.write(`${JSON.stringify({ root: box.root, checks, states, requests: model.requests.length, errors: ctx.errors })}\n`);
} catch (error) {
  process.stderr.write(`${box.root}\n${error.stack}\n`);
  process.exitCode = 1;
} finally {
  await ctx.page.evaluate(() => { if (window.__navigationSamples) window.__navigationSamples.active = false; });
  const finalLog = await ctx.page.locator(live).first().locator("p").allTextContents();
  fs.writeFileSync(`${box.root}/reduced-motion-navigation.json`, JSON.stringify({ checks, states, finalLog, errors: ctx.errors }, null, 2));
  await ctx.page.screenshot({ path: `${box.root}/reduced-motion-navigation.png` }).catch(() => undefined);
  await ctx.app.close();
  await model.close();
  killLeftovers(box);
}
