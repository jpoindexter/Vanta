import assert from "node:assert/strict";
import { scanAccessibility } from "./desktop-accessibility-proof.mjs";

/** Real packaged geometry and keyboard proof; external model is a local fixture. */
export async function libreChatLayoutProof(ctx) {
  const { page, app, check, fixture, capture } = ctx;
  const window = await app.browserWindow(page);
  const initial = await window.evaluate((win) => win.getContentSize());
  const composer = page.locator("#vanta-composer");
  const draft = await composer.inputValue();
  const before = fixture.requests.length;
  await check("LibreChat layout aligns transcript and composer with a compact growing input", async () => {
    for (const width of [1440, 1024]) {
      await window.evaluate((win, width) => win.setContentSize(width, 900), width);
      await composer.fill("A short unsent draft.");
      const form = await page.locator("form.composer").boundingBox();
      const transcript = await page.locator(".transcript-window").boundingBox();
      assert(Math.abs(form.x - transcript.x) <= 2, `left alignment drift at ${width}`);
      assert(Math.abs(form.width - transcript.width) <= 2, `column width drift at ${width}`);
      assert(form.height <= 124, `short composer takes ${form.height}px at ${width}`);
      assert.equal(await composer.evaluate((el) => getComputedStyle(el).resize), "none");
      const short = (await composer.boundingBox()).height;
      await composer.fill(Array.from({ length: 16 }, (_, index) => `Unsent line ${index + 1}`).join("\n"));
      const long = (await composer.boundingBox()).height;
      assert(long > short + 80 && long <= 240, "composer must grow, then scroll internally");
      await composer.fill("A short unsent draft.");
      assert.equal((await composer.boundingBox()).height, short, "composer must shrink when text is removed");
      assert(await page.getByRole("button", { name: "Send", exact: true }).isVisible());
      await scanAccessibility(page, `LibreChat spacing at ${width}`);
      await capture(`librechat-spacing-${width}`);
    }
  });
  await check("moving between history rows leaves only one preview and selecting a chat dismisses it", async () => {
    const rows = page.locator(".chat-nav-row");
    await rows.first().locator(".chat-nav-open").focus();
    await rows.first().getByRole("tooltip").waitFor();
    await rows.nth(1).locator(".chat-nav-open").hover();
    await rows.nth(1).getByRole("tooltip").waitFor();
    assert.equal(await page.locator('.chat-hover-preview:not([hidden])').count(), 1);
    await page.locator('.chat-nav-row[data-active="true"] .chat-nav-open').click();
    await page.locator('.chat-hover-preview:not([hidden])').waitFor({ state: "hidden" });
    assert.equal(await page.locator('.chat-hover-preview:not([hidden])').count(), 0);
    await composer.focus();
  });
  await composer.fill(draft);
  await window.evaluate((win, size) => win.setContentSize(...size), initial);
  assert.equal(fixture.requests.length, before, "layout checks must not submit a draft");
}
