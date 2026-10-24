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
const query = bar.locator("input");
const counter = bar.locator('[aria-live="polite"]');
const draft = "Unsent find navigation draft";

async function state(name) {
  states.push({ name, ...await ctx.page.evaluate(() => ({
    focus: document.activeElement.getAttribute("aria-label") || document.activeElement.tagName,
    focusedDraft: document.activeElement.matches('[data-vp="composer-input"]') ? document.activeElement.textContent : null,
    route: location.hash,
    highlights: [...document.querySelectorAll("mark")].map(el => ({ text: el.textContent, visible: el.checkVisibility(), parent: el.parentElement.outerHTML.slice(0, 400) })),
  })) });
}

try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  await sendText(ctx.page, "Searchable amber, amber, amber.");
  check("Local reply arrives", await waitFinished(ctx.page));
  await composer.click();
  await ctx.page.keyboard.insertText(draft);
  const route = await ctx.page.evaluate(() => location.hash);
  await ctx.page.keyboard.press("Meta+f");
  await query.waitFor({ state: "visible" });
  await ctx.page.waitForFunction(() => document.activeElement.matches('[role="search"] input'));
  check("Cmd+F focuses the find field", true);
  await ctx.page.keyboard.type("amber");
  await counter.getByText("1/3", { exact: true }).waitFor();
  const count = (await counter.textContent()).split("/")[1];
  check("Only the three visible transcript occurrences match", count === "3");
  check("Every match is visible, not a hidden header duplicate", await ctx.page.locator("mark.find-hit").evaluateAll(els => els.length === 3 && els.every(el => el.checkVisibility({ visibilityProperty: true }))));
  await ctx.page.keyboard.press("Enter");
  await counter.getByText(`2/${count}`, { exact: true }).waitFor();
  check("Enter moves to the next match", true);
  await ctx.page.keyboard.press("Shift+Enter");
  await counter.getByText(`1/${count}`, { exact: true }).waitFor();
  check("Shift+Enter moves to the previous match", true);
  await ctx.page.keyboard.press("Meta+g");
  await counter.getByText(`2/${count}`, { exact: true }).waitFor();
  check("Cmd+G advances without toggling another surface", true);
  await state("before-close");
  await ctx.page.keyboard.press("Escape");
  await bar.waitFor({ state: "hidden" });
  await state("after-close");
  check("Escape returns focus to the unsent draft", await composer.evaluate(el => el === document.activeElement));
  await ctx.page.keyboard.type(" continued");
  check("Typing continues the same draft", await composer.textContent() === `${draft} continued`);
  check("Find does not change the route", await ctx.page.evaluate(() => location.hash) === route);
  check("Find never submits or retries", model.requests.length === 1);
  await ctx.page.keyboard.press("Meta+f");
  await query.fill("amber");
  await ctx.page.keyboard.press("Meta+f");
  check("Repeated Cmd+F keeps and selects the query", await query.evaluate(el => el.value === "amber" && el.selectionStart === 0 && el.selectionEnd === 5));
  await query.fill("No occurrence of this query");
  await counter.getByText("0/0", { exact: true }).waitFor();
  await ctx.page.keyboard.press("Enter");
  check("No-match Enter stays in Find", await query.evaluate(el => el === document.activeElement));
  await bar.getByRole("button", { name: "Close", exact: true }).click();
  check("Pointer Close returns focus to the original draft", await composer.evaluate(el => el === document.activeElement));
  await ctx.page.keyboard.press("Meta+f");
  await query.waitFor({ state: "visible" });
  const sidebarSearch = ctx.page.locator('[data-testid="sidebar-search"] input');
  await sidebarSearch.click();
  await ctx.page.keyboard.press("Escape");
  await bar.waitFor({ state: "hidden" });
  check("Escape does not steal focus from another selected control", await sidebarSearch.evaluate(el => el === document.activeElement));
  check("Every dismissal preserves the draft", await composer.textContent() === `${draft} continued`);
  check("All navigation still uses exactly one model request", model.requests.length === 1);
  check("No renderer errors", ctx.errors.length === 0);
  await ctx.page.screenshot({ path: `${box.root}/find-navigation.png` });
  const report = { root: box.root, checks, states, modelRequests: model.requests.length, rendererErrors: ctx.errors };
  fs.writeFileSync(`${box.root}/find-navigation.json`, JSON.stringify(report, null, 2));
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
