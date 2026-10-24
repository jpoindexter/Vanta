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

async function state(name) {
  states.push({ name, ...await ctx.page.evaluate(() => ({
    focus: document.activeElement.getAttribute("aria-label") || document.activeElement.getAttribute("role"),
    text: document.activeElement.textContent,
    selected: document.querySelector('[cmdk-item][data-selected="true"]')?.textContent,
    drafts: [...document.querySelectorAll('[data-vp="composer-input"]')].map(el => el.textContent),
  })) });
}

try {
  await waitForShell(ctx.page);
  for (const name of ["Alpha", "Bravo"]) {
    await newChat(ctx.page);
    await sendText(ctx.page, `Navigation ${name}`);
    check(`${name} local reply arrives`, await waitFinished(ctx.page));
    await ctx.page.locator('[data-vp="composer-input"]').first().click();
    await ctx.page.keyboard.insertText(`Unsent ${name} draft`);
  }
  for (const name of ["Alpha", "Bravo"]) {
    await ctx.page.keyboard.press("Meta+k");
    await ctx.page.getByRole("combobox").fill(`Navigation ${name}`);
    const option = ctx.page.getByRole("option", { name: new RegExp(`Navigation ${name}`) });
    await option.waitFor({ state: "visible" });
    check(`${name} filtered result is selected without an arrow`, await option.getAttribute("aria-selected") === "true");
    await state(`selected-${name}`);
    await ctx.page.keyboard.press("Enter");
    await ctx.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await ctx.page.waitForFunction(name => document.activeElement.matches('[data-vp="composer-input"]') && document.activeElement.textContent === `Unsent ${name} draft`, name);
    check(`${name} Enter opens the intended chat with its own draft`, true);
    await state(`opened-${name}`);
  }
  await ctx.page.keyboard.press("Meta+k");
  await ctx.page.getByRole("combobox").fill("No chat matches this exact proof query");
  await ctx.page.getByRole("option").waitFor({ state: "hidden" });
  await ctx.page.keyboard.press("Enter");
  check("An empty result cannot activate a stale chat", await ctx.page.getByRole("dialog").isVisible());
  await ctx.page.keyboard.press("Escape");
  await ctx.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  check("Empty-search Escape restores the last draft", await ctx.page.locator('[data-vp="composer-input"]:visible').textContent() === "Unsent Bravo draft");
  check("Switching never submits or retries", model.requests.length === 2);
  check("No renderer errors", ctx.errors.length === 0);
  await ctx.page.screenshot({ path: `${box.root}/palette-selection.png` });
  const report = { root: box.root, checks, states, modelRequests: model.requests.length, rendererErrors: ctx.errors };
  fs.writeFileSync(`${box.root}/palette-selection.json`, JSON.stringify(report, null, 2));
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
