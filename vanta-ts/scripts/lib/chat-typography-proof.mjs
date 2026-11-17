import assert from "node:assert/strict";
import { scanAccessibility } from "./desktop-accessibility-proof.mjs";

/** Actual Markdown and layout; only the external provider response is synthetic. */
export async function chatTypographyProof(ctx) {
  const { page, app, check, send, idle, capture } = ctx;
  await page.locator("button.chat-new").click();
  await send("Typography proof\n\nA short paragraph.\n\n- First item\n- Second item\n- Third item\n\nFinal paragraph.\n\n```text\n  indented line\n    nested line\n```");
  await page.getByText("Final paragraph.", { exact: true }).last().waitFor();
  await idle();
  const win = await app.browserWindow(page);
  const initial = await win.evaluate((window) => window.getContentSize());
  await check("unified window bar preserves chat navigation and keyboard options", async () => {
    assert.equal(await page.locator(".chat-titlebar").count(), 1);
    const options = page.locator(".chat-window-options > summary");
    await options.focus(); await page.keyboard.press("Enter");
    await page.getByRole("link", { name: "Classic view" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".chat-window-options").getAttribute("open"), null);
    assert.equal(await options.evaluate((el) => document.activeElement === el), true);
    await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
    await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
  });
  await check("Markdown spacing follows block rhythm without phantom newline gaps", async () => {
    for (const width of [1440, 1024, 760]) {
      await win.evaluate((window, width) => window.setContentSize(width, 900), width);
      if (width <= 760) await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
      const result = await page.locator(".message.assistant .message-markdown").last().evaluate((el) => {
        const items = [...el.querySelectorAll("li")].map((item) => item.getBoundingClientRect());
        const blocks = [...el.children].map((item) => item.getBoundingClientRect());
        const pre = el.querySelector("pre code");
        return { whitespace: getComputedStyle(el).whiteSpace,
          listGaps: items.slice(1).map((item, i) => item.top - items[i].bottom),
          blockGaps: blocks.slice(1).map((item, i) => item.top - blocks[i].bottom),
          codeWhitespace: getComputedStyle(pre).whiteSpace, code: pre.textContent,
          overflow: document.documentElement.scrollWidth > window.innerWidth };
      });
      assert.equal(result.whitespace, "normal");
      assert(result.listGaps.every((gap) => gap >= 0 && gap <= 8), `list gaps at ${width}: ${result.listGaps}`);
      assert(result.blockGaps.every((gap) => gap >= 0 && gap <= 16), `block gaps at ${width}: ${result.blockGaps}`);
      assert.equal(result.codeWhitespace, "pre");
      assert.equal(result.code, "  indented line\n    nested line");
      assert.equal(result.overflow, false);
      const geometry = await page.evaluate(() => {
        const bar = document.querySelector(".chat-titlebar").getBoundingClientRect();
        const main = document.querySelector(".chat-main-column").getBoundingClientRect();
        return { height: bar.height, top: main.top, width: bar.width };
      });
      assert.equal(geometry.height, 44);
      assert.equal(geometry.top, 44);
      assert.equal(geometry.width, width);
      assert.equal(await page.locator('.lc-run-activity [data-status="active"]').count(), 0);
      await scanAccessibility(page, `Markdown rhythm at ${width}`);
      await capture(`chat-typography-${width}`);
    }
  });
  await win.evaluate((window, size) => window.setContentSize(...size), initial);
  await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
}
