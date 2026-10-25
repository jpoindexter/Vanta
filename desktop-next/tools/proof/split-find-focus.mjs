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
  await ctx.page.getByRole("menuitem", { name: /open in split/i }).focus();
  await ctx.page.keyboard.press("ArrowRight");
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
  await editors[0].click();
  await ctx.page.keyboard.press("Meta+f");
  await bar.locator("input").fill("Splitpane");
  await bar.locator('[aria-live="polite"]').waitFor();
  const nextOwner = await editors[1].evaluate(el => el.closest('[data-composer-owner]').dataset.composerOwner);
  await editors[1].hover();
  check("Hover alone does not move the search", await ctx.page.locator('[data-find-root]').getAttribute('data-composer-surface-id') !== nextOwner);
  await editors[1].click();
  await state("switch-while-open");
  check("Switching panes keeps Find open", await bar.isVisible());
  check("Switching panes keeps the query", await bar.locator("input").inputValue() === "Splitpane");
  await ctx.page.waitForFunction(owner => document.querySelector('[data-find-root]')?.dataset.composerSurfaceId === owner, nextOwner, { timeout: 2000 });
  check("Open Find follows the newly focused chat", true);
  await state("retargeted");
  check("Old chat highlights are cleared", await editors[0].evaluate(el => !document.querySelector(`[data-composer-surface-id="${el.closest('[data-composer-owner]').dataset.composerOwner}"] mark.find-hit`)));
  await ctx.page.keyboard.press("Meta+f");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[role="search"] input') && document.activeElement.selectionEnd === 9);
  check("Repeated Cmd+F selects the retained query in the new pane", true);
  await ctx.page.keyboard.press("Escape");
  await bar.waitFor({ state: "hidden" });
  check("Escape restores the new pane draft, not the old pane", await editors[1].evaluate(el => el === document.activeElement));
  await ctx.page.keyboard.type(" continued");
  check("Typing continues only the new draft", await editors[1].textContent() === "Unsent Alpha draft continued" && await editors[0].textContent() === "Unsent Bravo draft");
  await ctx.page.keyboard.press("Meta+f");
  await bar.locator("input").fill("Splitpane");
  const firstOwner = await editors[0].evaluate(el => el.closest('[data-composer-owner]').dataset.composerOwner);
  await ctx.page.locator(`[data-chat-surface][data-composer-surface-id="${firstOwner}"]`).click({ position: { x: 30, y: 160 } });
  await ctx.page.waitForFunction(owner => document.querySelector('[data-find-root]')?.dataset.composerSurfaceId === owner, firstOwner, { timeout: 2000 });
  check("A transcript click also moves the open search", true);
  await bar.locator("input").click();
  await ctx.page.keyboard.press("Escape");
  check("Transcript navigation does not restore the old pane's editor", !await editors[1].evaluate(el => el === document.activeElement));
  await editors[1].click();
  await ctx.page.keyboard.press("Meta+f");
  await bar.locator("input").fill("Splitpane");
  await ctx.page.locator('[data-tour="sidebar-nav-new-session"]').click({ button: "right" });
  await ctx.page.getByRole("menu").waitFor();
  await ctx.page.keyboard.press("Escape");
  await state("escape-over-menu");
  check("First Escape leaves Find and its query intact", await bar.isVisible() && await bar.locator("input").inputValue() === "Splitpane");
  await ctx.page.getByRole("menu").waitFor({ state: "hidden" });
  check("First Escape closes only the navigation menu", true);
  await bar.locator("input").fill("Splitpane Alpha");
  await ctx.page.waitForFunction(() => document.querySelector('[data-find-root] mark.find-hit')?.textContent === "Splitpane Alpha", null, { timeout: 2000 });
  check("Typing after a sidebar menu keeps the captured chat", await ctx.page.locator('[data-find-root]').getAttribute('data-composer-surface-id') === nextOwner);
  await ctx.page.keyboard.press("Escape");
  await bar.waitFor({ state: "hidden" });
  check("Second Escape closes Find without submitting a draft", model.requests.length === 2 && await editors[1].textContent() === "Unsent Alpha draft continued");
  await editors[1].click();
  await ctx.page.keyboard.press("Meta+f");
  await bar.locator("input").fill("Splitpane");
  await ctx.page.keyboard.press("Meta+k");
  await ctx.page.getByRole("dialog").waitFor();
  await ctx.page.keyboard.press("Escape");
  await ctx.page.getByRole("dialog").waitFor({ state: "hidden" });
  check("Palette Escape leaves Find and its query intact", await bar.isVisible() && await bar.locator("input").inputValue() === "Splitpane");
  await ctx.page.keyboard.press("Escape");
  await bar.waitFor({ state: "hidden" });
  check("A subsequent Escape closes Find, not the chat", await editors[1].textContent() === "Unsent Alpha draft continued");
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
