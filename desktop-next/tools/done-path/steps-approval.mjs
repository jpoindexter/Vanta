// Steps a-g of the done criterion: approval card, Always allow, restart, new chat, other project,
// one-way door, and the deploy/production path-text false positive.
import fs from "node:fs";
import path from "node:path";

import { ORIGINAL_BRIEF, kernelPids, killKernel, killLeftovers, launchApp, leftoverProcesses, readPermissions } from "./harness.mjs";
import { cardInfo, cardsSeen, clickCard, newChat, installApprovalTap, latestApproval, sendText, settle, sleep, waitFinished, waitForShell, waitOutcome, watchApprovals } from "./lib.mjs";

const EDIT_BRIEF = (from, to) => `[[call edit_file ${JSON.stringify({ path: "brief.md", old_string: from, new_string: to })}]]`;
const LS_STEPS = '[[call shell_cmd {"command":"git status --short"}]] [[call shell_cmd {"command":"ls"}]]';
const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");
const shot = (ctx, name) => ctx.shot(name);

export async function openApp(ctx, project) {
  ctx.cur = await launchApp({ box: ctx.box, project, modelUrl: ctx.model.url });
  await waitForShell(ctx.cur.page);
  await settle(ctx.cur.page, 1500);
  await watchApprovals(ctx.cur.page);
  await installApprovalTap(ctx.cur.app);
  return ctx.cur;
}

/** a1: scripted turn with gated tool -> live steps, then a card naming the exact action. */
export async function stepCard(ctx) {
  const { page } = await openApp(ctx, ctx.box.projectA);
  await newChat(page);
  await sendText(page, `update the brief ${LS_STEPS} ${EDIT_BRIEF("# Local brief", "# Approved edit")}`);
  const outcome = await waitOutcome(page);
  if (outcome !== "card") throw new Error(`expected an approval card, got ${outcome}`);
  const stepRows = await page.locator("[data-vp='step'], [data-vp='running-line']").count();
  const card = await cardInfo(page);
  const payload = await latestApproval(ctx.cur.app);
  await shot(ctx, "a1-card");
  ctx.evidence("a1-approval-payload", payload);
  ctx.evidence("a1-card", card);
  const request = payload?.request ?? {};
  const failures = [];
  if (stepRows < 1) failures.push("no live tool step row visible while the turn waited");
  if (!card.text.includes("brief.md")) failures.push("card does not name brief.md");
  if (payload?.toolName !== "edit_file" || request.kind !== "file_edit") failures.push(`server payload is ${payload?.toolName}/${request.kind}, expected edit_file/file_edit`);
  if (!card.buttons.some((b) => /Always allow/.test(b))) failures.push("card has no Always option for an ordinary edit");
  if (failures.length) throw new Error(failures.join("; "));
  ctx.probe("a2", "card wording matches the tool (not 'Run a command' for an edit)", !/Run a command|shell command/i.test(card.text), { cardText: card.text.slice(0, 220) });
  return { stepRows, card: card.text.slice(0, 200), payloadKind: request.kind };
}

/** b: Always allow -> the tool runs, and a rule scoped to project A lands in permissions.tsv. */
export async function stepAlways(ctx) {
  const { page } = ctx.cur;
  const before = readPermissions(ctx.box);
  await clickCard(page, /Always allow/);
  if (!(await waitFinished(page))) throw new Error("turn did not finish after Always allow");
  await settle(page, 600);
  const after = readPermissions(ctx.box);
  ctx.evidence("b-permissions", { before, after });
  await shot(ctx, "b-after-always");
  const failures = [];
  if (!read(ctx.box.projectA, "brief.md").startsWith("# Approved edit")) failures.push("edit_file did not run after Always allow");
  const expected = `allow\tedit_file\t\t${ctx.box.projectA}`;
  if (!after.split("\n").includes(expected)) failures.push(`permissions.tsv lacks a rule scoped to project A (${JSON.stringify(after)})`);
  const collapsed = await page.evaluate(() => /(Used|Ran) \d+ (tools?|commands?)/.test(document.body.innerText));
  if (!collapsed) failures.push("no collapsed 'Used/Ran N tools' row in the thread");
  if (failures.length) throw new Error(failures.join("; "));
  return { before, after };
}

/** c: quit the app with every process, relaunch on the same userData and VANTA_HOME. */
export async function stepRestart(ctx) {
  const { app, pid } = ctx.cur;
  const before = ctx.descendants(pid).map((p) => ({ pid: p, command: ctx.commandOf(p) }));
  await app.close().catch(() => undefined);
  await sleep(2500);
  const survivors = before.filter((p) => ctx.alive([p.pid]).length);
  const kernelStayed = kernelPids(ctx.box).length > 0;
  const appSurvivors = survivors.filter((p) => !/vanta-kernel/.test(p.command));
  const leftovers = leftoverProcesses(ctx.box);
  ctx.evidence("c-processes", { before, survivors, appSurvivors, kernelStayed, leftovers });
  for (const p of survivors) { try { process.kill(p.pid, "SIGKILL"); } catch { /* already gone */ } }
  // The kernel is a detached daemon by design (kernel-launcher spawns it detached); stop it so the relaunch is a cold start.
  killLeftovers(ctx.box);
  await sleep(500);
  fs.writeFileSync(path.join(ctx.box.projectA, "brief.md"), ORIGINAL_BRIEF);
  await openApp(ctx, ctx.box.projectA);
  const rules = readPermissions(ctx.box);
  const failures = [];
  if (appSurvivors.length || leftovers.length) failures.push(`app processes survived quit: ${[...appSurvivors.map((p) => `${p.pid} ${p.command}`), ...leftovers].join(", ")}`);
  ctx.probe("c2", "no process at all outlives quit (the kernel daemon is detached by design)", !kernelStayed, { kernelStayed });
  if (!rules.includes("edit_file")) failures.push("the saved rule is gone after restart");
  if (failures.length) throw new Error(failures.join("; "));
  return { processesBefore: before.length, kernelOutlivedQuit: kernelStayed, rulesAfterRestart: rules };
}

/** d: a NEW chat in project A, same tool call -> no card, the tool runs. */
export async function stepNewChatNoAsk(ctx) {
  const { page } = ctx.cur;
  const requestsBefore = ctx.model.requests.length;
  await newChat(page);
  await sendText(page, `second chat ${EDIT_BRIEF("# Local brief", "# Approved edit")}`);
  const outcome = await waitOutcome(page);
  await shot(ctx, "d-new-chat");
  const first = ctx.model.requests[requestsBefore];
  const failures = [];
  if (outcome !== "finished") failures.push(`expected the turn to finish without asking, got ${outcome}`);
  if ((await cardsSeen(page)) !== 0) failures.push("an approval card was shown after restart");
  if (!read(ctx.box.projectA, "brief.md").startsWith("# Approved edit")) failures.push("edit did not run in the new chat");
  if ((first?.messageCount ?? 99) > 3) failures.push(`not a fresh chat (first request carried ${first?.messageCount} messages)`);
  if (failures.length) throw new Error(failures.join("; "));
  return { outcome, firstRequestMessages: first?.messageCount };
}

/** g: editing deploy-notes.md and production-plan.md with edit_file does not trip the one-way ask. */
export async function stepPathText(ctx) {
  const { page } = ctx.cur;
  const calls = ["deploy-notes.md", "production-plan.md"].map((file) =>
    `[[call edit_file ${JSON.stringify({ path: file, old_string: "plain text", new_string: "edited text" })}]]`).join(" ");
  const cardsBefore = await cardsSeen(page);
  await newChat(page);
  await sendText(page, `path text ${calls}`);
  const outcome = await waitOutcome(page);
  await shot(ctx, "g-path-text");
  const failures = [];
  if (outcome !== "finished") failures.push(`expected no ask, got ${outcome}`);
  if ((await cardsSeen(page)) !== cardsBefore) failures.push("a card appeared for a file whose name contains deploy/production");
  for (const file of ["deploy-notes.md", "production-plan.md"]) {
    if (!read(ctx.box.projectA, file).includes("edited text")) failures.push(`${file} was not edited`);
  }
  if (failures.length) throw new Error(failures.join("; "));
  return { outcome };
}

/** f: a one-way action asks every time, with no Always option, even after Always for shell commands. */
export async function stepOneWay(ctx) {
  const { page } = ctx.cur;
  await newChat(page);
  await sendText(page, 'seed shell rule [[call shell_cmd {"command":"mkdir newdir"}]]');
  if ((await waitOutcome(page)) !== "card") throw new Error("mkdir did not ask, so the shell rule could not be seeded through the UI");
  await clickCard(page, /Always allow/);
  await waitFinished(page);
  const seeded = readPermissions(ctx.box);
  if (!seeded.includes("shell_cmd")) throw new Error(`Always on a shell command left no shell rule: ${JSON.stringify(seeded)}`);
  const cardsBefore = await cardsSeen(page);
  await newChat(page);
  await sendText(page, 'release [[call shell_cmd {"command":"npm publish --dry-run"}]]');
  const outcome = await waitOutcome(page);
  if (outcome !== "card") throw new Error(`one-way command did not ask after Always (${outcome})`);
  const card = await cardInfo(page);
  const payload = await latestApproval(ctx.cur.app);
  ctx.evidence("f-oneway-payload", payload);
  ctx.evidence("f-oneway-card", card);
  await shot(ctx, "f-one-way");
  await clickCard(page, "Reject");
  await settle(page, 1500);
  const failures = [];
  if (card.buttons.some((b) => /Always/.test(b))) failures.push(`one-way card still offers Always (${card.buttons.join(", ")})`);
  if (!/one-way|can't be undone/i.test(card.text)) failures.push("card does not give the one-way reason");
  if (payload?.request?.canRemember !== false && payload?.request?.fresh !== true) failures.push("server payload still allows a saved rule");
  if ((await cardsSeen(page)) <= cardsBefore) failures.push("no card counted");
  if (failures.length) throw new Error(failures.join("; "));
  await probeGitPush(ctx);
  return { seeded, reason: card.text.slice(0, 200) };
}

/** Probe: plain `git push` is irreversible per the kernel's own wording; does Always on shell still skip the ask? */
async function probeGitPush(ctx) {
  const { page } = ctx.cur;
  await newChat(page);
  await sendText(page, 'push [[call shell_cmd {"command":"git push origin main"}]]');
  const outcome = await waitOutcome(page);
  const note = { outcome, card: outcome === "card" ? (await cardInfo(page)).text.slice(0, 200) : null };
  if (outcome === "card") await clickCard(page, "Reject").catch(() => undefined);
  ctx.probe("f2", "git push (irreversible) still asks after Always for shell commands", outcome === "card", note);
}

/** e: switch to project B inside the app; the same tool call asks again and nothing was saved for B. */
export async function stepOtherProject(ctx) {
  const { page, app } = ctx.cur;
  const before = readPermissions(ctx.box);
  await app.evaluate(({ dialog }, dir) => {
    // Harness shim: the folder chooser is a native dialog the test cannot click.
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, ctx.box.projectB);
  // The run pins one kernel port (VANTA_KERNEL_URL) to stay off the owner's 7788, so project B needs alpha's kernel gone.
  killKernel(ctx.box);
  await sleep(800);
  await openDefaultProjectFolder(page);
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await switchSettled(ctx);
  await watchApprovals(ctx.cur.page);
  const page2 = ctx.cur.page;
  await newChat(page2);
  await sendText(page2, `other project ${EDIT_BRIEF("# Local brief", "# Approved edit")}`);
  const outcome = await waitOutcome(page2);
  if (outcome !== "card") throw new Error(`project B did not ask (${outcome}): the rule leaked across projects`);
  const card = await cardInfo(page2);
  const payload = await latestApproval(ctx.cur.app);
  ctx.evidence("e-projectB-payload", payload);
  await shot(ctx, "e-project-b-card");
  await clickCard(page2, "Reject");
  await settle(page2, 1500);
  const after = readPermissions(ctx.box);
  const failures = [];
  if (read(ctx.box.projectB, "brief.md") !== ORIGINAL_BRIEF) failures.push("project B brief.md was changed after Reject");
  if (after.includes(ctx.box.projectB)) failures.push("a rule for project B appeared without being saved");
  if (!card.text.includes("brief.md")) failures.push("project B card does not name brief.md");
  if (failures.length) throw new Error(failures.join("; "));
  ctx.evidence("e-permissions", { before, after });
  return { card: card.text.slice(0, 160) };
}

async function switchSettled(ctx) {
  const { page } = ctx.cur;
  // The shell reloads after the runtime restarts in the chosen folder.
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await waitForShell(page);
  await settle(page, 2500);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await settle(page, 500);
  const chip = await page.locator("[data-slot='statusbar'], footer").first().innerText().catch(() => "");
  if (!/bravo/.test(await page.evaluate(() => document.body.innerText))) throw new Error(`status bar does not show project bravo (${chip.slice(0, 80)})`);
}

/** Settings > Sessions > Default project folder, waiting for the pane to finish loading before each click. */
async function openDefaultProjectFolder(page) {
  await page.getByTestId("titlebar-settings").click();
  await settle(page, 1500);
  const item = page.getByRole("button", { name: /Default project fol/ });
  for (let attempt = 0; attempt < 3 && !(await item.isVisible().catch(() => false)); attempt += 1) {
    await page.getByRole("button", { name: "Sessions" }).last().click();
    await settle(page, 1200);
  }
  await item.click();
}
