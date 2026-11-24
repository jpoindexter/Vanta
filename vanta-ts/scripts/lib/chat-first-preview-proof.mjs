import assert from "node:assert/strict";
import { scanAccessibility } from "./desktop-accessibility-proof.mjs";

export async function chatPreviewProof(ctx) {
  const page = ctx.getPage();
  const row = page.locator('.chat-nav-row[data-active="true"]');
  const preview = row.getByRole("tooltip");
  await ctx.check("sidebar preview accepts pointer entry and Escape without moving focus", async () => {
    await page.mouse.move(800, 50);
    await page.locator("#vanta-composer").focus();
    await row.locator(".chat-nav-open").hover();
    await preview.waitFor();
    assert.notEqual(await preview.evaluate((node) => getComputedStyle(node).pointerEvents), "none");
    const box = await preview.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    assert(await preview.isVisible());
    assert(await preview.evaluate((node) => node.matches(":hover")), "pointer did not enter preview");
    await page.keyboard.press("Escape");
    await preview.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.activeElement?.id), "vanta-composer");
  });
  await ctx.check("focused preview reports recorded context and remains dismissed until re-entry", async () => {
    await page.mouse.move(800, 50);
    const opener = row.locator(".chat-nav-open");
    await opener.focus(); await preview.waitFor();
    assert.match(await preview.innerText(), /Project not recorded/);
    assert.match(await preview.innerText(), /Saved chat/);
    await page.keyboard.press("Escape");
    await preview.waitFor({ state: "hidden" });
    assert(await opener.evaluate((node) => node === document.activeElement));
    await page.keyboard.press("ArrowRight");
    assert.equal(await preview.isVisible(), false);
  });
  await ctx.check("preview follows resized sidebar and explicit actions expose details at narrow width", async () => {
    const resize = page.getByRole("separator", { name: "Resize sidebar" });
    const original = await resize.getAttribute("aria-valuenow");
    await resize.focus(); await page.keyboard.press("End");
    await row.locator(".chat-nav-open").focus(); await preview.waitFor();
    const card = await preview.boundingBox(), anchor = await row.boundingBox();
    assert(Math.abs(card.x - anchor.x - anchor.width) < 2, "preview does not follow its row");
    assert(card.y >= 0 && card.y + card.height <= await page.evaluate(() => innerHeight));
    await ctx.capture("06-preview-context");
    await page.keyboard.press("Escape");
    const window = await ctx.getApp().browserWindow(page);
    const size = await window.evaluate((win) => win.getContentSize());
    await window.evaluate((win) => win.setContentSize(760, 900));
    await row.getByRole("button", { name: /^Actions for/ }).click();
    const actions = row.getByRole("group", { name: /^Manage/ });
    await actions.getByText("Project not recorded", { exact: true }).waitFor();
    await actions.getByText(/^Saved chat · \d+ turns$/).waitFor();
    assert.equal(await row.locator(".chat-row-action").evaluate((node) => getComputedStyle(node).opacity), "1");
    await scanAccessibility(page, "Explicit chat details at narrow width");
    await ctx.capture("06-preview-touch-details");
    await page.keyboard.press("Escape");
    await window.evaluate((win, size) => win.setContentSize(...size), size);
    await resize.focus(); await page.keyboard.press("Home");
    while (Number(await resize.getAttribute("aria-valuenow")) < Number(original)) await page.keyboard.press("ArrowRight");
    await page.locator("#vanta-composer").focus();
  });
}
