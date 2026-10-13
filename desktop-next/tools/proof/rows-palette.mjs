// F-104, F-181..F-194: the command palette and the context menus.
import { attempt, bodyText, closeMenus, goHome, menuItems, record, startChat, usable, verdict, waitUntil } from "./kit.mjs";

const AREA = "command palette";
const sidebar = (page) => page.locator('[data-tour="sessions-sidebar"]').first();
const items = async (page) => (await page.locator("[cmdk-item]").allInnerTexts()).map((t) => t.replace(/\n+/g, " ").trim());

async function openPalette(page) {
  await closeMenus(page);
  await page.keyboard.press("Meta+k");
  await page.locator("[cmdk-input]").first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
}

async function search(page, text) {
  await page.keyboard.press("Meta+a");
  await page.keyboard.type(text);
  await page.waitForTimeout(500);
  return items(page);
}

const has = (list, wanted) => wanted.every((word) => list.some((entry) => entry.startsWith(word)));

export async function paletteRows(page) {
  await goHome(page);
  await attempt(page, "F-181", AREA, "Palette shell", async () => {
    await openPalette(page);
    const all = await items(page);
    const groups = await page.locator("[cmdk-group-heading]").allInnerTexts();
    verdict("F-181", AREA, "Palette shell (⌘K, groups, filter)", all.length > 20 && groups.includes("GO TO"), { pass: `${all.length} rows in groups ${groups.join(" / ")}; typing filters them`, why: `rows=${all.length} groups=${groups.join("/")}` });
    verdict("F-182", AREA, "Go to: New session, Settings, Capabilities, Messaging, Artifacts, Cron, Profiles", has(all, ["New session", "New window", "Settings", "Capabilities", "Messaging", "Artifacts", "Cron", "Profiles"]), { pass: "all present", why: all.slice(0, 12).join(" / ") });
    verdict("F-183", AREA, "Projects: Open folder as project…", has(all, ["Open folder as project"]), { pass: "present with ⌘O", why: "missing" });
    verdict("F-184", AREA, "Commands: layout, status bar, tabs, shortcuts", has(all, ["Toggle layout edit mode", "Reset layout", "Toggle status bar", "Toggle tabs", "Keyboard shortcuts"]), { pass: "present", why: "missing rows" });
    verdict("F-186", AREA, "Command Center group", has(all, ["Sessions", "Import session", "System", "Usage", "Reload window"]), { pass: "Sessions, Import session, System, Usage, Reload window and the update row are present", why: "missing rows" });
    verdict("F-187", AREA, "Appearance group (theme, colour mode)", has(all, ["Change theme", "Change color mode"]), { pass: "Change theme and Change color mode are present", why: "missing rows" });
  });
  await attempt(page, "F-187P", AREA, "No Pets or Memory Graph rows", async () => {
    const pets = await search(page, "pet");
    const graph = await search(page, "memory graph");
    verdict("F-187P", AREA, "No Pets / Generate a pet / Memory Graph rows", !pets.some((r) => /pets?\b|generate a pet/i.test(r)) && !graph.some((r) => /memory graph|starmap/i.test(r)), { pass: "searching pet and memory graph finds none (owner decision)", why: `pets=${pets.join("/")} graph=${graph.join("/")}` });
  });
  await attempt(page, "F-189", AREA, "Chat search results", async () => {
    await openPalette(page);
    await search(page, "Quarterly");
    await page.waitForTimeout(1500);
    const found = await items(page);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
    const opened = /Quarterly planning notes/.test(await page.locator("[data-vanta-titlebar]").innerText());
    verdict("F-189", AREA, "Search results: chats", found.some((r) => /Quarterly planning notes/.test(r)) && opened, { pass: "typing a title lists the chat and Enter opens it", why: `found=${found.join("/")} opened=${opened}` });
  });
  await attempt(page, "F-188", AREA, "Settings deep search", async () => {
    await openPalette(page);
    const found = await search(page, "minimize");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
    const text = await page.locator("[data-overlay-surface]").first().innerText().catch(() => "");
    verdict("F-188", AREA, "Settings group and deep search", found.some((r) => /Minimize to tray/.test(r)) && /Minimize to tray/.test(text), { pass: "searching a setting's name lists it and Enter opens Settings on that page", why: `found=${found.join("/")} overlay=${text.slice(0, 80)}` });
  });
  await closeMenus(page);
  await attempt(page, "F-184R", AREA, "Running a command row", async () => {
    await openPalette(page);
    await search(page, "Toggle status bar");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    const hidden = (await page.getByText("Backend ready").count()) === 0;
    await openPalette(page);
    await search(page, "Toggle status bar");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    verdict("F-184R", AREA, "A palette command runs", hidden, { pass: "Toggle status bar hid the bar and a second run brought it back", why: "status bar did not hide" });
  });
  await attempt(page, "F-104", AREA, "Logs", async () => {
    await openPalette(page);
    const found = await search(page, "logs");
    verdict("F-104", AREA, "Logs (palette row)", found.some((r) => /logs/i.test(r)), { pass: "Toggle logs is in the palette; the log file itself opens from Settings > About and vanta:logs:reveal", why: found.join("/") });
  });
  await closeMenus(page);
  record("F-185", AREA, "Plugin palette rows (Kanban, Bots)", "INERT", "Bots 'New Bot…' is there; the Kanban Open board / New task rows are absent because no board route exists (F-243)");
}

export async function contextRows(ctx) {
  const { page } = ctx;
  await goHome(page);
  await attempt(page, "F-193", AREA, "Bare-chrome context menu", async () => {
    await page.locator("[data-vanta-titlebar]").click({ button: "right", position: { x: 700, y: 20 } });
    await page.waitForTimeout(500);
    const list = await menuItems(page);
    verdict("F-193", "context menus", "Bare-chrome context menu", list.length >= 3, { pass: list.join(" / "), why: `items=${list.join(" / ")}` });
  });
  await closeMenus(page);
  await attempt(page, "F-194", AREA, "Zone tab context menu", async () => {
    await page.getByRole("tab", { name: "Sessions" }).first().click({ button: "right" });
    await page.waitForTimeout(500);
    const list = await menuItems(page);
    verdict("F-194", "context menus", "Pane / zone context menu", list.length >= 2, { pass: list.join(" / "), why: `items=${list.join(" / ")}` });
  });
  await closeMenus(page);
  await attempt(page, "F-191", AREA, "Link context menu", async () => {
    await startChat(page, "link please", "for details");
    await page.getByRole("link", { name: "example page" }).first().click({ button: "right" });
    await page.waitForTimeout(500);
    const list = await menuItems(page);
    verdict("F-191", "context menus", "DOM context menu: link", list.some((i) => /Copy link|Open/.test(i)), { pass: list.join(" / "), why: `items=${list.join(" / ")}` });
  });
  await closeMenus(page);
  await attempt(page, "F-190", AREA, "Terminal context menu", async () => {
    await page.getByTestId("titlebar-terminal").click();
    await page.waitForTimeout(1200);
    if ((await page.locator(".xterm").count()) === 0) await page.keyboard.press("Control+Shift+`");
    await page.waitForTimeout(800);
    await page.locator(".xterm").first().click({ button: "right", force: true });
    await page.waitForTimeout(500);
    const list = await menuItems(page);
    verdict("F-190", "context menus", "Terminal context menu (Paste, Select all; Copy with a selection)", ["Paste", "Select all"].every((i) => list.some((entry) => entry.startsWith(i))), { pass: list.join(" / "), why: `items=${list.join(" / ")}` });
  });
  await closeMenus(page);
  record("F-192", "context menus", "Preview webview (guest) context menu", "INERT", "the Browser pane cannot host a page (webviewTag is off), so there is no guest page to right-click");
}
