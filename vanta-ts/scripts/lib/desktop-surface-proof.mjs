import assert from "node:assert/strict";
import { scanAccessibility } from "./desktop-accessibility-proof.mjs";

export async function desktopSurfaceProof({ page, app, api, fixture, check, capture }) {
  await check("Mini menu does not shadow the existing access-mode shortcut", async () => {
    const shortcut = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items
      .find((item) => item.label === "Vanta").submenu.items.find((item) => item.label === "Mini Vanta").accelerator);
    assert.notEqual(shortcut, "CmdOrCtrl+Shift+M");
  });
  const window = await app.browserWindow(page);
  const initial = await window.evaluate((win) => ({ id: win.id, bounds: win.getBounds() }));
  const session = (await api("/api/status")).sessionId;
  const requests = fixture.requests.length;
  const draft = "Keep my unfinished instruction between mini and full.";
  await check("Mini Vanta keeps live progress, draft, Stop and the same session without reloading", async () => {
    await page.locator("#vanta-composer").fill(draft);
    await page.evaluate(() => { window.vantaSurfaceProofMarker = "same-renderer"; });
    await page.getByRole("button", { name: "Mini Vanta", exact: true }).click();
    await page.locator('.chat-first-shell[data-surface="mini"]').waitFor();
    await page.getByRole("button", { name: "Stop task", exact: true }).waitFor();
    await page.locator(".approval-mode").waitFor({ state: "visible" });
    assert.equal(await page.locator("#vanta-composer").inputValue(), draft);
    assert.equal(await page.evaluate(() => window.vantaSurfaceProofMarker), "same-renderer");
    assert.equal((await api("/api/status")).sessionId, session);
    assert.equal(await window.evaluate((win) => win.id), initial.id);
    assert.equal(fixture.requests.length, requests);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await scanAccessibility(page, "Mini Vanta while working"); await capture("ambient-mini-working");
  });
  await check("optional avatar has only bounded status and opens the same mini workspace", async () => {
    const opened = app.waitForEvent("window");
    await app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu().items.find((item) => item.label === "Vanta");
      menu.submenu.items.find((item) => item.label === "Show Vanta avatar").click();
    });
    const avatar = await opened;
    await avatar.getByRole("button", { name: "Open Mini Vanta", exact: true }).waitFor();
    await avatar.getByRole("status").filter({ hasText: "Working" }).waitFor();
    assert.equal(await avatar.evaluate(() => typeof window.vantaDesktop), "undefined");
    await avatar.getByRole("button", { name: "Open Mini Vanta", exact: true }).click();
    assert.equal((await api("/api/status")).sessionId, session);
    assert.equal(await page.locator("#vanta-composer").inputValue(), draft);
    await scanAccessibility(avatar, "Optional Vanta avatar");
    await avatar.getByRole("button", { name: "Hide Vanta avatar", exact: true }).click();
    assert.equal(await (await app.browserWindow(avatar)).evaluate((win) => win.isVisible()), false);
    assert.equal(fixture.requests.length, requests);
  });
  await check("full workspace restores panels and geometry without dropping the active turn", async () => {
    await page.getByRole("button", { name: "Expand Vanta", exact: true }).click();
    await page.locator('.chat-first-shell[data-surface="full"][data-sidebar="true"]').waitFor();
    assert.equal(await page.locator("#vanta-composer").inputValue(), draft);
    await page.getByRole("button", { name: "Stop task", exact: true }).waitFor();
    assert.deepEqual(await window.evaluate((win) => win.getBounds()), initial.bounds);
    assert.equal((await api("/api/status")).sessionId, session);
    await capture("ambient-full-restored");
  });
}
