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
const bar = ctx.page.getByRole("search");

async function snapshot(name) {
  states.push({ name, ...await ctx.page.evaluate(() => ({
    url: location.href,
    focus: document.activeElement.outerHTML.slice(0, 400),
    roots: [...document.querySelectorAll('[data-find-root]')].map(el => ({ owner: el.dataset.composerSurfaceId, visible: el.checkVisibility(), marks: [...el.querySelectorAll('mark.find-hit')].map(mark => mark.textContent) })),
    drafts: [...document.querySelectorAll('[data-vp="composer-input"]')].map(el => ({ visible: el.checkVisibility(), text: el.textContent }))
  })) });
}

try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  for (const name of ["Bravo", "Alpha"]) {
    if (name === "Alpha") {
      await ctx.page.keyboard.press("Meta+t");
      await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-vp="composer-input"]')].some(el => el.checkVisibility() && !el.textContent));
    }
    await editor.click();
    await ctx.page.keyboard.insertText(`Tabnav ${name}`);
    await ctx.page.keyboard.press("Enter");
    await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-role="assistant"]')].some(el => el.checkVisibility() && el.textContent.includes("Scripted turn finished.")));
    await editor.click();
    await ctx.page.keyboard.insertText(`Unsent ${name} draft`);
  }
  await ctx.page.keyboard.press("Meta+f");
  await bar.locator("input").fill("Tabnav");
  await ctx.page.waitForFunction(() => document.querySelector('[data-find-root] mark.find-hit'));
  await snapshot("before-cycle");
  await ctx.page.keyboard.press("Control+Shift+Tab");
  await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-vp="composer-input"]')].some(el => el.checkVisibility() && el.textContent === "Unsent Bravo draft"));
  check("Ctrl+Shift+Tab returns to the previous chat", true);
  await snapshot("after-cycle");
  check("Find stays open across in-pane tab switching", await bar.isVisible());
  check("The query is retained", await bar.locator("input").inputValue() === "Tabnav");
  await ctx.page.waitForFunction(() => {
    const root = document.querySelector('[data-find-root]');
    return root?.checkVisibility() && root.textContent.includes("Tabnav Bravo") && root.querySelector('mark.find-hit');
  }, null, { timeout: 3000 });
  check("Find highlights the now-visible chat, not the hidden tab", true);
  await ctx.page.keyboard.press("Escape");
  await bar.waitFor({ state: "hidden" });
  check("Escape never focuses the hidden draft", await ctx.page.evaluate(() => !document.activeElement.closest('[data-pane-hidden]')));
  check("Both drafts are preserved", await ctx.page.evaluate(() => [...document.querySelectorAll('[data-vp="composer-input"]')].map(el => el.textContent).includes("Unsent Alpha draft")));
  check("No draft was submitted", model.requests.length === 2);
  check("No renderer errors", ctx.errors.length === 0);
  await snapshot("dismissed");
  await ctx.page.screenshot({ path: `${box.root}/find-tab-keyboard.png` });
  const report = { root: box.root, checks, states, modelRequests: model.requests.length, rendererErrors: ctx.errors };
  fs.writeFileSync(`${box.root}/find-tab-keyboard.json`, JSON.stringify(report, null, 2));
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
