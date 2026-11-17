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
async function snapshot() {
  return ctx.page.evaluate(() => ({
    focus: document.activeElement.outerHTML.slice(0, 600),
    roots: [...document.querySelectorAll('[data-find-root]')].map(el => ({ html: el.outerHTML.slice(0, 300), text: el.textContent.slice(0, 500), marks: [...el.querySelectorAll('mark.find-hit')].map(mark => mark.textContent) })),
    body: document.body.innerText.slice(-3000),
    drafts: [...document.querySelectorAll('[data-vp="composer-input"]')].map(el => ({ visible: el.checkVisibility(), text: el.textContent }))
  }));
}
try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  await editor.click();
  await ctx.page.keyboard.insertText("Chat-only navigation test");
  await ctx.page.keyboard.press("Enter");
  await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-role="assistant"]')].some(el => el.checkVisibility() && el.textContent.includes("Scripted turn finished.")));
  await editor.click();
  await ctx.page.keyboard.insertText("Unsent preview-navigation draft");
  await ctx.page.getByTestId("titlebar-files").click();
  await ctx.page.locator('[title$="brief.md"]:visible').last().dblclick();
  const heading = ctx.page.getByRole("heading", { name: "Local brief", exact: true });
  await heading.waitFor();
  await heading.click();
  check("The real local document is visible and clicked", true);
  await ctx.page.keyboard.press("Meta+f");
  await bar.locator("input").fill("Local brief");
  await ctx.page.waitForFunction(() => {
    const root = document.querySelector('[data-find-root]');
    return root?.textContent.includes("Local brief") && root.querySelector('mark.find-hit')?.textContent === "Local brief";
  }, null, { timeout: 3000 });
  check("Find searches the selected document, not the chat", true);
  states.push({ name: "document", ...await snapshot() });
  await editor.click();
  await ctx.page.waitForFunction(() => document.querySelector('[data-find-root]')?.hasAttribute('data-chat-surface'), null, { timeout: 3000 });
  check("Clicking the chat carries the open search back to the chat", await bar.isVisible() && await bar.locator("input").inputValue() === "Local brief");
  check("Leaving the document clears its old highlights", await heading.locator("mark").count() === 0);
  await heading.click();
  await ctx.page.waitForFunction(() => document.querySelector('[data-find-root][data-preview-markdown] mark.find-hit')?.textContent === "Local brief", null, { timeout: 3000 });
  check("Clicking the document carries the still-open query back", await bar.isVisible());
  await editor.hover();
  check("Hovering the chat does not move document search", await ctx.page.locator('[data-find-root]').getAttribute('data-preview-markdown') === "");
  await ctx.page.keyboard.press("Meta+f");
  await ctx.page.waitForFunction(() => document.activeElement.matches('[role="search"] input') && document.activeElement.selectionEnd === 11);
  await ctx.page.keyboard.type("No operator data.");
  await ctx.page.waitForFunction(() => document.querySelector('[data-find-root][data-preview-markdown] mark.find-hit')?.textContent === "No operator data.", null, { timeout: 3000 });
  check("Repeated Cmd+F edits the query within the document scope", true);
  states.push({ name: "document-return", ...await snapshot() });
  await ctx.page.screenshot({ path: `${box.root}/find-preview-highlight.png` });
  await ctx.page.keyboard.press("Escape");
  await bar.waitFor({ state: "hidden" });
  check("The unsent chat draft is unchanged", await editor.textContent() === "Unsent preview-navigation draft");
  check("Searching never writes to the document", fs.readFileSync(`${box.projectA}/brief.md`, "utf8") === "# Local brief\nNo operator data.\n");
  check("No accidental send", model.requests.length === 1);
  check("No renderer errors", ctx.errors.length === 0);
  const report = { root: box.root, checks, states, state: await snapshot(), modelRequests: model.requests.length, rendererErrors: ctx.errors };
  await ctx.page.screenshot({ path: `${box.root}/find-preview-keyboard.png` });
  fs.writeFileSync(`${box.root}/find-preview-keyboard.json`, JSON.stringify(report, null, 2));
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
