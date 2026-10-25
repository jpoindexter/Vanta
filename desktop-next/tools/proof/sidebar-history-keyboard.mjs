import assert from "node:assert/strict";
import fs from "node:fs";
import { makeSandbox, launchApp, killLeftovers } from "../done-path/harness.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { waitForShell, newChat } from "../done-path/lib.mjs";

const box = await makeSandbox();
const model = await startScriptedModel();
const ctx = await launchApp({ box, project: box.projectA, modelUrl: model.url });
ctx.page.setDefaultTimeout(10_000);
const checks = [];
const states = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const editor = ctx.page.locator('[data-vp="composer-input"]:visible');
const search = ctx.page.locator('[data-testid="sidebar-search"] input');
async function snapshot(name) {
  states.push({ name, ...await ctx.page.evaluate(() => ({
    focus: document.activeElement.outerHTML.slice(0, 600),
    url: location.href,
    body: document.body.innerText.slice(-2500),
    sidebar: document.querySelector('[data-tour="sessions-sidebar"]')?.innerText,
    drafts: [...document.querySelectorAll('[data-vp="composer-input"]')].map(el => ({ visible: el.checkVisibility(), text: el.textContent }))
  })) });
}

try {
  await waitForShell(ctx.page);
  for (const name of ["Bravo", "Alpha"]) {
    await newChat(ctx.page);
    await editor.click();
    await ctx.page.keyboard.insertText(`History ${name}`);
    await ctx.page.keyboard.press("Enter");
    await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-role="assistant"]')].some(el => el.checkVisibility() && el.textContent.includes("Scripted turn finished.")));
    await editor.click();
    await ctx.page.keyboard.insertText(`Unsent ${name} draft`);
  }
  await ctx.page.keyboard.press("Meta+Shift+f");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-testid="sidebar-search"] input'));
  await snapshot("shortcut");
  check("Cmd+Shift+F focuses chat history search", await search.evaluate(el => el === document.activeElement));
  await ctx.page.keyboard.type("History Bravo");
  await ctx.page.getByTestId("sidebar-row").filter({ hasText: "History Bravo" }).first().waitFor();
  await ctx.page.keyboard.press("ArrowDown");
  await snapshot("arrow-down");
  check("ArrowDown reaches the first matching chat", await ctx.page.evaluate(() => document.activeElement.closest('[data-testid="sidebar-row"]')?.textContent.includes("History Bravo")));
  await ctx.page.keyboard.press("Enter");
  await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-vp="composer-input"]')].some(el => el.checkVisibility() && el.textContent === "Unsent Bravo draft"), null, { timeout: 30_000 });
  check("Selecting history restores that chat's own draft", true);
  await ctx.page.keyboard.press("Meta+l");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-vp="composer-input"]'));
  await ctx.page.keyboard.press("Meta+ArrowRight");
  await ctx.page.keyboard.type(" continued");
  check("Cmd+L and native End continue only the selected chat's draft", await editor.textContent() === "Unsent Bravo draft continued");
  await ctx.page.keyboard.press("Meta+Shift+f");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-testid="sidebar-search"] input') && document.activeElement.selectionStart === 0 && document.activeElement.selectionEnd === 13);
  check("Repeating chat search selects its retained query", true);
  await ctx.page.keyboard.type("History Alpha");
  check("Typing replaces the old query without appending", await search.inputValue() === "History Alpha");
  await ctx.page.getByTestId("sidebar-row").filter({ hasText: "History Alpha" }).first().waitFor();
  await ctx.page.keyboard.press("ArrowDown");
  await ctx.page.keyboard.press("Enter");
  await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-vp="composer-input"]')].some(el => el.checkVisibility() && el.textContent === "Unsent Alpha draft"), null, { timeout: 30_000 });
  check("Returning to the other chat preserves its separate draft", true);
  await ctx.page.keyboard.press("Meta+l");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-vp="composer-input"]'));
  await ctx.page.keyboard.press("Meta+f");
  await ctx.page.getByRole("search").locator("input").fill("History Alpha");
  await ctx.page.keyboard.press("Meta+Shift+f");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-testid="sidebar-search"] input'));
  await ctx.page.keyboard.press("Escape");
  await ctx.page.getByRole("search").waitFor({ state: "hidden" });
  check("Escape closes Find without clearing history search", await search.inputValue() === "History Alpha");
  check("Escape does not replace the selected draft", await editor.textContent() === "Unsent Alpha draft");
  check("Navigation does not send either draft", model.requests.length === 2);
  check("No renderer errors", ctx.errors.length === 0);
  await snapshot("selected");
  await ctx.page.screenshot({ path: `${box.root}/sidebar-history-keyboard.png` });
  const report = { root: box.root, checks, states, modelRequests: model.requests.length, rendererErrors: ctx.errors };
  fs.writeFileSync(`${box.root}/sidebar-history-keyboard.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  await snapshot("failure").catch(() => undefined);
  fs.writeFileSync(`${box.root}/failure.json`, JSON.stringify({ checks, states, errors: ctx.errors }, null, 2));
  await ctx.page.screenshot({ path: `${box.root}/failure.png` }).catch(() => undefined);
  process.stderr.write(`${box.root}\n${error.stack}\n`);
  process.exitCode = 1;
} finally {
  await ctx.app.close();
  await model.close();
  killLeftovers(box);
}
