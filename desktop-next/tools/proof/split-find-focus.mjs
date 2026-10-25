import assert from "node:assert/strict";
import fs from "node:fs";
import { makeSandbox, launchApp, killLeftovers } from "../done-path/harness.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { waitForShell, newChat, sendText, waitFinished } from "../done-path/lib.mjs";

const box = await makeSandbox();
const model = await startScriptedModel();
const ctx = await launchApp({ box, project: box.projectA, modelUrl: model.url });
ctx.page.setDefaultTimeout(15_000);
const checks = [];
const states = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const composer = ctx.page.locator('[data-vp="composer-input"]:visible');
const bar = ctx.page.getByRole("search");

async function state(name) {
  states.push({ name, ...await ctx.page.evaluate(() => ({
    focus: document.activeElement.getAttribute("aria-label"),
    groups: [...document.querySelectorAll('[data-tree-group]')].map(el => ({ id: el.dataset.treeGroup, text: el.innerText.slice(0, 160) })),
    roots: [...document.querySelectorAll('[data-find-root]')].map(el => el.innerText.slice(0, 160)),
    drafts: [...document.querySelectorAll('[data-vp="composer-input"]')].map(el => el.textContent),
  })) });
}

try {
  await waitForShell(ctx.page);
  for (const name of ["Bravo"]) {
    await newChat(ctx.page);
    const before = await ctx.page.getByText("Scripted turn finished.", { exact: true }).count();
    await sendText(ctx.page, `Splitpane ${name}`);
    check(`${name} local reply arrives`, await waitFinished(ctx.page, { finishedBefore: before }));
    await composer.click();
    await ctx.page.keyboard.insertText(`Unsent ${name} draft`);
  }
  await ctx.page.locator('[data-tour="sidebar-nav-new-session"]').click({ button: "right" });
  await ctx.page.getByRole("menuitem", { name: /open in split/i }).hover();
  await ctx.page.getByRole("menuitem", { name: "Right", exact: true }).click();
  await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-chat-surface]')].filter(el => el.checkVisibility()).length === 2);
  const alpha = composer.last();
  await alpha.click();
  await ctx.page.keyboard.insertText("Splitpane Alpha");
  await ctx.page.keyboard.press("Enter");
  await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-role="assistant"]')].filter(el => el.checkVisibility() && el.textContent.includes("Scripted turn finished.")).length === 2);
  check("Alpha split receives its local reply", true);
  await alpha.click();
  await ctx.page.keyboard.insertText("Unsent Alpha draft");
  check("Two real chats are visible side by side", true);
  const editors = await composer.all();
  for (const editor of editors) {
    const draft = await editor.textContent();
    const name = draft.includes("Alpha") ? "Alpha" : "Bravo";
    const owner = await editor.evaluate(el => el.closest('[data-composer-owner]').dataset.composerOwner);
    await editor.click();
    await ctx.page.keyboard.press("Meta+f");
    const query = bar.locator("input");
    await query.waitFor();
    await query.fill(`Splitpane ${name}`);
    const counter = bar.locator('[aria-live="polite"]');
    await counter.waitFor();
    await state(`find-${name}`);
    check(`Find searches the focused ${name} chat`, /^1\/[1-9]\d*$/.test(await counter.textContent()) && await ctx.page.locator('[data-find-root]').getAttribute('data-composer-surface-id') === owner);
    await ctx.page.keyboard.press("Escape");
    await bar.waitFor({ state: "hidden" });
    check(`Escape returns to ${name}'s own draft`, await editor.evaluate(el => el === document.activeElement));
    check(`${name}'s unsent text is retained`, await editor.textContent() === draft);
  }
  check("Navigation never submits or retries", model.requests.length === 2);
  check("No renderer errors", ctx.errors.length === 0);
  await ctx.page.screenshot({ path: `${box.root}/split-find-focus.png` });
  const report = { root: box.root, checks, states, modelRequests: model.requests.length, rendererErrors: ctx.errors };
  fs.writeFileSync(`${box.root}/split-find-focus.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  fs.writeFileSync(`${box.root}/failure.json`, JSON.stringify({ checks, states, errors: ctx.errors }, null, 2));
  await ctx.page.screenshot({ path: `${box.root}/failure.png` }).catch(() => undefined);
  process.stderr.write(`${box.root}\n${error.stack}\n`);
  process.exitCode = 1;
} finally {
  await ctx.app.close();
  await model.close();
  killLeftovers(box);
}
