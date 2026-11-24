import assert from "node:assert/strict";
import fs from "node:fs";
import { makeSandbox, launchApp, killLeftovers } from "../done-path/harness.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { waitForShell, newChat } from "../done-path/lib.mjs";

const box = await makeSandbox();
const model = await startScriptedModel();
const ctx = await launchApp({ box, project: box.projectA, modelUrl: model.url });
const stops = [];
const settled = () => ctx.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  await waitForShell(ctx.page);
  await newChat(ctx.page);
  const editor = ctx.page.locator('[data-vp="composer-input"]:visible');
  await editor.click();
  await ctx.page.keyboard.insertText("Focus visibility navigation");
  await ctx.page.keyboard.press("Enter");
  await ctx.page.waitForFunction(() => [...document.querySelectorAll('[data-role="assistant"]')].some(el => el.checkVisibility() && el.textContent.includes("Scripted turn finished.")));
  await editor.click();
  await ctx.page.keyboard.insertText("Unsent focus visibility draft");
  await ctx.page.keyboard.press("Meta+l");
  await settled();
  for (let index = 0; index < 7; index++) {
    await ctx.page.keyboard.press("Shift+Tab");
    await settled();
    await new Promise(resolve => setTimeout(resolve, 200));
    const stop = await ctx.page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      const faded = [];
      for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) {
        if (Number(getComputedStyle(ancestor).opacity) < 0.1) faded.push(ancestor.outerHTML.slice(0, 250));
      }
      return { tag: el.tagName, label: el.getAttribute("aria-label"), text: el.textContent.slice(0, 100), visible: el !== document.body && el.checkVisibility({ visibilityProperty: true }), faded, focusVisible: el.matches(":focus-visible"), outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`, shadow: style.boxShadow, html: el.outerHTML.slice(0, 700) };
    });
    stops.push(stop);
    assert.ok(stop.visible && stop.faded.length === 0, `Backward stop ${index + 1} must be painted`);
    if (stop.tag === "BUTTON") assert.ok(stop.focusVisible && (!stop.outline.startsWith("none 0px") || /2px inset/.test(stop.shadow)), `Backward stop ${index + 1} must have a focus indicator`);
  }
  for (let index = 0; index < 7; index++) { await ctx.page.keyboard.press("Tab"); await settled(); }
  assert.ok(await editor.evaluate(el => el === document.activeElement), "Forward Tab returns to the composer");
  assert.equal(await editor.textContent(), "Unsent focus visibility draft");
  assert.equal(model.requests.length, 1);
  assert.deepEqual(ctx.errors, []);
  process.stdout.write(`${JSON.stringify({ root: box.root, stops, requests: model.requests.length, errors: ctx.errors })}\n`);
} catch (error) {
  await new Promise(resolve => setTimeout(resolve, 250));
  stops.push(await ctx.page.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    return { afterTransition: true, opacity: s.opacity, outline: s.outline, html: el.outerHTML.slice(0, 200), parent: el.parentElement.outerHTML.slice(0, 1600) };
  }));
  process.stderr.write(`${box.root}\n${error.stack}\n`);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(`${box.root}/focus-visible-navigation.json`, JSON.stringify({ stops, errors: ctx.errors }, null, 2));
  await ctx.page.screenshot({ path: `${box.root}/focus-visible-navigation.png` }).catch(() => undefined);
  await ctx.app.close();
  await model.close();
  killLeftovers(box);
}
