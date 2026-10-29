// Isolated source-app recovery check; never targets an installed app or owner profile.
import assert from "node:assert/strict";
import fs from "node:fs";

import { commandOf, descendants } from "../done-path/harness.mjs";
import { launchVanta, waitForShell } from "../vanta-app.mjs";
import { ensureChat } from "./kit.mjs";

globalThis.__vantaKeepRoot = true;
const ctx = await launchVanta({ hidden: true });
const checks = [];
const recoveries = [];
const health = ctx.page.getByTestId("statusbar-gateway-health");
const editor = ctx.page.locator('[data-vp="composer-input"]').first();
const runtimePids = () => descendants(ctx.app.process().pid).filter(pid => {
  const command = commandOf(pid);
  return /cli\.(mjs|ts)/.test(command) && /desktop/.test(command);
});
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const status = async () => (await health.innerText()).replace(/\s+/g, " ").trim();
async function until(read, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for isolated runtime recovery");
}
function stopRuntime() {
  const pids = runtimePids();
  assert.equal(pids.length, 1, "Exactly one runtime under this test Electron process");
  assert.ok(descendants(ctx.app.process().pid).includes(pids[0]), "Still a test-app child before stopping");
  process.kill(pids[0], "SIGKILL");
  return pids[0];
}
async function chat(text) {
  const reply = ctx.page.getByText("Hello from the proof model", { exact: false });
  const before = await reply.count();
  await editor.fill(text);
  await editor.press("Enter");
  await until(async () => await reply.count() > before, 30000);
}
try {
  await waitForShell(ctx.page);
  await ensureChat(ctx.page);
  check("Healthy baseline says Vanta ready", /Vanta ready/i.test(await status()));
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    const killed = stopRuntime();
    const replacement = await until(() => runtimePids().find(pid => pid !== killed));
    await chat(`Recovery probe ${attempt}`);
    recoveries.push({ attempt, killed, replacement, ms: Date.now() - started });
  }
  check("Three allowed automatic recoveries answer real UI chats", recoveries.length === 3);
  const stoppedAt = Date.now();
  const stoppedPid = stopRuntime();
  await until(async () => /offline/i.test(await status()), 5000);
  const offlineAfterMs = Date.now() - stoppedAt;
  check("Status stops claiming ready within five seconds", !/ready/i.test(await status()));
  check("Exhausted limit leaves no test runtime running", runtimePids().length === 0);
  const restart = ctx.page.getByRole("button", { name: "Restart Vanta", exact: true });
  await restart.waitFor({ state: "visible", timeout: 5000 });
  check("Offline composer remains available for drafts", await editor.isEditable());
  await editor.fill("Draft retained through Restart");
  await ctx.shot(`${ctx.root}/01-stopped.png`);
  const restartedAt = Date.now();
  await restart.click();
  await until(async () => /Vanta ready/i.test(await status()), 15000);
  const restartAfterMs = Date.now() - restartedAt;
  check("Restart returns exactly one test runtime", runtimePids().length === 1);
  check("Restart dismisses the stopped toast", !await restart.isVisible());
  check("Restart preserves the unsent draft", (await editor.innerText()).trim() === "Draft retained through Restart");
  await chat("Post-Restart acceptance reply");
  check("A fresh post-Restart chat receives a reply", true);
  await ctx.shot(`${ctx.root}/02-recovered.png`);
  const report = { root: ctx.root, checks, recoveries, stoppedPid, offlineAfterMs, restartAfterMs, rendererErrors: ctx.errors };
  fs.writeFileSync(`${ctx.root}/dn31-restart.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  await ctx.shot(`${ctx.root}/failure.png`).catch(() => undefined);
  process.stderr.write(`${JSON.stringify({ root: ctx.root, checks, recoveries, status: await status().catch(() => "unavailable"), error: String(error) })}\n`);
  throw error;
} finally { await ctx.close(); }
