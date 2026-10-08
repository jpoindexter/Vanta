import assert from "node:assert/strict";
import { scanAccessibility } from "./desktop-accessibility-proof.mjs";

/** Synthetic provider prose; real renderer, links, preview API and project file. */
export async function documentLinksProof({ page, check, project, send, idle, api, capture }) {
  const draft = await page.locator("#vanta-composer").inputValue();
  const session = (await api("/api/status")).sessionId;
  await send(`Document link proof: [relative report](brief.md) [absolute report](${project}/brief.md) [file report](file://${project}/brief.md) [missing report](missing.md)`);
  await idle();
  await page.waitForFunction(() => !document.querySelector("#vanta-composer")?.disabled);
  await page.locator("#vanta-composer").fill(draft);
  const response = page.locator(".message.assistant").filter({ hasText: "Local provider reply: Document link proof:" }).last();
  for (const name of ["relative report", "absolute report", "file report"]) {
    await check(`${name} opens the real preview by ${name === "absolute report" ? "keyboard" : "pointer"}, never by file navigation`, async () => {
      const link = response.getByRole("link", { name, exact: true });
      assert.equal(await link.getAttribute("href"), "#");
      if (name === "absolute report") await link.press("Enter");
      else await link.click();
      await page.getByRole("heading", { name: "Local desktop proof", exact: true }).waitFor();
      assert.equal(await page.locator("#vanta-composer").inputValue(), draft);
      await page.getByRole("button", { name: "Close context", exact: true }).click();
      await page.getByRole("complementary", { name: "Context inspector", exact: true }).waitFor({ state: "hidden" });
    });
  }
  await check("a document result in Mini Vanta expands the same session and shows its content", async () => {
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    await page.getByRole("button", { name: "Mini Vanta", exact: true }).click();
    await page.locator('.chat-first-shell[data-surface="mini"]').waitFor();
    await response.getByRole("link", { name: "relative report", exact: true }).click();
    await page.locator('.chat-first-shell[data-surface="full"]').waitFor();
    await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, viewport);
    await page.getByRole("heading", { name: "Local desktop proof", exact: true }).waitFor();
    assert.equal((await api("/api/status")).sessionId, session);
    assert.equal(await page.locator("#vanta-composer").inputValue(), draft);
    await assertCopyHitTarget(response);
    await scanAccessibility(page, "Chat result opened from mini");
    await capture("document-link-from-mini");
    await page.getByRole("button", { name: "Close context", exact: true }).click();
  });
  await check("a missing document stays a recoverable preview error, not a dead chat link", async () => {
    await response.getByRole("link", { name: "missing report", exact: true }).click();
    await page.locator('.chat-document [role="alert"]').getByText(/cannot be previewed/).waitFor();
    assert.equal(await page.getByRole("button", { name: "Attach to chat", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Close missing.md", exact: true }).click();
    await page.getByRole("button", { name: "Close brief.md", exact: true }).click();
    await page.getByRole("button", { name: "Close context", exact: true }).click();
  });
}

async function assertCopyHitTarget(response) {
  const hits = await response.getByRole("button", { name: "Copy response", exact: true }).evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    return [2, bounds.width / 2, bounds.width - 2].flatMap((x) =>
      [2, bounds.height / 2, bounds.height - 2].map((y) => button.contains(document.elementFromPoint(bounds.x + x, bounds.y + y))));
  });
  assert(hits.every(Boolean), "Mini return lets prompt navigation cover the Copy response hit target");
}
