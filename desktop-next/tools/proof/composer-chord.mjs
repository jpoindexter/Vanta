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
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const inComposer = () => ctx.page.locator('[data-vp="composer-input"]').first().evaluate(el => el === document.activeElement);

async function state(name) {
  const row = await ctx.page.evaluate(() => ({
    focus: document.activeElement.getAttribute("aria-label") || document.activeElement.getAttribute("data-vp"),
    composer: document.activeElement.matches('[data-vp="composer-input"]'),
    tooltips: [...document.querySelectorAll('[role="tooltip"]')].map(el => ({ state: el.getAttribute("data-state"), text: el.textContent })),
    menu: Boolean(document.activeElement.closest('[role="menu"]')),
  }));
  states.push({ name, ...row });
  return row;
}

try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  await sendText(ctx.page, "Chord local check");
  check("Local model replies", await waitFinished(ctx.page));
  await ctx.page.keyboard.press("Shift+Tab");
  check("Keyboard leaves the composer", !(await inComposer()));
  await ctx.page.getByRole("button", { name: "Settings", exact: true }).first().hover();
  await ctx.page.getByRole("tooltip").first().waitFor({ state: "visible" });
  const before = await state("tooltip-before-chord");
  check("A real passive tooltip is open without composer focus", before.tooltips.length > 0 && !before.composer);
  await ctx.page.screenshot({ path: `${box.root}/tooltip-before-chord.png` });
  await ctx.page.keyboard.press("Meta+l");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-vp="composer-input"]'));
  check("Cmd+L focuses the existing composer through the tooltip", (await state("chord")).composer);
  await ctx.page.keyboard.insertText("Keep this unsent draft");
  check("Typing remains visible after Cmd+L", await ctx.page.locator('[data-vp="composer-input"]').first().textContent() === "Keep this unsent draft");
  await ctx.page.getByRole("button", { name: "Permission mode: Ask each time", exact: true }).click();
  await ctx.page.getByRole("menu").waitFor({ state: "visible" });
  const menuFocus = await ctx.page.evaluateHandle(() => document.activeElement);
  await ctx.page.keyboard.press("Meta+l");
  check("An actual permission menu keeps its focused control", await ctx.page.evaluate(el => el === document.activeElement, menuFocus));
  check("Cmd+L does not focus behind an interactive menu", !(await inComposer()));
  await state("menu-keeps-focus");
  await ctx.page.keyboard.press("Escape");
  await ctx.page.keyboard.press("Meta+l");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-vp="composer-input"]'));
  check("Cmd+L works again after dismissing the menu", await inComposer());
  check("The unsent draft survives menu navigation", await ctx.page.locator('[data-vp="composer-input"]').first().textContent() === "Keep this unsent draft");
  check("Focus navigation never submits or retries", model.requests.length === 1);
  check("No renderer errors", ctx.errors.length === 0);
  await ctx.page.screenshot({ path: `${box.root}/composer-chord.png` });
  const report = { root: box.root, checks, states, modelRequests: model.requests.length, rendererErrors: ctx.errors };
  fs.writeFileSync(`${box.root}/composer-chord.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  fs.writeFileSync(`${box.root}/composer-chord-failure.json`, JSON.stringify({ checks, states, errors: ctx.errors }, null, 2));
  await ctx.page.screenshot({ path: `${box.root}/failure.png` }).catch(() => undefined);
  process.stderr.write(`${box.root}\n${error.stack}\n`);
  process.exitCode = 1;
} finally {
  await ctx.app.close();
  await model.close();
  killLeftovers(box);
}
