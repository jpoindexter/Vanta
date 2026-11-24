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
const settled = () => ctx.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function snapshot(name) {
  states.push({ name, ...await ctx.page.evaluate(() => ({
    focus: document.activeElement.outerHTML.slice(0, 600),
    focusedVisible: document.activeElement.checkVisibility(),
    body: document.body.innerText.slice(-2200),
    drafts: [...document.querySelectorAll('[data-vp="composer-input"]')].map(el => ({ visible: el.checkVisibility(), text: el.textContent }))
  })) });
}
try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  await editor.click();
  await ctx.page.keyboard.insertText("Pane dismissal navigation");
  await ctx.page.keyboard.press("Enter");
  await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-role="assistant"]')].some(el => el.checkVisibility() && el.textContent.includes("Scripted turn finished.")));
  await editor.click();
  await ctx.page.keyboard.insertText("Unsent pane-dismissal draft");
  await ctx.page.getByTestId("titlebar-files").click();
  await ctx.page.locator('[title$="brief.md"]:visible').last().dblclick();
  const heading = ctx.page.getByRole("heading", { name: "Local brief", exact: true });
  await heading.waitFor();
  const preview = heading.locator('xpath=ancestor::*[@data-tree-group][1]');
  const edit = preview.getByRole("button", { name: "Edit", exact: true });
  await heading.click();
  await ctx.page.keyboard.press("Shift+Tab");
  check("Shift+Tab reaches the document's Edit control", await edit.evaluate(el => el === document.activeElement));
  await snapshot("before-close");
  await ctx.page.keyboard.press("Meta+w");
  await heading.waitFor({ state: "hidden" });
  check("Cmd+W closes the focused document pane", true);
  await ctx.page.waitForFunction(() => document.activeElement !== document.body && document.activeElement.checkVisibility() && !document.activeElement.closest('[data-pane-hidden]'), null, { timeout: 1500 });
  await snapshot("after-close");
  check("Closing the pane keeps focus on a visible control", await ctx.page.evaluate(() => document.activeElement !== document.body && document.activeElement.checkVisibility() && !document.activeElement.closest('[data-pane-hidden]')));
  await ctx.page.keyboard.press("Meta+l");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-vp="composer-input"]'));
  await settled();
  for (let index = 0; index < 5; index++) {
    await ctx.page.keyboard.press("Shift+Tab");
    await settled();
    await snapshot(`backward-${index}`);
    check(`Shift+Tab ${index + 1} stays on a visible control`, await ctx.page.evaluate(() => document.activeElement !== document.body && document.activeElement.checkVisibility() && !document.activeElement.closest('[data-pane-hidden]')));
  }
  for (let index = 0; index < 5; index++) { await ctx.page.keyboard.press("Tab"); await settled(); }
  check("Forward Tab returns to the composer", await editor.evaluate(el => el === document.activeElement));
  await ctx.page.locator('[title$="brief.md"]:visible').last().dblclick();
  await heading.waitFor();
  await heading.click();
  await ctx.page.keyboard.press("Shift+Tab");
  check("Reopened document receives keyboard focus", await edit.evaluate(el => el === document.activeElement));
  await preview.locator('[data-slot="pane-tab"]').filter({ hasText: "brief.md" }).hover();
  await preview.getByRole("button", { name: "Close", exact: true }).last().click();
  await heading.waitFor({ state: "hidden" });
  await settled();
  check("Pointer close also hands focus to a visible control", await ctx.page.evaluate(() => document.activeElement !== document.body && document.activeElement.checkVisibility() && !document.activeElement.closest('[data-pane-hidden]')));
  check("The original draft is unchanged", await editor.textContent() === "Unsent pane-dismissal draft");
  check("The document bytes are unchanged", fs.readFileSync(`${box.projectA}/brief.md`, "utf8") === "# Local brief\nNo operator data.\n");
  check("Navigation does not send a message", model.requests.length === 1);
  check("No renderer errors", ctx.errors.length === 0);
  await ctx.page.screenshot({ path: `${box.root}/pane-dismissal-keyboard.png` });
  const report = { root: box.root, checks, states, modelRequests: model.requests.length, rendererErrors: ctx.errors };
  fs.writeFileSync(`${box.root}/pane-dismissal-keyboard.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  await snapshot("failure");
  fs.writeFileSync(`${box.root}/failure.json`, JSON.stringify({ checks, states, errors: ctx.errors }, null, 2));
  await ctx.page.screenshot({ path: `${box.root}/failure.png` }).catch(() => undefined);
  process.stderr.write(`${box.root}\n${error.stack}\n`);
  process.exitCode = 1;
} finally {
  await ctx.app.close();
  await model.close();
  killLeftovers(box);
}
