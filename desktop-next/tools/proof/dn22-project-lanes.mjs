// Only F-048: shares the same implementation used by the main reachability report.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { launchVanta, waitForShell } from "../vanta-app.mjs";
import { installNativeStubs, makeSecondProject } from "./native-stubs.mjs";
import { projectLaneRows } from "./project-lanes.mjs";
import { results } from "./kit.mjs";

globalThis.__vantaKeepRoot = true;
const ctx = await launchVanta({ hidden: true });
process.env.PROOF_SHOTS = ctx.root;
async function createProject() {
  const folder = path.join(ctx.root, "project", "studio-notes");
  fs.mkdirSync(folder);
  await installNativeStubs(ctx, { pickFolder: folder, downloadDir: ctx.root });
  await ctx.page.mouse.move(1000, 800);
  await ctx.page.waitForTimeout(200);
  const add = ctx.page.getByRole("button", { name: "New project", exact: true });
  assert.equal(await add.evaluate(el => getComputedStyle(el).opacity), "1", "New project is visible without hover");
  await add.focus();
  await add.press("Enter");
  const dialog = ctx.page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Skunkworks").fill("Studio notes");
  await dialog.getByRole("button", { name: "Add folder", exact: true }).click();
  await dialog.getByText(folder, { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const listed = await ctx.page.evaluate(() => window.desktopBridge.api({ path: "/api/projects" }));
  assert.ok(listed.projects.some(project => project.name === "Studio notes" && project.path === folder));
  await ctx.page.screenshot({ path: path.join(ctx.root, "f050-created-project.png") });
  results.set("F-050", { id: "F-050", area: "sidebar list", label: "New project from sidebar",
    result: "PASS", note: "Visible at rest; keyboard opens the existing dialog; name/folder create a real private project." });
}
try {
  await waitForShell(ctx.page);
  assert.equal(await projectLaneRows({ ...ctx, second: makeSecondProject(ctx.root) }), true);
  assert.equal(results.get("F-048")?.result, "PASS");
  await createProject();
  const report = { root: ctx.root, rows: [...results.values()], rendererErrors: ctx.errors };
  fs.writeFileSync(`${ctx.root}/f048-project-lanes.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  await ctx.shot(`${ctx.root}/f048-failure.png`).catch(() => undefined);
  process.stderr.write(`${JSON.stringify({ root: ctx.root, error: String(error), log: error.log })}\n`);
  throw error;
} finally { await ctx.close(); }
