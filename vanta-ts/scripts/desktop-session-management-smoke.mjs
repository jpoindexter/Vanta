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
let app;

try {
  await mkdir(join(home, "sessions"), { recursive: true });
  await writeFile(join(home, "sessions", `${session.id}.json`), JSON.stringify(session), "utf8");
  await Promise.all(bulkSessions.map((entry) => writeFile(join(home, "sessions", `${entry.id}.json`), JSON.stringify(entry), "utf8")));
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", resolve(process.cwd(), "..")] : ["desktop-app/electron/main.mjs"],
    cwd: process.cwd(),
    env: { ...process.env, VANTA_HOME: home, VANTA_DESKTOP_USER_DATA: userData, VANTA_DESKTOP_PORT: port, VANTA_DESKTOP_AUTOMATION: "1", ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);

  const manage = (title) => page.getByRole("button", { name: `Manage ${title}` });
  const menu = page.locator(".session-actions");
  const notice = page.locator(".session-notice");

  await manage(session.title).waitFor();
  await manage(session.title).click();
  const renameAction = menu.getByRole("menuitem", { name: "Rename" });
  await renameAction.waitFor();
  assert.equal(await renameAction.evaluate((element) => element === document.activeElement), true, "opening a session menu should focus its first action");
  await renameAction.press("ArrowDown");
  const archiveAction = menu.getByRole("menuitem", { name: "Archive" });
  assert.equal(await archiveAction.evaluate((element) => element === document.activeElement), true, "ArrowDown should move through session actions");
  await archiveAction.press("Escape");
  await menu.waitFor({ state: "detached" });
  assert.equal(await manage(session.title).evaluate((element) => element === document.activeElement), true, "Escape should return focus to the session menu trigger");

  await manage(session.title).click();
  await page.getByPlaceholder("Search sessions").click();
  await menu.waitFor({ state: "detached" });

  await manage(session.title).waitFor();
  await manage(session.title).click();
  await menu.getByRole("menuitem", { name: "Rename" }).click();
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
  await menu.getByRole("menuitem", { name: "Archive" }).click();
  await page.locator(".session-row[aria-busy='true']").filter({ hasText: renamed }).waitFor();
  await notice.filter({ hasText: "Archive fixture failed." }).waitFor();
  await page.unroute("**/api/sessions/archive");
  await notice.getByRole("button", { name: "Dismiss session notice" }).click();

  await manage(renamed).waitFor();
  await manage(renamed).click();
  await menu.getByRole("menuitem", { name: "Archive" }).click();
  await archive.waitFor();
  await notice.filter({ hasText: "Archived 1 session." }).waitFor();
  await notice.getByRole("button", { name: "Undo" }).click();
  await archive.waitFor({ state: "detached" });

  await manage(renamed).waitFor();
  await manage(renamed).click();
  await menu.getByRole("menuitem", { name: "Move to Trash" }).click();
  await trash.waitFor();
  await notice.filter({ hasText: "Moved to Trash 1 session." }).waitFor();
  await trash.locator("summary").click();
  await manage(renamed).click();
  await menu.getByRole("menuitem", { name: "Restore from Trash" }).click();
  await trash.waitFor({ state: "detached" });
  await manage(renamed).waitFor();

  await manage(renamed).click();
  await menu.getByRole("menuitem", { name: "Move to Trash" }).click();
  await trash.locator("summary").click();
  await manage(renamed).click();
  page.once("dialog", (dialog) => dialog.accept());
  await menu.getByRole("menuitem", { name: "Delete forever" }).click();
  await manage(renamed).waitFor({ state: "detached" });

  await page.getByRole("button", { name: "Select chats" }).click();
  await page.getByLabel("Select Bulk target one").click();
  await page.getByRole("button", { name: /Bulk target three/ }).click({ modifiers: ["Shift"] });
  await page.getByText("3 selected").waitFor();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await notice.filter({ hasText: "Archived 3 sessions." }).waitFor();
  await notice.getByRole("button", { name: "Undo" }).click();
  await archive.waitFor({ state: "detached" });

  await page.getByRole("button", { name: "Select chats" }).click();
  await page.getByLabel("Select Bulk target one").click();
  await page.getByRole("button", { name: /Bulk target three/ }).click({ modifiers: ["Shift"] });
  await page.getByText("3 selected").waitFor();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await notice.filter({ hasText: "Moved to Trash 3 sessions." }).waitFor();
  await page.getByLabel("Select Bulk target one").waitFor({ state: "detached" });
  await notice.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Bulk target one", exact: true }).waitFor();

  await page.getByRole("button", { name: "Select chats" }).click();
  await page.getByRole("button", { name: "All visible" }).click();
  await page.getByText("3 selected").waitFor();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await trash.waitFor();
  await trash.locator("summary").click();
  await page.getByRole("button", { name: "Select chats" }).click();
  await page.getByRole("button", { name: "All visible" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await trash.waitFor({ state: "detached" });

  console.log(JSON.stringify({ rename: true, menuKeyboard: true, outsideDismiss: true, pending: true, error: true, archiveUndo: true, trashRestore: true, permanentDelete: true, shiftRange: true, selectAllVisible: true, bulkArchiveUndo: true, bulkTrashUndo: true, bulkPermanentDelete: true }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([rm(home, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })]);
}
