import assert from "node:assert/strict";
import { scanAccessibility } from "./desktop-accessibility-proof.mjs";

export async function openChatUtility(page, name) {
  const trigger = page.getByRole("button", { name: "Tools & activity", exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  await page.locator("#chat-feature-destinations").getByRole("button", { name, exact: true }).click();
}

/** Actual packaged entry path; the external provider is a local fixture. */
export async function chatFirstEntryProof({ page, check, fixture, capture }) {
  const tools = page.getByRole("button", { name: "Tools & activity", exact: true });
  const destinations = page.locator("#chat-feature-destinations");
  await check("conversation entry hides utilities without losing keyboard access", async () => {
    assert.equal(await destinations.isVisible(), false);
    await tools.focus(); await page.keyboard.press("Enter");
    assert.equal(await destinations.isVisible(), true);
    await page.keyboard.press("Tab"); await page.keyboard.press("Escape");
    assert.equal(await destinations.isVisible(), false);
    assert.equal(await tools.evaluate((button) => document.activeElement === button), true);
    await scanAccessibility(page, "Conversation-first entry");
    await capture("entry-conversation-first");
  });
  await check("starter prepares an editable draft without making a provider request", async () => {
    const before = fixture.requests.length;
    await page.getByRole("button", { name: "Research a decision", exact: true }).click();
    const composer = page.locator("#vanta-composer");
    assert.match(await composer.inputValue(), /^Help me research a decision\./);
    await page.waitForFunction(() => document.activeElement?.id === "vanta-composer");
    assert.equal(await page.getByRole("group", { name: "Ideas to start a chat" }).count(), 0);
    await composer.fill("My own unfinished request");
    assert.equal(fixture.requests.length, before);
  });
  await check("each utility returns to the same unsent chat and preserves its draft", async () => {
    const before = fixture.requests.length;
    for (const name of ["Today", "Outputs", "Library", "Schedules", "Skills & tools", "Connections"]) {
      await openChatUtility(page, name);
      assert.equal(await destinations.isVisible(), false);
      await page.locator(".chat-header-title").getByText(name, { exact: true }).waitFor();
      await page.getByRole("button", { name: "Back to chat", exact: true }).click();
      assert.equal(await page.locator("#vanta-composer").inputValue(), "My own unfinished request");
    }
    assert.equal(fixture.requests.length, before);
    await page.locator("#vanta-composer").fill("");
  });
}
