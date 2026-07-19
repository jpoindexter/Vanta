import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { _electron as electron } from "playwright-core";

const home = await mkdtemp(join(tmpdir(), "vanta-desktop-session-ui-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-session-profile-"));
const port = process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7822";
const executablePath = process.env.VANTA_DESKTOP_APP;
const session = {
  id: "session-ui-smoke",
  title: "Original desktop session",
  started: "2026-07-13T00:00:00.000Z",
  updated: "2026-07-13T00:00:00.000Z",
  messages: [{ role: "user", content: "keep this transcript" }],
};
const bulkSessions = [
  {
    id: "bulk-one",
    title: "Bulk target one",
    started: "2026-07-13T00:00:01.000Z",
    updated: "2026-07-13T00:00:01.000Z",
    messages: [{ role: "user", content: "bulk one" }],
  },
  {
    id: "bulk-two",
    title: "Bulk target two",
    started: "2026-07-13T00:00:02.000Z",
    updated: "2026-07-13T00:00:02.000Z",
    messages: [{ role: "user", content: "bulk two" }],
  },
  {
    id: "bulk-three",
    title: "Bulk target three",
    started: "2026-07-13T00:00:03.000Z",
    updated: "2026-07-13T00:00:03.000Z",
    messages: [{ role: "user", content: "bulk three" }],
  },
];
const pinSessions = [
  { id: "pin-alpha", title: "Pinned alpha", started: "2026-07-13T00:00:04.000Z", updated: "2026-07-13T00:00:04.000Z", messages: [{ role: "user", content: "alpha" }] },
  { id: "pin-beta", title: "Pinned beta", started: "2026-07-13T00:00:05.000Z", updated: "2026-07-13T00:00:05.000Z", messages: [{ role: "user", content: "beta" }] },
  { id: "pin-gamma", title: "Pinned gamma", started: "2026-07-13T00:00:06.000Z", updated: "2026-07-13T00:00:06.000Z", messages: [{ role: "user", content: "gamma" }] },
];
let app;
let page;

async function launchApp() {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", resolve(process.cwd(), "..")] : ["desktop-app/electron/main.mjs"],
    cwd: process.cwd(),
    env: { ...process.env, VANTA_HOME: home, VANTA_DESKTOP_USER_DATA: userData, VANTA_DESKTOP_PORT: port, VANTA_DESKTOP_AUTOMATION: "1", ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
}

const manage = (title) => page.getByRole("button", { name: `Manage ${title}` });
const menu = () => page.locator(".session-actions");
const notice = () => page.locator(".session-notice");
const pinnedTitles = () => page.locator(".pinned-session-group .session strong").allTextContents();
async function assertPinnedTitles(expected, message) {
  await page.waitForFunction((titles) => {
    const current = [...document.querySelectorAll(".pinned-session-group .session strong")].map((element) => element.textContent?.trim());
    return JSON.stringify(current) === JSON.stringify(titles);
  }, expected);
  assert.deepEqual(await pinnedTitles(), expected, message);
}

try {
  await mkdir(join(home, "sessions"), { recursive: true });
  await writeFile(join(home, "sessions", `${session.id}.json`), JSON.stringify(session), "utf8");
  await Promise.all(bulkSessions.map((entry) => writeFile(join(home, "sessions", `${entry.id}.json`), JSON.stringify(entry), "utf8")));
  await Promise.all(pinSessions.map((entry) => writeFile(join(home, "sessions", `${entry.id}.json`), JSON.stringify(entry), "utf8")));
  await launchApp();

  let composer = page.getByPlaceholder("Ask Vanta to do something...");
  await page.getByRole("button", { name: session.title, exact: true }).click();
  await composer.fill("draft owned by original session");
  await page.getByRole("button", { name: "Bulk target one", exact: true }).click();
  assert.equal(await composer.inputValue(), "", "a draft must not follow the operator into another session");
  await composer.fill("draft owned by bulk one");
  await page.getByRole("button", { name: session.title, exact: true }).click();
  assert.equal(await composer.inputValue(), "draft owned by original session", "switching back should restore the owning session draft");

  await app.close();
  app = undefined;
  await launchApp();
  composer = page.getByPlaceholder("Ask Vanta to do something...");
  await page.getByRole("button", { name: session.title, exact: true }).click();
  assert.equal(await composer.inputValue(), "draft owned by original session", "a session draft should survive an Electron process restart");
  await page.getByRole("button", { name: "Bulk target one", exact: true }).click();
  assert.equal(await composer.inputValue(), "draft owned by bulk one", "the second session draft should survive without crossing ownership");
  await composer.fill("");
  await page.getByRole("button", { name: session.title, exact: true }).click();
  await composer.fill("");

  await manage(session.title).waitFor();
  await manage(session.title).click();
  const renameAction = menu().getByRole("menuitem", { name: "Rename" });
  await renameAction.waitFor();
  assert.equal(await renameAction.evaluate((element) => element === document.activeElement), true, "opening a session menu should focus its first action");
  await renameAction.press("ArrowDown");
  const pinAction = menu().getByRole("menuitem", { name: "Pin", exact: true });
  assert.equal(await pinAction.evaluate((element) => element === document.activeElement), true, "ArrowDown should move to the pin action");
  await pinAction.press("ArrowDown");
  const archiveAction = menu().getByRole("menuitem", { name: "Archive" });
  assert.equal(await archiveAction.evaluate((element) => element === document.activeElement), true, "ArrowDown should move through session actions");
  await archiveAction.press("Escape");
  await menu().waitFor({ state: "detached" });
  assert.equal(await manage(session.title).evaluate((element) => element === document.activeElement), true, "Escape should return focus to the session menu trigger");

  await manage(session.title).click();
  await page.getByPlaceholder("Search sessions").click();
  await menu().waitFor({ state: "detached" });

  for (const title of ["Pinned alpha", "Pinned beta"]) {
    await manage(title).click();
    await menu().getByRole("menuitem", { name: "Pin", exact: true }).click();
  }
  await page.route("**/api/sessions/pin", async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Pin fixture failed." }) });
  });
  await manage("Pinned gamma").click();
  await menu().getByRole("menuitem", { name: "Pin", exact: true }).click();
  await page.locator(".session-row[aria-busy='true']").filter({ hasText: "Pinned gamma" }).waitFor();
  await notice().filter({ hasText: "Pin fixture failed." }).waitFor();
  await page.unroute("**/api/sessions/pin");
  await notice().getByRole("button", { name: "Dismiss session notice" }).click();
  await manage("Pinned gamma").click();
  await menu().getByRole("menuitem", { name: "Pin", exact: true }).click();
  await assertPinnedTitles(["Pinned alpha", "Pinned beta", "Pinned gamma"]);

  await manage("Pinned beta").click();
  await menu().getByRole("menuitem", { name: "Move up" }).click();
  await assertPinnedTitles(["Pinned beta", "Pinned alpha", "Pinned gamma"]);
  await manage("Pinned beta").click();
  const moveDown = menu().getByRole("menuitem", { name: "Move down" });
  await moveDown.focus();
  await moveDown.press("Enter");
  await assertPinnedTitles(["Pinned alpha", "Pinned beta", "Pinned gamma"]);

  await app.close();
  app = undefined;
  await launchApp();
  await assertPinnedTitles(["Pinned alpha", "Pinned beta", "Pinned gamma"], "pinned order should survive an Electron process restart");
  await page.setViewportSize({ width: 760, height: 700 });
  await page.getByRole("button", { name: "Toggle threads" }).click();
  await page.getByRole("heading", { name: "Pinned", exact: true }).waitFor();
  await manage("Pinned alpha").click();
  await menu().getByRole("menuitem", { name: "Unpin" }).waitFor();
  await menu().getByRole("menuitem", { name: "Archive" }).click();
  await page.locator("details.archived-sessions").waitFor();
  await notice().getByRole("button", { name: "Undo" }).click();
  await assertPinnedTitles(["Pinned alpha", "Pinned beta", "Pinned gamma"], "archive undo should restore the same pinned position");
  await notice().getByRole("button", { name: "Dismiss session notice" }).click();
  await manage("Pinned gamma").click();
  await menu().getByRole("menuitem", { name: "Move to Trash" }).click();
  await page.locator("details.trashed-sessions summary").click();
  await notice().getByRole("button", { name: "Dismiss session notice" }).click();
  await manage("Pinned gamma").click();
  await menu().getByRole("menuitem", { name: "Restore from Trash" }).click();
  await assertPinnedTitles(["Pinned alpha", "Pinned beta"], "trash restore should return a session unpinned");
  await notice().getByRole("button", { name: "Dismiss session notice" }).click();
  await page.setViewportSize({ width: 1440, height: 960 });

  await manage(session.title).waitFor();
  await manage(session.title).click();
  await menu().getByRole("menuitem", { name: "Rename" }).click();
  const input = page.getByLabel("Session title");
  await input.fill("Renamed desktop session");
  await page.getByRole("button", { name: "Save session name" }).click();

  const renamed = "Renamed desktop session";
  const archive = page.locator("details.archived-sessions");
  const trash = page.locator("details.trashed-sessions");

  await page.route("**/api/sessions/archive", async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Archive fixture failed." }) });
  });
  await manage(renamed).click();
  await menu().getByRole("menuitem", { name: "Archive" }).click();
  await page.locator(".session-row[aria-busy='true']").filter({ hasText: renamed }).waitFor();
  await notice().filter({ hasText: "Archive fixture failed." }).waitFor();
  await page.unroute("**/api/sessions/archive");
  await notice().getByRole("button", { name: "Dismiss session notice" }).click();

  await manage(renamed).waitFor();
  await manage(renamed).click();
  await menu().getByRole("menuitem", { name: "Archive" }).click();
  await archive.waitFor();
  await notice().filter({ hasText: "Archived 1 session." }).waitFor();
  await notice().getByRole("button", { name: "Undo" }).click();
  await archive.waitFor({ state: "detached" });

  await manage(renamed).waitFor();
  await manage(renamed).click();
  await menu().getByRole("menuitem", { name: "Move to Trash" }).click();
  await trash.waitFor();
  await notice().filter({ hasText: "Moved to Trash 1 session." }).waitFor();
  await trash.locator("summary").click();
  await manage(renamed).click();
  await menu().getByRole("menuitem", { name: "Restore from Trash" }).click();
  await trash.waitFor({ state: "detached" });
  await manage(renamed).waitFor();

  await manage(renamed).click();
  await menu().getByRole("menuitem", { name: "Move to Trash" }).click();
  await trash.locator("summary").click();
  await manage(renamed).click();
  page.once("dialog", (dialog) => dialog.accept());
  await menu().getByRole("menuitem", { name: "Delete forever" }).click();
  await manage(renamed).waitFor({ state: "detached" });

  await page.getByRole("button", { name: "Select chats" }).click();
  await page.getByLabel("Select Bulk target one").click();
  await page.getByRole("button", { name: /Bulk target three/ }).click({ modifiers: ["Shift"] });
  await page.getByText("3 selected").waitFor();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await notice().filter({ hasText: "Archived 3 sessions." }).waitFor();
  await notice().getByRole("button", { name: "Undo" }).click();
  await archive.waitFor({ state: "detached" });

  await page.getByRole("button", { name: "Select chats" }).click();
  await page.getByLabel("Select Bulk target one").click();
  await page.getByRole("button", { name: /Bulk target three/ }).click({ modifiers: ["Shift"] });
  await page.getByText("3 selected").waitFor();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await notice().filter({ hasText: "Moved to Trash 3 sessions." }).waitFor();
  await page.getByLabel("Select Bulk target one").waitFor({ state: "detached" });
  await notice().getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Bulk target one", exact: true }).waitFor();

  await page.getByRole("button", { name: "Select chats" }).click();
  await page.getByRole("button", { name: "All visible" }).click();
  await page.getByText("6 selected").waitFor();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await trash.waitFor();
  await trash.locator("summary").click();
  await page.getByRole("button", { name: "Select chats" }).click();
  await page.getByRole("button", { name: "All visible" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await trash.waitFor({ state: "detached" });

  console.log(JSON.stringify({ draftSessionIsolation: true, draftRestartPersistence: true, rename: true, menuKeyboard: true, outsideDismiss: true, pending: true, error: true, pinPointer: true, pinKeyboardReorder: true, pinRestartPersistence: true, pinArchiveRestore: true, pinTrashReset: true, compactDrawer: true, archiveUndo: true, trashRestore: true, permanentDelete: true, shiftRange: true, selectAllVisible: true, bulkArchiveUndo: true, bulkTrashUndo: true, bulkPermanentDelete: true }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([rm(home, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })]);
}
