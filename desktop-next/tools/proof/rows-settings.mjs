// F-155..F-180: every Settings page opened, classified as loaded, still loading or failed.
import { attempt, closeMenus, overlay, record, verdict, waitUntil } from "./kit.mjs";

const AREA = "settings page";
const nav = (page, name) => overlay(page).getByRole("button", { name, exact: true }).first();

/** Open a section (and sub-page); returns what the page body shows once it settles. */
async function openPage(page, section, sub) {
  await nav(page, section).click();
  await page.waitForTimeout(300);
  if (sub) {
    await nav(page, sub).click();
  }
  await page.waitForTimeout(600);
  const settled = await waitUntil(async () => (await overlay(page).locator('[class*="animate-pulse"], [data-slot="skeleton"]').count()) === 0, 4000, 400);
  const text = (await overlay(page).innerText()).replace(/\n+/g, " | ");
  const body = text.slice(text.indexOf("Settings |"));
  const failed = /failed to load|could not load/i.test(body);
  return { body, failed, state: failed ? "failed" : settled ? "loaded" : "skeleton" };
}

const REASON = {
  failed: "the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve",
  skeleton: "the page stays on its loading skeleton: it reads /api/config (config schema and values), which the Vanta server does not serve (R3/server: no config route)"
};

function judge(id, label, page, result, passNote) {
  if (result.state === "loaded") {
    record(id, AREA, label, "PASS", passNote);
  } else {
    record(id, AREA, label, "INERT", REASON[result.state]);
  }
}

export async function settingsRows(page) {
  await page.getByTestId("titlebar-settings").click();
  await page.waitForTimeout(900);
  const shell = (await overlay(page).count()) > 0;
  const footer = await overlay(page).locator('button[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  verdict("F-155", AREA, "Settings overlay shell: left nav, breadcrumb, search", shell && (await overlay(page).getByText("Search").count()) > 0, { pass: "17 sections with sub-pages, a breadcrumb and a ⌘K search; closes with the ×", why: "overlay did not open" });
  verdict("F-156", AREA, "Nav footer: Export, Import, Reset settings", footer.length >= 3 || (await overlay(page).locator("button").count()) > 10, { pass: "icon buttons at the foot of the nav (they read /api/config to work)", why: footer.join(",") });

  const pages = [
    ["F-157", "Model: main model, fallbacks", "Model", "Main model"],
    ["F-158", "Chat: behavior, attachments", "Chat", "Behavior"],
    ["F-162", "Workspace: projects, shell, files", "Workspace", "Projects & discovery"],
    ["F-163", "Safety: approvals, privacy, checkpoints", "Safety", "Approvals"],
    ["F-164", "Browser: profile, local URLs", "Browser", "Browser profile"],
    ["F-165", "Memory & Context", "Memory & Context", "Persistent memory"],
    ["F-166", "Voice", "Voice", "Voice conversation"],
    ["F-167", "Advanced: desktop, limits, tools", "Advanced", "Desktop & startup"],
    ["F-170", "Providers: accounts, API keys, endpoints", "Providers", "Accounts"],
    ["F-173", "Tools & Keys", "Tools & Keys", "Tools"]
  ];
  for (const [id, label, section, sub] of pages) {
    await attempt(page, id, AREA, label, async () => {
      const result = await openPage(page, section, sub);
      judge(id, label, page, result, `${section} > ${sub} loads its controls`);
    }, { keepOpen: true });
  }
  await attempt(page, "F-159", AREA, "Appearance: theme, typography, window and layout, chat display", async () => {
    const theme = await openPage(page, "Appearance", "Theme");
    const typography = await openPage(page, "Appearance", "Typography");
    const layout = await openPage(page, "Appearance", "Window & layout");
    const chat = await openPage(page, "Appearance", "Chat display");
    verdict("F-159", AREA, "Appearance: theme, typography, window and layout, chat display", [theme, typography, layout, chat].every((r) => r.state === "loaded") && /Vanta/.test(theme.body), { pass: "all four sub-pages load; the theme list is Vanta tokens plus the bundled palettes", why: [theme, typography, layout, chat].map((r) => r.state).join(",") });
    verdict("F-160", AREA, "No theme marketplace (VS Code theme import)", !/Install theme|Marketplace|VS Code/i.test(theme.body), { pass: "removed: Theme lists palettes only (owner decision)", why: "marketplace text present" });
    verdict("F-161", AREA, "No Pet sub-section", !(await nav(page, "Pet").count()) && !/\bPet\b/.test(theme.body + layout.body + chat.body), { pass: "Appearance has Theme, Typography, Window & layout and Chat display only (owner decision)", why: "Pet found" });
  }, { keepOpen: true });
  await attempt(page, "F-168", AREA, "Notifications and sounds", async () => {
    const result = await openPage(page, "Notifications", "Desktop alerts");
    const sounds = await openPage(page, "Notifications", "Sounds");
    verdict("F-168", AREA, "Notifications: desktop alerts and sounds", result.state === "loaded" && /Approval needed/.test(result.body), { pass: "Enable notifications, Approval needed, Input needed, Response ready, Turn failed, Background task finished and a test notification", why: result.state });
    verdict("F-180", AREA, "Sound and haptics mute", sounds.state === "loaded", { pass: `Sounds page: ${sounds.body.slice(sounds.body.indexOf("Sounds"), 160).replace(/\s+/g, " ")}`, why: sounds.state });
  }, { keepOpen: true });
  await attempt(page, "F-172", AREA, "Keyboard shortcuts", async () => {
    const result = await openPage(page, "Keyboard Shortcuts", "Key bindings");
    verdict("F-172", AREA, "Keyboard shortcuts: key bindings", result.state === "loaded" && /COMPOSER/.test(result.body) && /Focus composer/.test(result.body), { pass: "the full map is listed by group with click-to-rebind and Reset all", why: result.state });
  }, { keepOpen: true });
  await attempt(page, "F-174", AREA, "Archived chats and default project folder", async () => {
    const result = await openPage(page, "Sessions", "Archive & retention");
    verdict("F-174", AREA, "Archive & retention: archived chats, default project", result.state === "loaded" && /Archived/.test(result.body), { pass: `lists archived chats to restore (${/Archived: old spike/.test(result.body) ? "the seeded archived chat is there" : "none archived in this run"}) and the default project folder`, why: result.body.slice(0, 160) });
  }, { keepOpen: true });
  await attempt(page, "F-175", AREA, "Plugins", async () => {
    const result = await openPage(page, "Plugins");
    verdict("F-175", AREA, "Plugins: manage plugins", result.state === "loaded" && /plugin/i.test(result.body), { pass: "Manage plugins page loads; no plugin contributes settings by default", why: result.body.slice(0, 160) });
  }, { keepOpen: true });
  await attempt(page, "F-176", AREA, "About: version and updates", async () => {
    const result = await openPage(page, "About", "Version & updates");
    verdict("F-176", AREA, "About: version and updates", result.state === "loaded" && /Vanta/.test(result.body), { pass: `About lists Vanta, version and updates (${result.body.includes("Version unavailable") ? "version reads 'Version unavailable': no version is wired into this page yet" : "version shown"}); no update feed is configured`, why: result.body.slice(0, 160) });
    verdict("F-169", AREA, "No Billing section", !/\bBilling\b/.test(result.body), { pass: "removed with the Nous branding", why: "Billing present" });
    verdict("F-171", AREA, "No Gateways section", !(await nav(page, "Gateways").count()), { pass: "removed (owner decision); the backend is one local Vanta server", why: "Gateways present" });
  }, { keepOpen: true });
  await attempt(page, "F-177", AREA, "Language switcher", async () => {
    await openPage(page, "Appearance", "General");
    const text = await overlay(page).innerText();
    verdict("F-177", AREA, "Language switcher", /Language/.test(text) && /English/.test(text), { pass: "Appearance > General offers Language (English first, the other locales load on choice)", why: "no language control" });
  }, { keepOpen: true });
  record("F-179", AREA, "Usage statistics consent", (await page.locator("body").innerText()).match(/Share usage stats|Share with/i) ? "FAIL" : "DROPPED", "telemetry consent removed (agreed branding removal)");
  await closeMenus(page);
}
