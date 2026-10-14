// Step p (V-018): the composer access-mode chip changes the mode the SERVER enforces, and it survives a restart.
// Real Electron shell, real Vanta server and kernel, scripted model. Run in project A after the approval steps.
import fs from "node:fs";
import path from "node:path";

import { killLeftovers } from "./harness.mjs";
import { newChat, sendText, settle, sleep, waitOutcome } from "./lib.mjs";
import { openApp } from "./steps-approval.mjs";

const CHIP = "[data-vp='chip-permission']";
const PROBE = "plan-probe.md";
const WRITE = `[[call write_file ${JSON.stringify({ path: PROBE, content: "written" })}]]`;
const settingsFile = (dir) => path.join(dir, ".vanta", "settings.local.json");
const savedMode = (dir) => {
  try { return JSON.parse(fs.readFileSync(settingsFile(dir), "utf8")).desktop?.accessMode ?? null; } catch { return null; }
};

const chipText = (page) => page.locator(CHIP).first().innerText().then((text) => text.trim());

async function waitChip(page, expected, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await chipText(page).catch(() => "")) === expected) return;
    await sleep(150);
  }
  throw new Error(`chip never read "${expected}" (reads "${await chipText(page).catch(() => "?")}")`);
}

async function pickMode(page, label) {
  await page.locator(CHIP).first().click();
  await page.getByRole("menuitemradio", { name: label }).click();
}

/** One scripted write turn. Returns what happened: a card, or a finished turn, and whether the file exists. */
async function tryWrite(ctx, dir, text) {
  const { page } = ctx.cur;
  const requestsBefore = ctx.model.requests.length;
  await newChat(page);
  await sendText(page, `${text} ${WRITE}`);
  const outcome = await waitOutcome(page);
  const file = path.join(dir, PROBE);
  const wrote = fs.existsSync(file);
  const toolResults = ctx.model.requests.slice(requestsBefore).map((r) => r.toolResult ?? "").filter(Boolean);
  return { outcome, wrote, toolResults };
}

async function rejectCard(ctx) {
  await ctx.cur.page.locator("[data-vp='approval-card']").first().getByRole("button", { name: "Reject" }).click();
  await settle(ctx.cur.page, 1200);
}

/** The microphone question the page itself can ask: granted for audio from the app page, never for camera. */
async function probeMedia(ctx) {
  const states = await ctx.cur.page.evaluate(async () => {
    const ask = async (name) => navigator.permissions.query({ name }).then((s) => s.state, (e) => `error: ${e.name}`);
    return { microphone: await ask("microphone"), camera: await ask("camera") };
  });
  ctx.probe("v022", "app page: microphone query granted, camera query not granted", states.microphone === "granted" && states.camera !== "granted", states);
}

async function restartApp(ctx, dir) {
  await ctx.cur.app.close().catch(() => undefined);
  await sleep(2500);
  killLeftovers(ctx.box);
  await sleep(500);
  await openApp(ctx, dir);
}

/** p: Manual (control) -> choose Plan in the chip -> the write tool does not run -> restart -> still Plan -> back to Manual. */
export async function stepPlanMode(ctx) {
  const dir = ctx.box.projectA;
  const { page } = ctx.cur;
  fs.rmSync(path.join(dir, PROBE), { force: true });
  await waitChip(page, "Ask each time");

  // Control: the same call under Manual is live (it asks, or runs). Without this a "refused" result proves nothing.
  const manual = await tryWrite(ctx, dir, "manual control");
  if (manual.outcome === "card") await rejectCard(ctx);
  if (manual.outcome === "timeout") throw new Error("Manual control turn neither asked nor finished");
  const live = manual.outcome === "card" || manual.wrote;
  fs.rmSync(path.join(dir, PROBE), { force: true });
  if (!live) throw new Error("control: under Manual the write tool neither asked nor ran, so Plan could not be told apart");

  await pickMode(ctx.cur.page, /^Plan/);
  await waitChip(ctx.cur.page, "Plan");
  const afterPick = savedMode(dir);
  const plan = await tryWrite(ctx, dir, "plan turn");
  await ctx.shot("p-plan");
  ctx.evidence("p-plan", { manual, plan, savedAfterPick: afterPick });
  const failures = [];
  if (afterPick !== "plan") failures.push(`.vanta/settings.local.json says ${JSON.stringify(afterPick)}, not plan`);
  if (plan.outcome !== "finished") failures.push(`Plan: expected the turn to finish without a card, got ${plan.outcome}`);
  if (plan.wrote) failures.push("Plan: the write tool ran and created the file");
  if (!plan.toolResults.some((text) => /plan mode/i.test(text))) failures.push("Plan: the model never got a plan-mode refusal back");
  if (failures.length) throw new Error(failures.join("; "));

  await restartApp(ctx, dir);
  await waitChip(ctx.cur.page, "Plan");
  await probeMedia(ctx);
  const again = await tryWrite(ctx, dir, "plan after restart");
  ctx.evidence("p-restart", { again, savedAfterRestart: savedMode(dir) });
  if (again.outcome !== "finished" || again.wrote) throw new Error(`after restart the chip said Plan but the server did not hold it (${again.outcome}, wrote=${again.wrote})`);

  // Leave the project as the other steps expect it.
  await pickMode(ctx.cur.page, /Ask each time/);
  await waitChip(ctx.cur.page, "Ask each time");
  const restored = savedMode(dir);
  if (restored !== "ask") throw new Error(`restoring Manual saved ${JSON.stringify(restored)}`);
  return { control: { outcome: manual.outcome, wrote: manual.wrote }, plan: { outcome: plan.outcome, wrote: plan.wrote }, afterRestart: { outcome: again.outcome, wrote: again.wrote }, saved: [afterPick, "plan", restored] };
}
