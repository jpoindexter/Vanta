// Actual source UI and project handoff, with private data and native dialogs stubbed.
import assert from "node:assert/strict";
import fs from "node:fs";

import { launchVanta, waitForShell } from "../vanta-app.mjs";
import { goHome } from "./kit.mjs";
import { installNativeStubs, makeSecondProject } from "./native-stubs.mjs";

globalThis.__vantaKeepRoot = true;
const ctx = await launchVanta({ hidden: true });
const { page } = ctx;
const checks = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const api = input => page.evaluate(request => window.desktopBridge.api(request), input);
try {
  await waitForShell(page);
  await page.getByRole("tab", { name: "Chats", exact: true }).waitFor();
  check("Sidebar pane is named Chats", await page.getByRole("tab", { name: "Chats", exact: true }).isVisible());
  check("Search uses chat language", await page.getByPlaceholder("Search chats…", { exact: true }).isVisible());
  const schedules = page.getByTestId("sidebar-group-name").filter({ hasText: /^Schedules$/ }).first();
  await schedules.waitFor();
  check("Schedule heading is sentence case, not all caps", await schedules.evaluate(el => getComputedStyle(el).textTransform === "none"));
  const second = makeSecondProject(ctx.root);
  await installNativeStubs(ctx, { confirm: true, pickFolder: second, downloadDir: ctx.root });
  for (const [name, folder] of [["Acme site", ctx.project], ["Beta notes", second]]) {
    const result = await api({ method: "POST", path: "/api/projects/create", body: { name, path: folder } });
    check(`${name} registered in the isolated backend`, result.ok === true);
  }
  await goHome(page);
  await page.reload();
  await waitForShell(page);
  await page.getByTestId("home-project-chip").filter({ hasText: "Beta notes" }).waitFor();
  check("Home exposes both registered project chips", await page.getByTestId("home-project-chip").count() === 2);
  await page.getByTestId("home-composer-project").click();
  check("Project picker exposes both projects", await page.getByRole("menuitemradio").count() === 2);
  await page.getByRole("menuitemradio", { name: "Beta notes project", exact: true }).click();
  check("Chosen project is reflected by the picker", /Beta notes/.test(await page.getByTestId("home-composer-project").innerText()));
  await page.screenshot({ path: `${ctx.root}/01-project-choice.png` });
  await page.getByTestId("home-composer-input").fill("Start this chat in Beta notes");
  await page.getByTestId("home-composer-send").click();
  await page.getByText("Hello from the proof model", { exact: false }).first().waitFor({ timeout: 30000 });
  const selected = await page.evaluate(() => window.desktopBridge.settings.getDefaultProjectDir());
  check("Submission moved the actual runtime to Beta notes", fs.realpathSync(selected.dir) === fs.realpathSync(second));
  check("Bottom status names the new project", /beta-notes/i.test(await page.getByTestId("statusbar-workspace-cwd").innerText()));
  check("Original instruction reached the new chat", await page.getByText("Start this chat in Beta notes", { exact: true }).first().isVisible());
  await page.screenshot({ path: `${ctx.root}/02-project-chat.png` });
  const report = { root: ctx.root, checks, project: selected.dir, rendererErrors: ctx.errors };
  fs.writeFileSync(`${ctx.root}/dn34-project-chat.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  await page.screenshot({ path: `${ctx.root}/failure.png` }).catch(() => undefined);
  process.stderr.write(`${JSON.stringify({ root: ctx.root, checks, error: String(error) })}\n`);
  throw error;
} finally { await ctx.close(); }
