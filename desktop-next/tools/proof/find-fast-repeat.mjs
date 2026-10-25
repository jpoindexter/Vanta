import assert from "node:assert/strict";
import fs from "node:fs";
import { makeSandbox, launchApp, killLeftovers } from "../done-path/harness.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { waitForShell, newChat } from "../done-path/lib.mjs";

const box = await makeSandbox();
const model = await startScriptedModel();
const ctx = await launchApp({ box, project: box.projectA, modelUrl: model.url });
ctx.page.setDefaultTimeout(5000);
const checks = [];
const states = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const editor = ctx.page.locator('[data-vp="composer-input"]:visible');
const query = ctx.page.getByRole("search").locator("input");
try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  await editor.click();
  await ctx.page.keyboard.insertText("Rapid Find navigation");
  await ctx.page.keyboard.press("Enter");
  await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-role="assistant"]')].some(el => el.checkVisibility() && el.textContent.includes("Scripted turn finished.")));
  await editor.click();
  await ctx.page.keyboard.insertText("Unsent rapid-Find draft");
  await ctx.page.keyboard.press("Meta+f");
  await query.fill("old query");
  await new Promise(resolve => setTimeout(resolve, 250));
  for (const text of ["Scripted turn finished.", "Rapid Find navigation", "No matches at all"]) {
    await ctx.page.keyboard.press("Meta+f");
    await ctx.page.keyboard.type(text);
    const value = await query.inputValue();
    states.push({ text, value });
    check(`Immediate typing retains the whole query: ${text}`, value === text);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await ctx.page.keyboard.press("Escape");
  check("Escape returns typing focus", await editor.evaluate(el => el === document.activeElement));
  check("Draft unchanged", await editor.textContent() === "Unsent rapid-Find draft");
  check("No extra send", model.requests.length === 1);
  check("No renderer errors", ctx.errors.length === 0);
  process.stdout.write(`${JSON.stringify({ root: box.root, checks, states, requests: model.requests.length, errors: ctx.errors })}\n`);
} catch (error) {
  process.stderr.write(`${box.root}\n${error.stack}\n`);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(`${box.root}/find-fast-repeat.json`, JSON.stringify({ checks, states, errors: ctx.errors }, null, 2));
  await ctx.page.screenshot({ path: `${box.root}/find-fast-repeat.png` }).catch(() => undefined);
  await ctx.app.close();
  await model.close();
  killLeftovers(box);
}
