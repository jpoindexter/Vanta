import assert from "node:assert/strict";
import fs from "node:fs";
import { makeSandbox, launchApp, killLeftovers } from "../done-path/harness.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { waitForShell, newChat, sendText, waitFinished } from "../done-path/lib.mjs";

const box = await makeSandbox();
const model = await startScriptedModel();
const ctx = await launchApp({ box, project: box.projectA, modelUrl: model.url });
const checks = [];
const states = [];
const errors = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
ctx.page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
ctx.page.on("pageerror", error => errors.push(String(error)));

async function state(name) {
  const row = await ctx.page.evaluate(() => {
    const el = document.activeElement;
    const style = getComputedStyle(el);
    const viewport = document.querySelector('[data-slot="aui_thread-viewport"]');
    return {
      index: el.getAttribute("data-timeline-index"),
      label: el.getAttribute("aria-label"),
      focused: el.matches(":focus-visible"),
      shadow: style.boxShadow,
      stops: [...document.querySelectorAll(".thread-timeline-tick")].filter(button => button.tabIndex === 0).length,
      scroll: viewport.scrollTop,
      maxScroll: viewport.scrollHeight - viewport.clientHeight,
    };
  });
  states.push({ name, ...row });
  return row;
}

try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  for (let index = 0; index < 4; index += 1) {
    await sendText(ctx.page, `Timeline ${index + 1}: ${("Local navigation paragraph with several lines.\n").repeat(15)}`);
    check(`Real local reply ${index + 1} arrives`, await waitFinished(ctx.page, { finishedBefore: index }));
  }
  for (let index = 0; index < 40; index += 1) {
    await ctx.page.keyboard.press("Shift+Tab");
    if (await ctx.page.evaluate(() => document.activeElement.hasAttribute("data-timeline-index"))) break;
  }
  const entry = await state("entry");
  await ctx.page.screenshot({ path: `${box.root}/timeline-focus.png` });
  check("Shift+Tab reaches the active prompt", entry.index === "3");
  check("Transcript rail has exactly one sequential Tab stop", entry.stops === 1);
  check("Focused tick has a visible 2px ring", entry.focused && /2px inset/.test(entry.shadow));
  for (const [key, expected] of [["Home", "0"], ["ArrowDown", "1"], ["End", "3"], ["ArrowUp", "2"], ["Home", "0"], ["ArrowUp", "0"]]) {
    await ctx.page.keyboard.press(key);
    const row = await state(key);
    check(`${key} focuses prompt ${expected} without another Tab stop`, row.index === expected && row.stops === 1);
  }
  check("Arrow navigation does not submit a new model request", model.requests.length === 4);
  await ctx.page.keyboard.press("Enter");
  await ctx.page.waitForFunction(() => document.querySelector('[data-slot="aui_thread-viewport"]').scrollTop < 40);
  check("Enter actually jumps the transcript to its first prompt", (await state("jump-first")).scroll < 40);
  await ctx.page.keyboard.press("Tab");
  check("Tab leaves the rail without visiting the next prompt", (await state("leave")).index === null);
  await ctx.page.keyboard.press("Enter");
  await ctx.page.waitForFunction(() => {
    const el = document.querySelector('[data-slot="aui_thread-viewport"]');
    return el.scrollHeight - el.clientHeight - el.scrollTop < 3;
  });
  check("Keyboard Scroll to bottom actually returns to the latest reply", true);
  for (let index = 0; index < 25; index += 1) {
    await ctx.page.keyboard.press("Tab");
    if (await ctx.page.evaluate(() => document.activeElement.matches('[data-vp="composer-input"]'))) break;
  }
  check("Tab returns to the chat composer", await ctx.page.evaluate(() => document.activeElement.matches('[data-vp="composer-input"]')));
  await ctx.page.keyboard.insertText("Keep this unsent draft");
  await ctx.page.locator('[data-slot="aui_thread-viewport"]').first().evaluate(el => { el.scrollTop = el.scrollHeight; });
  await ctx.page.waitForTimeout(300);
  check("Scrolling after leaving the rail does not steal typing focus", await ctx.page.locator('[data-vp="composer-input"]').first().evaluate(el => el === document.activeElement && el.textContent === "Keep this unsent draft"));
  check("Navigation never sends the draft or replays tools", model.requests.length === 4);
  check("No renderer errors", errors.length === 0);
  await ctx.page.screenshot({ path: `${box.root}/timeline-draft.png` });
  const report = { root: box.root, checks, states, rendererErrors: errors, modelRequests: model.requests.length };
  fs.writeFileSync(`${box.root}/keyboard-timeline.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  fs.writeFileSync(`${box.root}/keyboard-timeline-failure.json`, JSON.stringify({ checks, states, rendererErrors: errors }, null, 2));
  await ctx.page.screenshot({ path: `${box.root}/failure.png` }).catch(() => undefined);
  process.stderr.write(`${box.root}\n${error.stack}\n`);
  process.exitCode = 1;
} finally {
  await ctx.app.close();
  await model.close();
  killLeftovers(box);
}
