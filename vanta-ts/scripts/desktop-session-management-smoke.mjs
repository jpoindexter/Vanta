import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  await manage(session.title).waitFor();
  await manage(session.title).click();
  await page.getByRole("button", { name: "Rename" }).click();
  const input = page.getByLabel("Session title");
  await input.fill("Renamed desktop session");
  await page.getByRole("button", { name: "Save session name" }).click();

  const renamed = "Renamed desktop session";
  const archive = page.locator("details.archived-sessions");
  await manage(renamed).waitFor();
  await manage(renamed).click();
  await page.locator(".session-actions").getByRole("button", { name: "Archive" }).click();
  await archive.waitFor();
  await archive.locator("summary").click();
  await manage(renamed).click();
  await page.locator(".session-actions").getByRole("button", { name: "Restore" }).click();

  await archive.waitFor({ state: "detached" });
  await manage(renamed).waitFor();
  await manage(renamed).click();
  const remove = page.getByRole("button", { name: "Delete" });
  await remove.waitFor({ state: "visible" });
  await page.waitForTimeout(100);
  page.once("dialog", (dialog) => dialog.accept());
  await remove.click();
  await page.getByRole("button", { name: `Manage ${renamed}` }).waitFor({ state: "detached" });

  await page.getByRole("button", { name: "Select" }).click();
  await page.getByLabel("Select Bulk target one").check();
  await page.getByLabel("Select Bulk target two").check();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByText("Archived 2 sessions.").waitFor();

  await archive.waitFor();
  await archive.locator("summary").click();
  await page.getByRole("button", { name: "Select" }).click();
  await page.getByLabel("Select Bulk target one").check();
  await page.getByLabel("Select Bulk target two").check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByText("Deleted 2 sessions.").waitFor();
  await page.getByLabel("Select Bulk target one").waitFor({ state: "detached" });

  console.log(JSON.stringify({ rename: true, archive: true, restore: true, delete: true, bulkArchive: true, bulkDelete: true }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([rm(home, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })]);
}
