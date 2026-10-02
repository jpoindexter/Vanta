import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractFile } from "@electron/asar";
import { scanAccessibility } from "./desktop-accessibility-proof.mjs";

/** Real packaged UI, isolated state and local provider fixture; not live-account proof. */
export async function libreChatShellProof({ page, app, check, fixture, capture, candidateAsar }) {
  await check("LibreChat source attribution is included in the packaged renderer", async () => {
    const license = await readFile("desktop-app/src/librechat/LICENSE", "utf8");
    assert.equal(extractFile(candidateAsar, "desktop-app/dist/third-party/LibreChat-LICENSE.txt").toString(), license);
    await page.locator('[data-interface-source="librechat"]').waitFor();
    assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
  });
  await check("collapsed rail keeps navigation, new chat and the same unsent draft", async () => {
    const before = fixture.requests.length;
    const composer = page.locator("#vanta-composer");
    await composer.fill("Keep this unsent draft across the LibreChat-derived shell.");
    await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
    const rail = page.getByRole("navigation", { name: "Workspace navigation", exact: true });
    await rail.getByRole("button", { name: "New chat", exact: true }).waitFor();
    for (const [action, heading] of [["Connections", "Connections"], ["Activity", "Today"]]) {
      const button = rail.getByRole("button", { name: action, exact: true });
      await button.focus(); await page.keyboard.press("Enter");
      await page.locator(".chat-header-title").getByText(heading, { exact: true }).waitFor();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      await rail.getByRole("button", { name: "Chats", exact: true }).click();
      assert.equal(await composer.inputValue(), "Keep this unsent draft across the LibreChat-derived shell.");
    }
    await scanAccessibility(page, "Collapsed LibreChat-derived rail");
    await capture("librechat-collapsed-draft");
    await rail.getByRole("button", { name: "Show sidebar", exact: true }).click();
    assert.equal(fixture.requests.length, before);
    await composer.fill("");
  });
  await check("collapsed history and document inspector share one usable workspace", async () => {
    const window = await app.browserWindow(page);
    const size = await window.evaluate((win) => win.getContentSize());
    await window.evaluate((win) => win.setContentSize(1440, 900));
    await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
    await page.getByRole("button", { name: "Toggle context", exact: true }).click();
    const inspector = page.getByRole("complementary", { name: "Context inspector" });
    await inspector.waitFor();
    const rail = await page.getByRole("navigation", { name: "Workspace navigation", exact: true }).boundingBox();
    const chat = await page.locator("main.chat-main").boundingBox();
    const context = await inspector.boundingBox();
    assert(rail && chat && context, "a workspace pane disappeared");
    assert(rail.x + rail.width <= chat.x, "rail overlaps conversation");
    assert(context.x >= chat.x + chat.width - 1, "document inspector is not beside the chat");
    assert(context.y < 60 && context.x + context.width <= 1440, "inspector escaped the window");
    await capture("librechat-collapsed-inspector");
    await page.keyboard.press("Escape");
    await page.getByRole("navigation", { name: "Workspace navigation", exact: true })
      .getByRole("button", { name: "Show sidebar", exact: true }).click();
    await window.evaluate((win, dimensions) => win.setContentSize(...dimensions), size);
  });
}
