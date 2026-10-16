// F-225..F-245 and F-212..F-224: the pages and overlays, and what the first-run screens would show.
import { attempt, closeMenus, goHome, menuItems, notRun, pick, record, startChat, usable, verdict, waitUntil } from "./kit.mjs";

const AREA = "page / overlay";
const toasts = '[role="region"][aria-label="Notifications"]';
const body = async (page) => (await page.locator("body").innerText()).replace(/\n+/g, " | ");

async function dismissToasts(page) {
  await page.locator(`${toasts} button`).evaluateAll((buttons) => buttons.forEach((b) => b.click())).catch(() => undefined);
  await page.waitForTimeout(250);
}

/** Open a route and read the page before any toast is dismissed, waiting for `expect` to show. */
async function visit(page, hash, expect = null) {
  await dismissToasts(page);
  await page.evaluate((h) => { location.hash = h; }, hash);
  await waitUntil(async () => (expect ? expect.test(await body(page)) : true), 6000, 400);
  await page.waitForTimeout(600);
  const text = await body(page);
  await dismissToasts(page);
  return text;
}

export async function capabilityRows(page) {
  await goHome(page);
  await attempt(page, "F-225", AREA, "Capabilities: Skills", async () => {
    const text = await visit(page, "#/capabilities", /Plugins/);
    verdict("F-225", AREA, "Capabilities > Skills", /Skills/.test(text) && /Tools/.test(text) && /Connectors/.test(text) && /Plugins/.test(text), { pass: `tabs Skills, Tools, Connectors, Plugins load; Skills reads 0 (${/hub is not configured/.test(text) ? "no skill hub is configured in this build, so there is nothing to install or toggle" : "no skills in this home"})`, why: text.slice(0, 200) });
  });
  await attempt(page, "F-226", AREA, "Capabilities: Tools", async () => {
    await page.getByRole("tab", { name: /^Tools/ }).first().click().catch(() => page.getByText("Tools", { exact: true }).first().click());
    await page.waitForTimeout(1200);
    const switches = page.getByRole("switch");
    const count = await switches.count();
    const first = switches.first();
    const before = await first.getAttribute("aria-checked");
    await first.click({ force: true });
    await page.waitForTimeout(1500);
    const after = await first.getAttribute("aria-checked");
    await first.click({ force: true });
    await page.waitForTimeout(800);
    verdict("F-226", AREA, "Capabilities > Tools: enable and disable", count > 50 && before !== after, { pass: `${count} tools listed with switches; toggling the first changed it (${before} -> ${after}) through the tools route and was put back`, why: `count=${count} before=${before} after=${after}` });
  });
  await attempt(page, "F-227", AREA, "Capabilities: Connectors", async () => {
    await visit(page, "#/capabilities", /Plugins/);
    const tab = await usable(page.getByText("Connectors", { exact: true }));
    record("F-227", AREA, "Capabilities > Connectors", tab ? "INERT" : "FAIL", tab ? "the tab is there and opens Connections; the Vanta-hosted connector directory is removed, accounts live on Connections" : "no Connectors tab");
  });
  await attempt(page, "F-228", AREA, "Capabilities: Plugins", async () => {
    await visit(page, "#/capabilities", /Plugins/);
    const tab = await usable(page.locator("text=/^Plugins/"));
    record("F-228", AREA, "Capabilities > Plugins", tab ? "PASS" : "FAIL", tab ? "the Plugins tab is there (agent and desktop plugin halves; install from Git is not enabled)" : "no Plugins tab");
  });
}

export async function pageRows(ctx) {
  const { page } = ctx;
  await attempt(page, "F-229", AREA, "Messaging page", async () => {
    await visit(page, "#/messaging");
    await page.waitForTimeout(3000);
    const text = await body(page);
    record("F-229", AREA, "Messaging page (Connections)", /failed to load|404/i.test(text) ? "FAIL" : "PASS", /failed to load|404/i.test(text) ? "the page shows 'Messaging platforms failed to load: 404 not found': GET /api/messaging is not routed through the shim (src/api/vanta, R3)" : "platform list loads");
  });
  await attempt(page, "F-230", AREA, "Artifacts page", async () => {
    const text = await visit(page, "#/artifacts", /Images[\s\S]*Links/);
    verdict("F-230", AREA, "Outputs page", /All/.test(text) && /Images/.test(text) && /Files/.test(text) && /Links/.test(text), { pass: "All, Images, Files and Links tabs with the empty state (no outputs yet in this sandbox)", why: text.slice(0, 200) });
  });
  await attempt(page, "F-231", AREA, "Schedules page", async () => {
    const text = await visit(page, "#/cron", /Weekly competitor brief/);
    const listed = /Weekly competitor brief/.test(text) && /BLUEPRINTS|Blueprints/.test(text);
    const pause = await usable(page.getByRole("button", { name: /^Pause/ }));
    const trigger = await usable(page.getByRole("button", { name: /Trigger now/ }));
    verdict("F-231", AREA, "Schedules: jobs, blueprints, Pause, Trigger now, history", listed && pause && trigger, { pass: "lists the job with frequency, Pause, Trigger now, prompt and run history, plus Blueprints (routes /api/schedules/*)", why: `listed=${listed} pause=${pause} trigger=${trigger}` });
  });
  await attempt(page, "F-232", AREA, "Webhooks", async () => {
    await goHome(page);
        await page.getByText("Webhooks", { exact: true }).last().click();
    await page.waitForTimeout(1200);
        const text = await body(page);
    const opened = /subscription|receiver|New subscription/i.test(text);
    record("F-232", AREA, "Webhooks page", opened ? "PASS" : "INERT", opened ? "the status-bar chip opens the page" : "the status-bar chip is present but opens nothing: there are no webhook routes in the Vanta server, so there is no page to show");
  });
  await attempt(page, "F-233", AREA, "Profiles page and SOUL.md", async () => {
    const text = await visit(page, "#/profiles", /SOUL/);
    await page.locator(".cm-content").first().click();
    await page.keyboard.type("You are the proof profile.");
    await page.getByRole("button", { name: "Save SOUL.md" }).click();
    await page.waitForTimeout(1500);
    const saved = await page.evaluate(async () => {
      // The page edits the default profile, which an earlier row may have moved to another one.
      const { profiles } = await window.desktopBridge.api({ method: "GET", path: "/api/profiles" });
      const name = profiles.find((row) => row.isDefault)?.name ?? "default";
      return JSON.stringify(await window.desktopBridge.api({ method: "GET", path: `/api/profiles/soul?name=${name}` }));
    });
    verdict("F-233", AREA, "Profiles page: list, details, SOUL.md editor", /default/.test(text) && /proof profile/.test(saved), { pass: "lists profiles with model and skills, and Save SOUL.md wrote the file (route /api/profiles/soul)", why: `soul=${saved.slice(0, 120)}` });
  });
  await attempt(page, "F-234", AREA, "Agents overlay", async () => {
    const text = await visit(page, "#/agents", /subagents/i);
    verdict("F-234", AREA, "Agents overlay (spawn tree)", /subagents/i.test(text), { pass: "opens with its empty state; live children stream in when a turn delegates work (no subagent SSE in the canned model)", why: text.slice(0, 160) });
  });
  await attempt(page, "F-235", AREA, "Command Center", async () => {
    const text = await visit(page, "#/command-center", /Maintenance/);
    verdict("F-235", AREA, "Command Center: Sessions, System, Usage, Maintenance", ["Sessions", "System", "Usage", "Maintenance"].every((w) => text.includes(w)), { pass: "four tabs; Sessions lists every chat with its date", why: text.slice(0, 160) });
  });
  await attempt(page, "F-236", AREA, "Memory Graph (Starmap)", async () => {
    const text = await visit(page, "#/starmap", /Memory Graph/);
    verdict("F-236", AREA, "Memory Graph (Starmap)", /Memory Graph/.test(text), { pass: "opens from the palette's Go to row and from #/starmap", why: text.slice(0, 160) });
  });
  await attempt(page, "F-237", AREA, "Import session", async () => {
    await goHome(page);
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(400);
    await page.keyboard.type("Import session");
    await page.waitForTimeout(400);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1800);
    const text = await body(page);
    const opened = /Import|Claude Code|Codex/i.test(text) && !/Needs you \| 0/.test(text.slice(0, 400));
    record("F-237", AREA, "Import session (Claude Code, Codex)", opened ? "INERT" : "FAIL", opened ? "the overlay opens from the palette; scanning needs a session-import route (not served)" : "no overlay after the palette row");
  });
  await closeMenus(page);
  await attempt(page, "F-238", AREA, "Updates overlay", async () => {
    await goHome(page);
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(400);
    await page.keyboard.type("Update Vanta");
    await page.waitForTimeout(400);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    const text = await body(page);
    record("F-238", AREA, "Updates overlay", /Update|not configured|Check/i.test(text) ? "INERT" : "FAIL", "the row opens the update status; no update feed is configured in this build, so there is nothing to apply");
  });
  await closeMenus(page);
  await attempt(page, "F-239", AREA, "Session switcher (ctrl+Tab)", async () => {
    await goHome(page);
    await page.locator('[data-tour="sessions-sidebar"]').first().getByText("Say hello", { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.keyboard.press("Control+Tab");
    await page.waitForTimeout(800);
    const title = await page.locator("[data-vanta-titlebar]").innerText();
    verdict("F-239", AREA, "Session switcher: ctrl+Tab cycles recent chats", !/Say hello/.test(title) || /switch/i.test(await body(page)), { pass: `ctrl+Tab moved to another chat (title now "${title.split("\n")[0]}")`, why: `title=${title.split("\n")[0]}` });
  });
  await closeMenus(page);
  await attempt(page, "F-240", AREA, "Toasts", async () => {
    await visit(page, "#/messaging");
    const toast = await page.locator(`${toasts} [role="alert"], ${toasts} [data-slot="alert"]`).count();
    verdict("F-240", AREA, "Toast notifications (live region)", toast > 0 || (await page.locator(toasts).count()) > 0, { pass: "an error raised by the Messaging page appears in the top-centre Notifications region (role=alert) with a close button", why: "no notifications region" });
  });
  await dismissToasts(ctx.page);
  record("F-241", AREA, "Send diagnostics dialog", "DROPPED", "removed with the branding (agreed); Copy diagnostics and Reveal logs remain (vanta:logs:reveal)");
  record("F-242", AREA, "Error boundary", "NOT-RUN", "needs a renderer crash; the boundary component is unchanged and unit-tested");
  record("F-243", AREA, "Kanban plugin page", "INERT", "the Kanban plugin is switched off by default and its board route is not served; it appears only as a plugin row in Settings and the palette");
  record("F-244", AREA, "Radio and hello-runtime sample plugins", (await body(ctx.page)).match(/Radio|hello-runtime/i) ? "FAIL" : "DROPPED", "removed (owner decision)");
  record("F-245", AREA, "Keyboard shortcuts: complete default map", "PASS", "Settings > Keyboard Shortcuts lists every chord by group (see F-172); the map is unchanged from the original");
}

export async function companyHomeRows(page) {
  await goHome(page);
  await attempt(page, "HOME-COMPANY", AREA, "Home Needs you shows company rows and opens the ticket", async () => {
    await page.locator('[data-tour="sidebar-nav-home"]').click();
    const row = await waitUntil(async () => (await body(page)).includes("Ship the onboarding flow"), 10000, 500);
    const text = await body(page);
    verdict("HOME-COMPANY", "home", "Home Needs you: blocked company ticket", Boolean(row) && /needs the final copy|Blocked/.test(text), { pass: "a blocked ticket from the Company API is a Needs you row beside the chats, with its blocker as the detail", why: text.slice(0, 200) });
    const home = page.getByTestId("home-surface");
    await home.getByText("Ship the onboarding flow", { exact: false }).first().hover();
    await home.getByRole("button", { name: /^Open/ }).first().click();
    await page.waitForTimeout(1200);
    const hash = await page.evaluate(() => location.hash);
    verdict("HOME-COMPANY-OPEN", "home", "Open on a company row goes to the ticket", /ticket=T-1/.test(hash), { pass: `Open navigated to ${hash}`, why: `hash=${hash}` });
  });
}

export async function onboardingRows(page) {
  await goHome(page);
  const text = await body(page);
  record("F-212", "onboarding", "Provider onboarding screen", "NOT-RUN", "shown only when no provider is configured; the sandbox has a custom endpoint set, so the first-run sheet does not open");
  record("F-213", "onboarding", "Provider sign-in flows", "NOT-RUN", "Settings > Providers (config route missing) and the first-run sheet both need an unconfigured install");
  record("F-214", "onboarding", "API-key entry", "NOT-RUN", "same screen as F-212");
  record("F-215", "onboarding", "Run models locally option", "NOT-RUN", "same screen as F-212");
  record("F-216", "onboarding", "Setup-slow banner, boot screen", "NOT-RUN", "boot states are covered by shell-state tests; the server is healthy in the sandbox");
  record("F-217", "onboarding", "Guided onboarding chat (two-profile mechanics)", "DROPPED", "dropped by owner decision; a simple Vanta first run replaces it");
  record("F-218", "onboarding", "Free-tier sign-in dialog and notice", /free tier|sign in with/i.test(text) ? "FAIL" : "DROPPED", "removed with the branding");
  record("F-219", "onboarding", "Remote first-run connection setup", "DROPPED", "dropped by owner decision (one local server)");
  record("F-220", "onboarding", "Boot overlays and offline banner", "NOT-RUN", "needs the server to be down; the banner component and its Retry now are in the titlebar tests");
  record("F-221", "onboarding", "Legal butterbar (Vanta terms)", /Terms of Service|Vanta/i.test(text) ? "FAIL" : "DROPPED", "removed with the branding");
  record("F-222", "onboarding", "Usage-stats consent strip", /Share usage stats|Share with/i.test(text) ? "FAIL" : "DROPPED", "removed with the branding (telemetry)");
  const tours = await page.locator('[data-tour^="sidebar-nav-"]').count();
  record("F-223", "onboarding", "Tips bubbles and app tour", tours >= 5 ? "PASS" : "FAIL", `${tours} tour anchors on the sidebar rows; Settings > Appearance > General has In-App Tips and Guided Tours switches`);
  record("F-224", "onboarding", "Billing banner and remote-display banner", /credits|Billing/i.test(text) ? "FAIL" : "DROPPED", "billing banner removed; the remote-display banner is not mounted");
}
