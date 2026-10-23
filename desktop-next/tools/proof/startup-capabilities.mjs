// Optional capability reads must not make an otherwise usable startup fail.
import assert from "node:assert/strict";
import fs from "node:fs";
import { launchVanta, waitForShell } from "../vanta-app.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";

globalThis.__vantaKeepRoot = true;
const model = await startScriptedModel();
const ctx = await launchVanta({ hidden: true, extraEnv: { VANTA_OPENAI_BASE_URL: model.url } });
const checks = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };

try {
  await waitForShell(ctx.page);
  const probes = await ctx.page.evaluate(() => ({
    plugins: typeof window.desktopBridge?.desktopPluginsRoot,
    remoteDisplay: typeof window.desktopBridge?.getRemoteDisplayReason,
  }));
  const errors = ctx.errors.filter(error => /unsupported: (desktopPluginsRoot|getRemoteDisplayReason)/.test(error));
  fs.writeFileSync(`${ctx.root}/startup-baseline.json`, JSON.stringify({ probes, errors }, null, 2));
  check("Startup has no unsupported optional-capability errors", errors.length === 0);
  check("Unavailable optional reads are absent, not rejecting functions", probes.plugins === "undefined" && probes.remoteDisplay === "undefined");
  await ctx.page.getByTestId("nav-home").click();
  const input = ctx.page.getByTestId("home-composer-input");
  await input.fill("Hello Vanta");
  await input.press("Enter");
  await ctx.page.getByText("Scripted turn finished.", { exact: true }).first().waitFor();
  check("The actual composer sends and displays a model reply", model.requests.length === 1);
  check("Startup and chat have no renderer errors", ctx.errors.length === 0);
  await ctx.shot(`${ctx.root}/startup-chat.png`);
  await ctx.page.evaluate(() => { location.hash = "#/capabilities?tab=plugins"; });
  const rescan = ctx.page.getByRole("button", { name: /rescan/i });
  await rescan.waitFor();
  check("The unavailable plugin-folder control is absent from the real page",
    await ctx.page.getByRole("button", { name: "Open Desktop plugins folder", exact: true }).count() === 0);
  await rescan.focus();
  check("The remaining shared control is keyboard reachable", await rescan.evaluate(el => el === document.activeElement));
  check("Opening Plugins does not revive either startup error",
    ctx.errors.filter(error => /unsupported: (desktopPluginsRoot|getRemoteDisplayReason)/.test(error)).length === 0);
  await ctx.shot(`${ctx.root}/plugins.png`);
  const report = { root: ctx.root, checks, probes, rendererErrors: ctx.errors, modelRequests: model.requests.length };
  fs.writeFileSync(`${ctx.root}/startup-capabilities.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  await ctx.shot(`${ctx.root}/failure.png`).catch(() => undefined);
  process.stderr.write(`${JSON.stringify({ root: ctx.root, checks, error: String(error), log: error.log, rendererErrors: ctx.errors })}\n`);
  throw error;
} finally {
  await ctx.close();
  await model.close();
}
