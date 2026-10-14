// Done-path proof, one run: drives the real Electron shell + real Vanta server, in isolated state,
// against a scripted local model, through the slice-1 done criterion (steps a-i). Prints one JSON
// result and writes evidence (screenshots, approval payloads, permissions file) to --out.
//
//   node tools/done-path/run.mjs --out docs/proofs/done-path/run-01 [--no-shots] [--keep]
import fs from "node:fs";
import path from "node:path";

import { commandOf, descendants, killLeftovers, makeSandbox, readPermissions, stillAlive } from "./harness.mjs";
import { startScriptedModel } from "./scripted-model.mjs";
import * as approval from "./steps-approval.mjs";
import * as ui from "./steps-ui.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = path.resolve(option("--out", path.join(import.meta.dirname, "..", "..", "docs", "proofs", "done-path", `run-${Date.now()}`)));
const SETTLE_TIMEOUT_MS = 10_000;

/** The ordered criterion steps. `probe` entries are recorded by the steps themselves and never gate the verdict. */
const STEPS = [
  ["a1", "chat in project A: live tool steps, then a card naming the exact action", approval.stepCard],
  ["b", "Always allow runs the tool and saves a rule scoped to project A", approval.stepAlways],
  ["c", "quit every process, relaunch with the same userData and VANTA_HOME", approval.stepRestart],
  ["d", "new chat in project A, same tool call: no card, tool runs", approval.stepNewChatNoAsk],
  ["g", "edit_file on deploy-notes.md and production-plan.md does not ask", approval.stepPathText],
  ["f", "one-way command asks with no Always and a reason, even after Always for shell", approval.stepOneWay],
  ["e", "project B (switched in the app) still asks; nothing saved for B", approval.stepOtherProject],
  ["h1", "paste 200 KB: keystrokes stay under 250 ms, draft kept, message sent", ui.stepLargePaste],
  ["h2", "paste an image: no freeze, draft kept", ui.stepImagePaste],
  ["i1", "1440x900: full sidebar, no horizontal overflow", (ctx) => ui.stepResponsive(ctx, 1440)],
  ["i2", "1100x800: 56px rail, no horizontal overflow", (ctx) => ui.stepResponsive(ctx, 1100)],
  ["i3", "800x700: sidebar is a drawer that opens and closes, no overflow", (ctx) => ui.stepResponsive(ctx, 800)],
];

function makeContext(box, model) {
  fs.mkdirSync(outDir, { recursive: true });
  const ctx = {
    box, model, cur: null, probes: [],
    descendants, commandOf, alive: stillAlive,
    evidence: (name, value) => fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`),
    probe: (id, title, ok, detail) => ctx.probes.push({ id, title, status: ok ? "PASS" : "FAIL", detail }),
    shot: async (name) => {
      if (flag("--no-shots")) return;
      await ctx.cur?.page.screenshot({ path: path.join(outDir, `${name}.png`) }).catch(() => undefined);
    },
  };
  return ctx;
}

/** A leftover card from a failed step must not cascade into the next one. */
async function clearPendingCard(ctx) {
  const page = ctx.cur?.page;
  if (!page) return;
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.keyboard.press("Escape").catch(() => undefined);
  const card = page.locator("[data-vp='approval-card']").first();
  if (await card.count().catch(() => 0)) {
    await card.getByRole("button", { name: "Reject" }).click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
  }
}

async function runStep(ctx, [id, title, fn]) {
  const started = Date.now();
  ctx.cur?.page.setDefaultTimeout(SETTLE_TIMEOUT_MS);
  try {
    const detail = await fn(ctx);
    return { id, title, status: "PASS", ms: Date.now() - started, detail };
  } catch (error) {
    await ctx.cur?.page.screenshot({ path: path.join(outDir, `FAIL-${id}.png`) }).catch(() => undefined);
    await clearPendingCard(ctx);
    return { id, title, status: "FAIL", ms: Date.now() - started, error: String(error.message ?? error).split("\n").slice(0, 3).join(" ").slice(0, 500) };
  }
}

async function main() {
  const box = await makeSandbox();
  const model = await startScriptedModel();
  const ctx = makeContext(box, model);
  const steps = [];
  try {
    for (const spec of STEPS) {
      steps.push(await runStep(ctx, spec));
      ctx.cur?.page.setDefaultTimeout(SETTLE_TIMEOUT_MS);
    }
  } finally {
    const errors = ctx.cur?.errors ?? [];
    ctx.evidence("final-permissions", { file: readPermissions(box) });
    await ctx.cur?.app.close().catch(() => undefined);
    await model.close();
    killLeftovers(box);
    if (!flag("--keep")) fs.rmSync(box.root, { recursive: true, force: true });
    const result = { sandbox: flag("--keep") ? box.root : "(removed)", steps, probes: ctx.probes, consoleErrors: errors.slice(0, 10), pass: steps.every((s) => s.status === "PASS") };
    ctx.evidence("result", result);
    console.log(JSON.stringify(result));
    process.exit(result.pass ? 0 : 1);
  }
}

await main();
