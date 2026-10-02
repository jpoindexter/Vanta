import assert from "node:assert/strict";

// Hold real host endpoints at the renderer boundary. No synthetic session,
// draft, model or artifact values are substituted on the successful path.
export async function chatFirstRefreshProof(page) {
  const returnTitle = await page.evaluate(async () => {
    const response = await fetch("/api/sessions", { headers: { "x-vanta-desktop-boundary": window.vantaDesktop.boundaryToken } });
    if (!response.ok) throw new Error(`Session inventory: HTTP ${response.status}`);
    const sessions = await response.json();
    const current = sessions.find((session) => session.id === "long-session-proof");
    if (!current) throw new Error("The canonical long-session fixture is missing");
    return current.title;
  });
  let releaseStatus, releaseArtifacts, sawStatus, sawArtifacts;
  const statusHeld = new Promise((resolve) => { releaseStatus = resolve; });
  const artifactsHeld = new Promise((resolve) => { releaseArtifacts = resolve; });
  const statusSeen = new Promise((resolve) => { sawStatus = resolve; });
  const artifactsSeen = new Promise((resolve) => { sawArtifacts = resolve; });
  let failStatus = false, rejectedStatus = 0;
  await page.route("**/api/status", async (route) => {
    sawStatus();
    if (failStatus) {
      rejectedStatus++;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Proof: selected model status unavailable" }) });
    }
    await statusHeld; await route.continue();
  });
  await page.route("**/api/artifacts", async (route) => { sawArtifacts(); await artifactsHeld; await route.continue(); });
  try {
    await select(page, "Short comparison task");
    await statusSeen;
    await page.locator(".chat-header-title").getByText("Short comparison task", { exact: true }).waitFor();
    assert.equal(await page.locator("#vanta-composer").isDisabled(), true, "input must wait for the selected model authority");
    releaseStatus();
    await artifactsSeen;
    await page.waitForFunction(() => document.querySelector("#vanta-composer")?.disabled === false, null, { timeout: 1500 });
    assert.equal(await page.locator("#vanta-composer").inputValue(), "", "selected session must own its canonical draft");
    const artifactsReturned = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/artifacts");
    releaseArtifacts(); await artifactsReturned;
    failStatus = true;
    await select(page, returnTitle);
    await page.getByRole("alert").getByText("Proof: selected model status unavailable", { exact: true }).waitFor();
    assert(rejectedStatus > 0, "the unavailable-authority response must actually be delivered");
    assert.equal(await page.locator("#vanta-composer").isDisabled(), true, "a failed authority read must leave input disabled");
    failStatus = false;
    await page.getByRole("button", { name: "Retry connection", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#vanta-composer")?.disabled === false);
  } finally {
    releaseStatus(); releaseArtifacts();
    await page.unrouteAll({ behavior: "wait" });
  }
  return { modelAuthorityWait: true, slowArtifactsDoNotBlockInput: true, failedAuthorityDisablesInput: true, retryRestoresInput: true };
}

async function select(page, title) {
  const show = page.getByRole("button", { name: "Show sidebar", exact: true });
  if (await show.count()) await show.click();
  await page.locator(".chat-nav-open").filter({ hasText: title }).click();
}
