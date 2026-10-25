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
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const editor = ctx.page.locator('[data-vp="composer-input"]:visible');
const search = ctx.page.locator('[data-testid="sidebar-search"] input');

async function snapshot() {
  return ctx.page.evaluate(() => ({
    focus: document.activeElement.outerHTML.slice(0, 500),
    body: document.body.innerText.slice(-2200),
    drafts: [...document.querySelectorAll('[data-vp="composer-input"]')].map(el => ({ visible: el.checkVisibility(), text: el.textContent }))
  }));
}

try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  await editor.click();
  await ctx.page.keyboard.insertText("Collapsed history chat");
  await ctx.page.keyboard.press("Enter");
  await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-role="assistant"]')].some(el => el.checkVisibility() && el.textContent.includes("Scripted turn finished.")));
  await editor.click();
  await ctx.page.keyboard.insertText("Unsent collapsed-sidebar draft");
  await ctx.page.keyboard.press("Meta+b");
  await search.waitFor({ state: "hidden" });
  check("Cmd+B hides history search", true);
  await ctx.page.keyboard.press("Meta+Shift+f");
  await search.waitFor();
  check("Cmd+Shift+F reveals the hidden sidebar", true);
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-testid="sidebar-search"] input'), null, { timeout: 3000 });
  check("Revealing the sidebar hands keyboard focus to search", true);
  await ctx.page.keyboard.type("Collapsed history");
  check("Typing remains in history search", await search.inputValue() === "Collapsed history");
  check("The unsent chat draft is unchanged", await editor.textContent() === "Unsent collapsed-sidebar draft");
  await ctx.page.getByTestId("sidebar-row").filter({ hasText: "Collapsed history chat" }).waitFor();
  await ctx.page.keyboard.press("ArrowDown");
  check("Arrow Down reaches a matching chat after reveal", await ctx.page.evaluate(() => document.activeElement.closest('[data-testid="sidebar-row"]')?.textContent.includes("Collapsed history chat")));
  await ctx.page.keyboard.press("Meta+b");
  await search.waitFor({ state: "hidden" });
  await ctx.page.keyboard.press("Meta+Shift+f");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-testid="sidebar-search"] input') && document.activeElement.selectionStart === 0 && document.activeElement.selectionEnd === 17, null, { timeout: 3000 });
  check("Search survives a second collapse with its query selected", true);
  await ctx.page.keyboard.press("Meta+l");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[data-vp="composer-input"]'));
  await ctx.page.keyboard.press("Meta+ArrowRight");
  await ctx.page.keyboard.type(" continued");
  check("Cmd+L returns to the original draft", await editor.textContent() === "Unsent collapsed-sidebar draft continued");
  for (const collapsed of [false, true]) {
    await ctx.page.getByRole("tablist").getByText("Bots", { exact: true }).click();
    await search.waitFor({ state: "hidden" });
    check(`The agent roster replaces chat history (collapsed=${collapsed})`, true);
    if (collapsed) await ctx.page.keyboard.press("Meta+b");
    await ctx.page.keyboard.press("Meta+Shift+f");
    await search.waitFor({ timeout: 3000 });
    check(`Chat search returns from the agent roster to history (collapsed=${collapsed})`, true);
    await ctx.page.waitForFunction(() => document.activeElement.matches('[data-testid="sidebar-search"] input'), null, { timeout: 3000 });
    check(`History search receives focus after leaving the roster (collapsed=${collapsed})`, true);
  }
  check("Navigation does not submit the draft", model.requests.length === 1);
  check("No renderer errors", ctx.errors.length === 0);
  const report = { root: box.root, checks, state: await snapshot(), modelRequests: model.requests.length, rendererErrors: ctx.errors };
  await ctx.page.screenshot({ path: `${box.root}/collapsed-search-keyboard.png` });
  fs.writeFileSync(`${box.root}/collapsed-search-keyboard.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  fs.writeFileSync(`${box.root}/failure.json`, JSON.stringify({ checks, state: await snapshot(), errors: ctx.errors }, null, 2));
  await ctx.page.screenshot({ path: `${box.root}/failure.png` }).catch(() => undefined);
  process.stderr.write(`${box.root}\n${error.stack}\n`);
  process.exitCode = 1;
} finally {
  await ctx.app.close();
  await model.close();
  killLeftovers(box);
}
