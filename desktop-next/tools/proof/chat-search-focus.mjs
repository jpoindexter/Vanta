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
const composer = ctx.page.locator('[data-vp="composer-input"]').first();
const search = ctx.page.locator('[data-testid="sidebar-search"] input');
const draft = "Unsent alpha draft";

async function state(name) {
  const row = await ctx.page.evaluate(() => ({
    focus: document.activeElement.getAttribute("aria-label"),
    search: document.querySelector('[data-testid="sidebar-search"] input')?.value,
    draft: document.querySelector('[data-vp="composer-input"]')?.textContent,
    route: location.hash,
  }));
  states.push({ name, ...row });
  return row;
}

try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  await sendText(ctx.page, "Navigation Alpha");
  check("Local reply arrives", await waitFinished(ctx.page));
  const route = await ctx.page.evaluate(() => location.hash);
  await composer.click();
  await ctx.page.keyboard.insertText(draft);
  await ctx.page.keyboard.press("Meta+k");
  await ctx.page.getByRole("combobox").waitFor({ state: "visible" });
  await ctx.page.keyboard.insertText("Navigation Alpha");
  await ctx.page.keyboard.press("Escape");
  await ctx.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  check("Cmd+K Escape preserves the chat and unsent draft", (await state("palette-escape")).route === route && await composer.textContent() === draft);
  for (const gesture of ["Enter", "Space", "pointer"]) {
    await search.click();
    await ctx.page.keyboard.insertText("Navigation");
    const clear = ctx.page.locator('[data-testid="sidebar-search"]').getByRole("button", { name: /clear/i });
    if (gesture === "pointer") await clear.click();
    else {
      await ctx.page.keyboard.press("Tab");
      check(`${gesture} reaches the clear button by Tab`, await clear.evaluate(el => el === document.activeElement));
      await ctx.page.keyboard.press(gesture);
    }
    await ctx.page.waitForFunction(() => document.querySelector('[data-testid="sidebar-search"] input')?.value === "");
    check(`${gesture} Clear returns focus to search`, await search.evaluate(el => el === document.activeElement));
    await ctx.page.keyboard.type("Other");
    const row = await state(`after-${gesture}`);
    check(`${gesture} subsequent typing stays in search`, row.search === "Other");
    check(`${gesture} never changes the chat draft or route`, row.draft === draft && row.route === route);
    await ctx.page.keyboard.press("Meta+a");
    await ctx.page.keyboard.press("Backspace");
  }
  check("Navigation does not submit or retry", model.requests.length === 1);
  check("No renderer errors", ctx.errors.length === 0);
  await ctx.page.screenshot({ path: `${box.root}/chat-search-focus.png` });
  const report = { root: box.root, checks, states, modelRequests: model.requests.length, rendererErrors: ctx.errors };
  fs.writeFileSync(`${box.root}/chat-search-focus.json`, JSON.stringify(report, null, 2));
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
