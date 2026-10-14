// Shared helpers for the reachability proof: the results table, present-and-clickable checks, and the report.
//
// PASS    present, visible and enabled; its action was driven where it is safe to do so.
// INERT   present, but the native or backend call behind it is not wired in this shell (expected).
// FAIL    missing or not clickable.
// DROPPED removed on purpose (owner decision); the check is that it is gone.
// NOT-RUN needs state or a platform the sandbox cannot give; the note says what.
import fs from "node:fs";
import path from "node:path";

export const RESULTS = ["PASS", "INERT", "FAIL", "DROPPED", "NOT-RUN"];
export const results = new Map();

export const record = (id, area, label, result, note = "") => results.set(id, { id, area, label, result, note });

export async function usable(locator) {
  const first = locator.first();
  if ((await locator.count()) === 0) return false;
  return (await first.isVisible().catch(() => false)) && (await first.isEnabled().catch(() => false));
}

/** Present-and-clickable check. `inert` marks controls whose backend is a known stub. */
export async function check(id, area, label, locator, { inert = "", note = "" } = {}) {
  const ok = await usable(locator);
  record(id, area, label, ok ? (inert ? "INERT" : "PASS") : "FAIL", ok ? inert || note : "not found or not clickable");
  return ok;
}

export async function absent(id, area, label, locator) {
  const gone = (await locator.count()) === 0;
  record(id, area, label, gone ? "DROPPED" : "FAIL", gone ? "removed by owner decision" : "still present");
}

export const notRun = (id, area, label, why) => record(id, area, label, "NOT-RUN", why);

/** Record PASS when `ok`, else FAIL with `why`. */
export function verdict(id, area, label, ok, { pass = "", why = "did not behave as expected" } = {}) {
  record(id, area, label, ok ? "PASS" : "FAIL", ok ? pass : why);
  return ok;
}

export async function closeMenus(page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(150);
}

/** Choose a menu item by its text with a DOM click: menus in the right panes re-render while git and file watches refresh, which detaches a pointer click. */
export const pick = (page, name) =>
  page.evaluate((wanted) => {
    const item = [...document.querySelectorAll("[role=menuitem], [role=menuitemradio], [role=menuitemcheckbox]")].find((el) => el.textContent.trim().startsWith(wanted));
    item?.click();
    return Boolean(item);
  }, name);

export const menuItems = (page) =>
  page.locator("[role=menuitem], [role=menuitemradio], [role=menuitemcheckbox]").allInnerTexts().catch(() => []);

export const titlebarText = (page) => page.locator("[data-vanta-titlebar]").innerText().catch(() => "");
export const bodyText = (page) => page.locator("body").innerText().catch(() => "");
export const overlay = (page) => page.locator("[data-overlay-surface]").first();

/** Send one message from Home and wait for the canned reply; returns once the chat is on screen. */
export async function startChat(page, text = "Say hello", reply = "Hello from the proof model") {
  await page.locator('[data-tour="sidebar-nav-home"]').click();
  const input = page.getByTestId("home-composer-input");
  await input.fill(text);
  await input.press("Enter");
  await page.getByText(reply, { exact: false }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

/** A chat must be open for anything that asks the server to run a command: its approval card has to land somewhere.
 *  Also puts that chat in front, so the panes read the project the chat runs in. */
export async function ensureChat(page) {
  await goHome(page);
  const sidebar = page.locator('[data-tour="sessions-sidebar"]').first();
  if ((await sidebar.getByText("Say hello", { exact: true }).count()) === 0) await startChat(page);
  await sidebar.getByText("Say hello", { exact: true }).first().click();
  await page.waitForTimeout(800);
}

/** Start a group from a clean window: saved layout, open tabs and panes from earlier rows are cleared (chats live on the server). */
export async function freshWindow(page) {
  await closeMenus(page);
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* storage unavailable */ } });
  await page.reload();
  await page.locator("[data-vanta-titlebar]").first().waitFor({ state: "visible", timeout: 60_000 });
  await page.locator('[data-tour="sidebar-nav-home"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(3500);
}

/** Put the panes back to the default layout, so open panes from an earlier row do not squeeze the chat. */
export async function resetLayout(page) {
  await closeMenus(page);
  await page.keyboard.press("Meta+k");
  await page.locator("[cmdk-input]").first().waitFor({ timeout: 5000 });
  await page.keyboard.type("Reset layout");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await closeMenus(page);
}

/** Poll `read()` until it returns something truthy, or `ms` runs out; returns the last value. */
export async function waitUntil(read, ms = 8000, every = 400) {
  const end = Date.now() + ms;
  let value = await read();
  while (!value && Date.now() < end) {
    await new Promise((done) => setTimeout(done, every));
    value = await read();
  }
  return value;
}

/** Run one row's check; a throw becomes a FAIL for that row only, so one broken control cannot hide the rest. */
export async function attempt(page, id, area, label, body, { keepOpen = false } = {}) {
  try {
    await body();
    if (results.get(id)?.result === "FAIL" && process.env.PROOF_SHOTS) await page.screenshot({ path: `${process.env.PROOF_SHOTS}/fail-${id}.png` }).catch(() => undefined);
  } catch (error) {
    const message = String(error.message ?? error).split("\n").slice(0, Number(process.env.PROOF_ERR_LINES ?? 2)).join(" | ").replace(/class="[^"]*"/g, "").slice(0, Number(process.env.PROOF_ERR_LINES ?? 2) * 110);
    if (!results.has(id) || results.get(id).label === label) record(id, area, label, "FAIL", `threw: ${message}`);
    if (process.env.PROOF_SHOTS) await page.screenshot({ path: `${process.env.PROOF_SHOTS}/fail-${id}.png` }).catch(() => undefined);
  } finally {
    if (!keepOpen) await closeMenus(page).catch(() => undefined);
  }
}

export async function goHome(page) {
  await closeMenus(page);
  const nav = page.locator('[data-tour="sidebar-nav-home"]');
  if (!(await nav.isVisible().catch(() => false))) {
    // A full-screen page or overlay (Profiles, Command Center) covers the sidebar: leave it.
    await page.evaluate(() => { location.hash = "#/"; });
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(300);
  }
  await page.locator('[data-tour="sidebar-nav-home"]').click();
  await page.waitForTimeout(350);
}

/** Run one section; a throw is recorded against every id the section owns, not allowed to stop the run. */
export async function section(name, ids, body, page) {
  try {
    await body();
  } catch (error) {
    const message = String(error.message ?? error).split("\n")[0].slice(0, 160);
    console.error(`section ${name} stopped: ${String(error.message ?? error).split("\n").slice(0, 12).join(" | ").replace(/class="[^"]*"/g, "").slice(0, 900)}`);
    for (const id of ids) if (!results.has(id)) record(id, name, "(section stopped)", "FAIL", `section stopped: ${message}`);
    if (process.env.PROOF_SHOTS) await page.screenshot({ path: `${process.env.PROOF_SHOTS}/fail-${name}.png` }).catch(() => undefined);
    await closeMenus(page).catch(() => undefined);
  }
}

export function writeReport(file, { errors = [], title, intro }) {
  const rows = [...results.values()].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  const counts = {};
  const byArea = {};
  for (const row of rows) {
    counts[row.result] = (counts[row.result] ?? 0) + 1;
    byArea[row.area] ??= {};
    byArea[row.area][row.result] = (byArea[row.area][row.result] ?? 0) + 1;
  }
  const nonPass = rows.filter((row) => row.result !== "PASS");
  const lines = [
    `# ${title}`,
    "",
    ...intro,
    "",
    `Totals (${rows.length} rows): ${RESULTS.filter((k) => counts[k]).map((k) => `${k} ${counts[k]}`).join(", ")}`,
    "",
    `| Area | ${RESULTS.join(" | ")} |`,
    `|---|${RESULTS.map(() => "---").join("|")}|`,
    ...Object.entries(byArea).map(([area, c]) => `| ${area} | ${RESULTS.map((k) => c[k] ?? 0).join(" | ")} |`),
    "",
    "## Every row",
    "",
    "| ID | Area | Control | Result | Note |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.id} | ${r.area} | ${r.label.replace(/\|/g, "/")} | ${r.result} | ${r.note.replace(/\|/g, "/").replace(/\n+/g, " ")} |`),
    "",
    `## Not PASS (${nonPass.length})`,
    "",
    ...nonPass.map((r) => `- ${r.id} ${r.result}: ${r.label.replace(/\|/g, "/")}. ${r.note.replace(/\n+/g, " ")}`),
    "",
    `Renderer errors seen (${errors.length}, ${new Set(errors).size} distinct): ${[...new Set(errors)].slice(0, 12).join(" ; ") || "none"}`
  ];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return counts;
}
