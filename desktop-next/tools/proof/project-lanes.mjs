// Project-lane evidence uses private fixture chats, real API rows and the visible sidebar.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { waitForShell } from "../vanta-app.mjs";
import { closeMenus, verdict } from "./kit.mjs";

const ACME = "Review the Acme landing page";
const BETA = "Draft the Beta notes";
const LEGACY = "Unfiled project-lane fixture";
const api = (page, request) => page.evaluate(input => window.desktopBridge.api(input), request);

function seedLaneChats({ root, project, second }) {
  const dir = path.join(root, "vanta-home", "sessions");
  fs.mkdirSync(dir, { recursive: true });
  const at = new Date().toISOString();
  for (const [index, [title, cwd]] of [[ACME, project], [BETA, second], [LEGACY, null]].entries()) {
    const id = `20261023-09000${index}-f048`;
    const row = { id, title, started: at, updated: at, ...(cwd ? { cwd } : {}),
      messages: [{ role: "user", content: title }, { role: "assistant", content: "Private project-lane fixture." }] };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(row), { flag: "wx" });
  }
}

export async function showProjectGrouping(page) {
  await closeMenus(page);
  const side = page.locator('[data-tour="sessions-sidebar"]').first();
  await side.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Grouping/ }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("menuitemradio", { name: "Project", exact: true }).click();
  await closeMenus(page);
  return side;
}

export async function projectLaneRows(ctx) {
  const { page, project, second } = ctx;
  seedLaneChats(ctx);
  const listed = await api(page, { path: "/api/projects" });
  let beta = listed.projects.find(item => item.path === second);
  if (!beta) {
    const created = await api(page, { method: "POST", path: "/api/projects/create", body: { name: "Beta notes", path: second } });
    assert.equal(created.ok, true, "Private second project must be registered");
    beta = created.project;
  }
  await page.reload();
  await waitForShell(page);
  const sessions = await api(page, { path: "/api/sessions" });
  assert.equal(sessions.find(row => row.title === ACME)?.cwd, project, "First chat carries its actual folder");
  assert.equal(sessions.find(row => row.title === BETA)?.cwd, second, "Second chat carries its actual folder");
  assert.ok(sessions.some(row => row.title === LEGACY && !row.cwd), "Legacy fixture stays unfiled");
  const back = page.getByText("All projects", { exact: true }).first();
  if (await back.isVisible()) await back.click();
  const side = await showProjectGrouping(page);
  await side.getByText(BETA, { exact: true }).waitFor();
  await side.getByText(ACME, { exact: true }).waitFor();
  await side.getByText(LEGACY, { exact: true }).waitFor();
  const betaRow = side.getByText(beta.name, { exact: true }).first();
  assert.ok(await betaRow.isVisible(), "Named project is visibly grouped");
  await betaRow.click();
  await side.getByText("All projects", { exact: true }).waitFor();
  await side.getByText(BETA, { exact: true }).waitFor();
  assert.equal(await side.getByText(ACME, { exact: true }).count(), 0, "Project entry excludes other-project chats");
  assert.equal(await side.getByText(LEGACY, { exact: true }).count(), 0, "Unfiled chat is not reassigned to the project");
  await side.getByText("All projects", { exact: true }).click();
  await side.getByText(ACME, { exact: true }).waitFor();
  await side.getByText(LEGACY, { exact: true }).waitFor();
  if (process.env.PROOF_SHOTS) await page.screenshot({ path: path.join(process.env.PROOF_SHOTS, "f048-project-lanes.png") });
  return verdict("F-048", "sidebar list", "Chats grouped by project", true, {
    pass: "Two folder-backed chats group under their real projects; entering the second excludes the first and the unfiled chat; All projects restores them."
  });
}
