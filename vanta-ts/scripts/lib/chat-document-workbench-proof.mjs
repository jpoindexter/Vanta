import assert from "node:assert/strict";
import { scanAccessibility } from "./desktop-accessibility-proof.mjs";

export async function documentWorkbenchProof({ page, check, fixture, capture }) {
  const requests = fixture.requests.length;
  const draft = await page.locator("#vanta-composer").inputValue();
  await check("read a real project document beside the chat without sending or losing its draft", async () => {
    await page.getByRole("button", { name: "Toggle context", exact: true }).click();
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await page.getByRole("button", { name: "Read brief.md", exact: true }).first().click();
    await page.getByRole("heading", { name: "Local desktop proof", exact: true }).waitFor();
    assert.equal(await page.locator("#vanta-composer").inputValue(), draft);
    assert.equal(fixture.requests.length, requests);
    await scanAccessibility(page, "Document beside conversation");
    await capture("workbench-document-dark");
  });
  await check("document source toggle and tab closure preserve chat and permit reopening", async () => {
    await page.getByRole("button", { name: "View source", exact: true }).click();
    assert.match(await page.locator(".chat-document-body pre").innerText(), /^# Local desktop proof/);
    await page.getByRole("button", { name: "Read document", exact: true }).click();
    await page.getByRole("heading", { name: "Local desktop proof", exact: true }).waitFor();
    await page.getByRole("button", { name: "Close brief.md", exact: true }).click();
    await page.getByRole("button", { name: "Read brief.md", exact: true }).first().click();
    await page.getByRole("heading", { name: "Local desktop proof", exact: true }).waitFor();
    assert.equal(await page.locator("#vanta-composer").inputValue(), draft);
  });
  await check("light document workbench remains readable", async () => {
    await page.locator(".chat-sidebar").getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByRole("button", { name: "Light", exact: true }).click();
    await page.keyboard.press("Escape");
    await scanAccessibility(page, "Light document workbench");
    await capture("workbench-document-light");
    await page.locator(".chat-sidebar").getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Close brief.md", exact: true }).click();
    await page.getByRole("button", { name: "Close context", exact: true }).click();
    assert.equal(fixture.requests.length, requests);
  });
}
