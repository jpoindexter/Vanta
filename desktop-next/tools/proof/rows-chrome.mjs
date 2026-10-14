// F-001..F-093 and the nav, palette and settings smoke rows: titlebar, sidebar, profile rail, Bots tab, status bar.
import { absent, check, closeMenus, notRun, record, startChat as startKitChat, usable, waitUntil } from "./kit.mjs";

const sidebar = (page) => page.locator('[data-tour="sessions-sidebar"]').first();

export async function titlebar(page) {
  const tool = (id) => page.getByTestId(`titlebar-${id}`);
  await check("F-001", "titlebar", "Show/Hide sidebar", tool("sidebar"));
  await check("F-002", "titlebar", "Open settings (gear)", tool("settings"));
  await check("F-003", "titlebar", "Layout editor", tool("layout"));
  await check("F-004", "titlebar", "HUD mode", tool("hud"), { inert: "hud.* is typed-unsupported until R2 wires the mini window" });
  await check("F-005", "titlebar", "Swap sidebar sides", tool("flip-panes"));
  await check("F-006", "titlebar", "Show/Hide right sidebar", tool("right-sidebar"));
  notRun("F-007", "titlebar", "Unread badge on sidebar toggle", "needs a finished-unread chat; badge renders from $unreadSessionCount");
  notRun("F-008", "titlebar", "Titlebar plugin slots", "no page projects titlebar chrome in the default app");
  await absent("F-009", "titlebar", "App-actions side preference", page.getByText("App actions", { exact: false }));
  const lights = await page.locator("[data-vanta-titlebar]").first().evaluate((el) => el.style.getPropertyValue("--vs-lights-inset"));
  record("F-010", "titlebar", "Window controls inset", lights !== "" ? "PASS" : "FAIL", `--vs-lights-inset=${lights}`);
  await tool("more").click();
  await check("F-011", "titlebar", "Interface mode (More menu)", page.getByTestId("more-simple-mode"));
  await closeMenus(page);
}

export async function sidebarTop(page) {
  await check("F-012", "sidebar top", "New session row", page.locator('[data-tour="sidebar-nav-new-session"]'));
  await page.locator('[data-tour="sidebar-nav-new-session"]').click({ button: "right" });
  await check("F-013", "sidebar top", "Open in split (New session menu)", page.getByRole("menuitem", { name: /split/i }), { note: "menu item present; split drop is pointer-driven" });
  await closeMenus(page);
  const rows = [
    ["F-014", "capabilities", "Skills & tools", /capabilities/],
    ["F-015", "messaging", "Connections", /messaging/],
    ["F-016", "artifacts", "Outputs", /artifacts/],
    ["F-017", "cron", "Schedules", /cron/]
  ];
  for (const [id, key, label, route] of rows) {
    const row = page.locator(`[data-tour="sidebar-nav-${key}"]`);
    let ok = await usable(row);
    if (ok) {
      await row.click();
      await page.waitForTimeout(500);
      ok = route.test(await page.evaluate(() => location.hash + location.pathname));
    }
    record(id, "sidebar top", `${label} row opens its page`, ok ? "PASS" : "FAIL", ok ? "" : "route did not change");
    await closeMenus(page);
    await page.evaluate(() => { location.hash = "#/"; });
    await page.waitForTimeout(300);
  }
  await page.locator('[data-tour="sidebar-nav-home"]').click();
  await page.waitForTimeout(400);
  await check("F-018", "sidebar top", "Home row and dashboard", page.getByTestId("home-surface"));
  notRun("F-019", "sidebar top", "Contributed nav rows", "no plugin contributes a row by default (Kanban ships off)");
  notRun("F-021", "sidebar top", "Storage-corrupt banner", "Hermes state.db specific; Vanta has no equivalent");
  record("F-023", "sidebar top", "Sidebar width 275px", Math.abs((await page.locator('[data-tour="sessions-sidebar"]').first().boundingBox())?.width - 275) < 24 ? "PASS" : "FAIL", "measured at 1440 wide");
  const tours = await page.locator('[data-tour^="sidebar-nav-"]').count();
  record("F-024", "sidebar top", "Tour anchors on nav rows", tours >= 5 ? "PASS" : "FAIL", `${tours} anchors`);
  await check("F-025", "sidebar top", "SESSIONS | BOTS tab strip", page.getByRole("tab", { name: /bots/i }).or(page.getByText("Bots", { exact: true })).first());
}

export async function emptyState(page) {
  const blank = sidebar(page).getByText("No sessions yet").first();
  record("F-022", "sidebar top", "Sidebar blank state", (await blank.count()) ? "PASS" : "FAIL", "");
  record("F-057", "sidebar list", "Empty state for the list", (await blank.count()) ? "PASS" : "FAIL", "");
}

export async function newProjectDialog(page) {
  await sidebar(page).getByRole("button", { name: /^Filters$/ }).first().click();
  await page.getByRole("menuitem", { name: /^Grouping/ }).hover().catch(() => undefined);
  await page.waitForTimeout(300);
  await page.getByRole("menuitemradio", { name: /^Project/ }).first().click().catch(() => undefined);
  await page.waitForTimeout(300);
  await closeMenus(page);
  const plus = sidebar(page).getByRole("button", { name: /new project/i }).first();
  if (await usable(plus)) {
    await plus.click();
    await page.waitForTimeout(400);
    record("F-050", "sidebar list", "New project dialog", (await page.getByRole("dialog").count()) ? "INERT" : "FAIL", "opens; creating a project needs projects.create (not served by Vanta)");
    await closeMenus(page);
  } else record("F-050", "sidebar list", "New project dialog", "FAIL", "New project button missing in Project grouping");
  await sidebar(page).getByRole("button", { name: /^Filters$/ }).first().click();
  await page.getByRole("menuitem", { name: /^Grouping/ }).hover().catch(() => undefined);
  await page.waitForTimeout(300);
  await page.getByRole("menuitemradio", { name: /^Date/ }).first().click().catch(() => undefined);
  await closeMenus(page);
}

export async function startChat(page) {
  await page.locator('[data-tour="sidebar-nav-home"]').click();
  const input = page.getByTestId("home-composer-input");
  await input.fill("Say hello");
  await input.press("Enter");
  await page.getByText("Hello from the proof model", { exact: false }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

export async function sidebarList(page) {
  const search = page.getByPlaceholder("Search sessions", { exact: false });
  await check("F-020", "sidebar top", "Search sessions field", search);
  await search.fill("hello");
  await page.waitForTimeout(700);
  const hit = (await page.getByText("Say hello").count()) > 0;
  record("F-020", "sidebar top", "Search sessions field", hit ? "PASS" : "FAIL", "typed a query and the chat matched (server search is not served: client filter only)");
  await page.getByRole("button", { name: /clear search/i }).first().click().catch(() => search.fill(""));
  await search.fill("");

  const pinned = page.getByText("Pinned", { exact: true }).first();
  await check("F-026", "sidebar list", "Pinned section (collapse)", pinned);
  await check("F-027", "sidebar list", "Sessions section header", page.getByText("Sessions", { exact: true }).first());
  notRun("F-028", "sidebar list", "Month / date dividers", "all sandbox chats are from today; dividers need older chats");
  const row = sidebar(page).getByText("Say hello", { exact: true }).first();
  await check("F-030", "sidebar list", "Session row (dot, title, age)", row);

  await page.locator('[data-tour="sidebar-nav-home"]').click();
  await page.waitForTimeout(400);
  await row.click({ button: "right" });
  await page.waitForTimeout(300);
  const items = [
    ["F-032", "Rename…", ""],
    ["F-033", "Pin", ""],
    ["F-034", "Mark as unread", "unread watermark route not served by Vanta"],
    ["F-035", "Branch", "session.branch is unsupported in the bridge"],
    ["F-036", "Export", "selectSavePath / writeTextFile are stubbed"],
    ["F-037", "Copy ID", ""],
    ["F-038", "Move to project", "projects.* is not served by Vanta"],
    ["F-039", "Open in new tab", ""],
    ["F-039", "New window", "openSessionWindow is stubbed in the Vanta shell"],
    ["F-039", "Open in terminal", "openSessionInTerminal is removed (exec)"],
    ["F-040", "Archive", ""]
  ];
  for (const [id, name, inert] of items) {
    await check(id, "sidebar list", `Row menu: ${name}`, page.getByRole("menuitem", { name: new RegExp(`^${name}`) }), { inert });
  }
  await check("F-040", "sidebar list", "Row menu: Archive / Delete", page.getByRole("menuitem", { name: /^Delete/ }));
  await closeMenus(page);
  await row.click();
  await page.waitForTimeout(500);
  record("F-031", "sidebar list", "Row open gestures", /Say hello/.test(await page.locator("[data-vanta-titlebar]").innerText()) ? "PASS" : "FAIL", "plain click opens the chat");
  notRun("F-041", "sidebar list", "Tab-surface menu", "needs a second tab");
  notRun("F-042", "sidebar list", "Mark all as read", "shown only while a chat is unread");
  record("F-043", "sidebar list", "Section header +", (await sidebar(page).getByRole("button", { name: /new session/i }).count()) > 1 ? "PASS" : "FAIL", "");
}

export async function filterMenu(page) {
  const trigger = sidebar(page).getByRole("button", { name: /^Filters$/ }).first();
  const ok = await usable(trigger);
  if (!ok) {
    for (const id of ["F-044", "F-045", "F-046", "F-047"]) record(id, "sidebar list", "Filter menu", "FAIL", "filter button not found");
    return;
  }
  await trigger.click();
  await page.waitForTimeout(300);
  const want = [
    ["F-044", /^Grouping/, "Grouping (Date / Project / Status / Profile)"],
    ["F-045", /^Ordering/, "Ordering"],
    ["F-046", /^Show/, "Show (row meta)"],
    ["F-047", /^(Filters|Archived|Reset to defaults)/, "Filters, Archived, Reset"]
  ];
  await page.getByRole("menuitem", { name: /^Grouping/ }).hover().catch(() => undefined);
  await page.waitForTimeout(300);
  const groupingChoices = await page.getByRole("menuitemradio").allInnerTexts().catch(() => []);
  record("F-044", "sidebar list", "Filter menu: Grouping choices", /Project/.test(groupingChoices.join()) ? "PASS" : "FAIL", `choices: ${groupingChoices.join(" / ")}`);
  for (const [id, name, label] of want.filter(([id]) => id !== "F-044")) {
    const hit = page.getByRole("menuitem", { name }).or(page.getByText(name)).first();
    await check(id, "sidebar list", `Filter menu: ${label}`, hit, { inert: id === "F-047" ? "PR bucket filter needs /api/profiles/sessions/pull-requests (not served)" : "" });
  }
  await closeMenus(page);
}

export async function listRest(page) {
  notRun("F-048", "sidebar list", "Project lanes", "project grouping needs the Project grouping option; groups derive from cwd");
  notRun("F-049", "sidebar list", "Project menu", "needs an entered project lane");
  await page.keyboard.press("Meta+O").catch(() => undefined);
  record("F-051", "sidebar list", "Open folder (⌘O / palette)", "INERT", "native folder picker; opens only in a visible window");
  record("F-052", "sidebar list", "New worktree dialog (⌘⇧B)", "INERT", "git.worktree* is stubbed (exec removed)");
  notRun("F-053", "sidebar list", "Messaging platform groups", "no messaging threads in the sandbox");
  const cron = sidebar(page).getByRole("button", { name: "Cron jobs" }).first();
  await check("F-054", "sidebar list", "CRON JOBS section", cron, { note: "job row from /api/schedules via the cron adapter" });
  await absent("F-055", "sidebar list", "Gateway/profile group headers", page.locator('[data-slot="profile-rail-gateway"]'));
  notRun("F-056", "sidebar list", "Load more row", "needs more chats than one page");
}

export async function footer(page) {
  const rail = page.locator('[data-slot="profile-rail"]');
  await check("F-058", "profile rail", "Profile rail strip", rail);
  await check("F-059", "profile rail", "Home button (default / all profiles)", rail.getByRole("button", { name: /default|all profiles/i }).first());
  notRun("F-060", "profile rail", "Profile squares", "only the default profile exists (profile routes are not served)");
  await check("F-061", "profile rail", "+ New profile", rail.getByRole("button", { name: "New profile" }), { inert: "creating needs POST /api/profiles (not served)" });
  await check("F-062", "profile rail", "Import profile", rail.getByRole("button", { name: /Import profile/ }), { inert: "import needs POST /api/profiles/import (not served)" });
  const manage = rail.getByRole("button", { name: /Manage profiles/ });
  await check("F-063", "profile rail", "... Manage profiles", manage, { inert: "page opens; edits need /api/profiles/* (not served)" });
  await absent("F-064", "profile rail", "Plug / Manage gateways", rail.getByRole("button", { name: /Manage gateways/ }));
  await absent("F-065", "profile rail", "Fleet groups and This device switch", page.locator('[data-slot="profile-rail-gateway"]'));
  notRun("F-066", "profile rail", "Profile right-click menu", "needs a named profile square");
  await rail.getByRole("button", { name: "New profile" }).click();
  await page.waitForTimeout(300);
  record("F-067", "profile rail", "Profile dialogs (create)", (await page.getByRole("dialog").count()) ? "INERT" : "FAIL", "dialog opens; save needs the profile route");
  await closeMenus(page);
  const chip = await page.getByText(/Local\s*·/).count();
  record("F-068", "profile rail", "No identity chip in the footer", chip === 0 ? "PASS" : "FAIL", "");
  await check("F-002", "titlebar", "Open settings (gear)", page.getByTestId("sidebar-settings"), { note: "sidebar footer gear too" });
}

export async function bots(page) {
  const tab = page.getByText("Bots", { exact: true }).first();
  await check("F-069", "bots tab", "BOTS tab", tab);
  await tab.click();
  await page.waitForTimeout(700);
  const body = await page.locator('[data-zone-body="grp-sessions"]').innerText().catch(() => "");
  record("F-070", "bots tab", "Roster toolbar (search, New…)", /new|search|bot/i.test(body) ? "INERT" : "FAIL", "roster needs the profiles list (not served); toolbar renders");
  notRun("F-071", "bots tab", "Bot row", "roster is empty without a profiles route");
  record("F-072", "bots tab", "New Bot dialog", "INERT", "reachable from the roster toolbar and palette; saving needs POST /api/profiles");
  record("F-073", "bots tab", "Group chats", "NOT-RUN", "kept in the tree and hidden until server support exists (owner decision)");
  notRun("F-074", "bots tab", "Routines pane", "registers only with a bot focused");
  notRun("F-075", "bots tab", "Screen portal", "needs a bot with a computer; target is the Workbench Browser tab");
  notRun("F-076", "bots tab", "@bot mentions", "roster empty");
  await page.getByText("Sessions", { exact: true }).first().click();
  await page.waitForTimeout(300);
}

export async function statusBar(page) {
  const bar = page.locator('[data-slot="statusbar"], footer').last();
  record("F-077", "status bar", "Status bar visible by default", (await page.getByText("Backend", { exact: false }).count()) ? "PASS" : "FAIL", "");
  await check("F-078", "status bar", "Command center glyph", page.getByTestId("statusbar-command-center"));
  await absent("F-079", "status bar", "Gateway switcher", page.getByRole("button", { name: /switch gateway|gateway switcher/i }));
  notRun("F-080", "status bar", "Compact profile switcher", "shown only when the profile rail is hidden");
  await check("F-081", "status bar", "Backend health chip", page.getByText(/Backend/).first());
  await absent("F-082", "status bar", "Free-tier chip", page.getByText(/free tier|sign in/i));
  await check("F-083", "status bar", "Workspace chip", page.getByText("acme-site", { exact: true }).last());
  await check("F-084", "status bar", "Agents chip", page.getByText("Agents", { exact: true }).last(), { inert: "subagent progress has no route; chip opens the overlay" });
  await check("F-085", "status bar", "Cron and Webhooks chips", page.getByText("Webhooks", { exact: true }).last());
  await check("F-086", "status bar", "Session timer", page.getByText(/Focused for/).first());
  // The meter follows the chat in front, so run a short turn and look at the bar.
  await startKitChat(page, "meter probe");
  const statusText = async () => (await page.locator("body").innerText().catch(() => "")).split("\n").slice(-30).join(" ");
  await waitUntil(async () => /~?[\d.]+k?\/[\d.]+k/.test(await statusText()), 10000, 400);
  const barText = await statusText();
  await check("F-090", "status bar", "Approval-mode pill", page.getByText(/^(Smart|Manual)$/).last(), { note: "still in the status bar; the composer's Permission chip is the main control" });
  const meter = /~?[\d.]+k?\/[\d.]+k/.test(barText) || /\d+%/.test(barText);
  record("F-087", "status bar", "Context meter", meter ? "PASS" : "FAIL", meter ? `the status bar shows the meter from the server's usage event: ${(barText.match(/~?[\d.]+k?\/[\d.]+k[^|]*/) ?? [""])[0].trim()}` : `no context meter after a finished turn; status text: ${barText.slice(-160)}`);
  record("F-088", "status bar", "Cache hit / tokens per second", "NOT-RUN", "hidden by default and the usage event carries no cache or speed figures");
  record("F-089", "status bar", "RAM / system resources", /RAM|\bMB\b|\bGB\b/.test(barText) ? "PASS" : "NOT-RUN", "shown only when /api/runtime reports memory; not in this sandbox");
  await check("F-091", "status bar", "Terminal toggle", page.getByRole("button", { name: /terminal/i }).last(), { note: "opens the terminal pane (a line terminal where every command asks first)" });
  const version = /v\d+\.\d+\.\d+/.test(barText);
  const staleToast = /Backend out of date|Update Vanta/.test(await page.locator("body").innerText().catch(() => ""));
  record("F-092", "status bar", "Version / build chip", version && !staleToast ? "PASS" : "FAIL", version ? (staleToast ? "the chip is there, but a 'Backend out of date / Update Vanta' toast is on screen after launch and a chat" : `the chip reads ${(barText.match(/v\d+\.\d+\.\d+/) ?? [""])[0]}; no 'Backend out of date' toast after launch and a chat`) : "no version chip");
  notRun("F-093", "status bar", "Contributed status items", "no contribution registered by default");
  await page.getByText("Backend", { exact: false }).first().click({ button: "right" });
  await page.waitForTimeout(300);
  record("F-077", "status bar", "Status bar context menu (Show in status bar)", (await page.getByRole("menuitem").count()) ? "PASS" : "FAIL", "");
  await closeMenus(page);
}

export async function surfaces(page) {
  const extra = [];
  await page.keyboard.press("Meta+K");
  await page.waitForTimeout(500);
  extra.push(["PAL", "palette", "Command palette (⌘K)", (await page.getByRole("dialog").count()) > 0 || (await page.getByPlaceholder(/search|type/i).count()) > 0]);
  const text = await page.locator("body").innerText();
  extra.push(["PAL-HOME", "palette", "Palette: Home / New session / Settings rows", /Home|New session|Settings/.test(text)]);
  extra.push(["PAL-NOPET", "palette", "Palette has no Pets / Memory Graph rows", !/Pets|Generate a pet|Memory Graph|Starmap/.test(text)]);
  await closeMenus(page);
  await page.getByTestId("titlebar-settings").click();
  await page.waitForTimeout(800);
  const settings = await page.locator("body").innerText();
  extra.push(["SET", "settings", "Settings opens with sections", /Appearance|General|Providers/.test(settings)]);
  extra.push(["SET-NOGW", "settings", "Settings has no Gateways section", !/\bGateways?\b/.test(settings)]);
  extra.push(["SET-NOBILL", "settings", "Settings has no Billing section", !/\bBilling\b/.test(settings)]);
  await closeMenus(page);
  for (const [id, area, label, ok] of extra) record(id, area, label, ok ? "PASS" : "FAIL", "");
}

