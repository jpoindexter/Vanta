// F-058..F-076: the profile rail, the profile page and the Bots roster, against the profile routes the server now serves.
import { attempt, check, closeMenus, goHome, menuItems, notRun, pick, record, usable, verdict, waitUntil } from "./kit.mjs";
import { clearNativeLog, readNativeLog } from "./native-stubs.mjs";

const AREA = "profile rail";
const rail = (page) => page.locator('[data-slot="profile-rail"]');
const side = (page) => page.locator('[data-tour="sessions-sidebar"]').first();

const profilesJson = (page) => page.evaluate(async () => JSON.stringify(await window.desktopBridge.api({ method: "GET", path: "/api/profiles" })));

export async function profileRail(ctx) {
  const { page, app } = ctx;
  await goHome(page);
  await check("F-058", AREA, "Profile rail strip", rail(page));
  await check("F-059", AREA, "Home button (default / all profiles)", rail(page).getByRole("button", { name: /default|all profiles/i }).first());
  await attempt(page, "F-061", AREA, "+ New profile creates a profile", async () => {
    await rail(page).getByRole("button", { name: "New profile" }).click();
    await page.waitForTimeout(500);
    const dialog = page.getByRole("dialog");
    await dialog.locator("input").first().fill("research");
    await dialog.getByRole("button", { name: "Create profile", exact: true }).click();
    await page.waitForTimeout(2500);
    const listed = /research/.test(await profilesJson(page));
    verdict("F-061", AREA, "+ New profile creates a profile", listed, { pass: "the dialog created research (POST /api/profiles); it is listed by GET /api/profiles", why: "profile not listed after Create profile" });
    verdict("F-067", AREA, "Profile dialog (create) saves", listed, { pass: "Create profile saved through the profile route", why: "dialog did not save" });
  });
  await attempt(page, "F-060", AREA, "Profile squares", async () => {
    await page.waitForTimeout(800);
    const squares = await rail(page).getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || e.textContent?.trim()));
    verdict("F-060", AREA, "Profile squares", squares.some((label) => /research/i.test(label ?? "")), { pass: `squares: ${squares.join(", ")}`, why: `squares: ${squares.join(", ")}` });
  });
  await attempt(page, "F-066", AREA, "Profile right-click menu", async () => {
    await rail(page).getByRole("button", { name: /research/i }).first().click({ button: "right" });
    await page.waitForTimeout(500);
    const items = await menuItems(page);
    verdict("F-066", AREA, "Profile right-click menu", items.length >= 3, { pass: items.join(" / "), why: `items=${items.join(" / ")}` });
  });
  await attempt(page, "F-066S", AREA, "Profile menu: Set as default", async () => {
    await rail(page).getByRole("button", { name: /research/i }).first().click({ button: "right" });
    await pick(page, "Set as default");
    await page.waitForTimeout(2000);
    const rows = JSON.parse(await profilesJson(page)).profiles;
    const research = rows.find((row) => row.name === "research");
    verdict("F-066S", AREA, "Profile menu: Set as default", research?.isDefault === true, { pass: "POST /api/profiles/set-default saved research as the default (it applies at the next launch)", why: `rows=${JSON.stringify(rows.map((r) => [r.name, r.isDefault]))}` });
  });
  await closeMenus(page);
  await attempt(page, "F-062", AREA, "Import profile", async () => {
    await clearNativeLog(app);
    await rail(page).getByRole("button", { name: /Import profile/ }).click();
    await page.waitForTimeout(1200);
    const picker = (await readNativeLog(app)).dialogs.some((d) => d.picker);
    const dialog = (await page.getByRole("dialog").count()) > 0;
    record("F-062", AREA, "Import profile", picker || dialog ? "PASS" : "FAIL", picker ? "reached the native file picker (stubbed); the archive step needs a profile export file" : dialog ? "an import dialog opened" : "nothing opened");
  });
  await closeMenus(page);
  await attempt(page, "F-063", AREA, "Manage profiles page", async () => {
    await rail(page).getByRole("button", { name: /Manage profiles/ }).click();
    await page.waitForTimeout(1500);
    const text = await page.locator("body").innerText();
    verdict("F-063", AREA, "... Manage profiles", /research/.test(text) && /default/.test(text), { pass: "the Profiles page lists default and research", why: text.slice(0, 160) });
  });
  await attempt(page, "F-055", "sidebar list", "Profile grouping has no gateway headers", async () => {
    await goHome(page);
    await side(page).getByRole("button", { name: /^Filters$/ }).first().click();
    await page.getByRole("menuitem", { name: /^Grouping/ }).hover();
    await page.waitForTimeout(300);
    const options = await menuItems(page);
    await pick(page, "Profile");
    await closeMenus(page);
    await page.waitForTimeout(1200);
    const text = await side(page).innerText();
    const noGateway = (await page.locator('[data-slot="profile-rail-gateway"]').count()) === 0 && !/Gateway|This computer ·/i.test(text) && !options.some((o) => /Gateway/i.test(o));
    verdict("F-055", "sidebar list", "Profile grouping: plain profile groups, no gateway or fleet headers", noGateway, { pass: `the grouping option reads "Profile" and the list shows plain profile groups (${/default/.test(text) ? "default" : "none"}); no gateway header is drawn (owner decision)`, why: `options=${options.join("/")} text=${text.slice(0, 120)}` });
    await side(page).getByRole("button", { name: /^Filters$/ }).first().click();
    await pick(page, "Reset to defaults");
    await closeMenus(page);
  });
  await goHome(page);
}

export async function botsRows(ctx) {
  const { page } = ctx;
  await goHome(page);
  await attempt(page, "F-070", "bots tab", "Roster toolbar and bot rows", async () => {
    await page.getByText("Bots", { exact: true }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('[data-zone-body="grp-sessions"]').innerText();
    const cause = "the roster is empty although /api/profiles lists research: the Bots plugin asks the gateway for the profiles.list RPC, which src/api/vanta/dispatch.ts does not map yet (R3). The union half, getAgentRoster, is wired in the bridge and returns research";
    verdict("F-070", "bots tab", "Roster toolbar and list", /research/.test(body), { pass: "the roster lists the research profile as a bot", why: cause });
    verdict("F-071", "bots tab", "Bot row", /research/.test(body), { pass: "bot row present", why: cause });
  });
  await attempt(page, "F-072", "bots tab", "New Bot dialog", async () => {
    const add = page.getByRole("button", { name: /New bot or group chat/i }).first();
    const ok = await usable(add);
    let opened = false;
    if (ok) {
      await add.click();
      await page.waitForTimeout(500);
      const items = await menuItems(page);
      await pick(page, items.find((item) => /^New bot/i.test(item)) ?? "New bot");
      await page.waitForTimeout(800);
      opened = (await page.getByRole("dialog").count()) > 0;
    }
    record("F-072", "bots tab", "New Bot dialog", opened ? "PASS" : "FAIL", opened ? "the + in the Bots tab offers New bot and opens its dialog (saving makes a profile through POST /api/profiles)" : "no + control or no dialog");
  });
  notRun("F-074", "bots tab", "Routines pane", "registers only with a bot focused; not driven here");
  notRun("F-075", "bots tab", "Screen portal", "needs a bot with a computer; the target is the Workbench Browser tab, which cannot load pages yet");
  notRun("F-076", "bots tab", "@bot mentions", "not driven here");
  record("F-073", "bots tab", "Group chats", "NOT-RUN", "kept in the tree and hidden until server support exists (owner decision)");
  await page.getByText("Sessions", { exact: true }).first().click().catch(() => undefined);
}
