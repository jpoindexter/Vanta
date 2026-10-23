// Real chat -> workflow executor -> UI pause/cancel -> safe checkpoint, in a private profile only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { launchVanta, waitForShell } from "../vanta-app.mjs";
import { startScriptedModel } from "../done-path/scripted-model.mjs";
import { sendText } from "../done-path/lib.mjs";

globalThis.__vantaKeepRoot = true;
const checks = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
const model = await startScriptedModel();
const cancelling = process.argv.includes("--cancel");
const action = cancelling ? "Cancel" : "Pause";
const stopped = cancelling ? "Cancelled" : "Paused";
const status = cancelling ? "cancelled" : "paused";
const graphId = "prepare-next-week-review";
const runId = "dn22-live-pause";
const spec = {
  id: graphId, title: "Prepare next week review", start: "wait",
  nodes: [
    { id: "wait", type: "action", tool: "shell_cmd", args: { command: "node checkpoint-gate.cjs", timeout_ms: 30000 }, sideEffect: true, approval: "never" },
    { id: "write", type: "action", tool: "write_file", args: { path: "should-not-run.txt", content: "Resumed at the checkpoint" }, sideEffect: true, approval: "never" }
  ],
  transitions: [{ from: "wait", to: "write", type: "next" }]
};
const ctx = await launchVanta({ hidden: true, extraEnv: { VANTA_OPENAI_BASE_URL: model.url, VANTA_LOCAL_FULL_TOOLS: "1" },
  seed({ project, vantaHome }) {
    fs.mkdirSync(vantaHome, { recursive: true });
    fs.writeFileSync(path.join(vantaHome, "permissions.tsv"), ["compose_workflow", "shell_cmd", "write_file"].map(tool => `allow\t${tool}\t\t${project}\n`).join(""), { flag: "wx" });
    fs.writeFileSync(path.join(project, "checkpoint-gate.cjs"), "require('node:fs').appendFileSync('checkpoint-started', 'started\\n'); setTimeout(() => {}, 20000);\n", { flag: "wx" });
  }
});
const { page } = ctx;
const api = () => page.evaluate(id => window.desktopBridge.api({ path: `/api/workflow-runs/${id}` }), runId);
const library = () => page.evaluate(() => window.desktopBridge.api({ path: "/api/runs" }));

async function startRun() {
  await page.getByTestId("nav-home").click();
  const input = page.getByTestId("home-composer-input");
  await input.fill("Earlier finished request");
  await input.press("Enter");
  await page.getByText("Scripted turn finished.", { exact: true }).first().waitFor();
  await sendText(page, `Run this private checkpoint check [[call compose_workflow ${JSON.stringify({ spec, run_id: runId })}]]`);
  const deadline = Date.now() + 30000;
  while (!fs.existsSync(path.join(ctx.project, "checkpoint-started")) && Date.now() < deadline) await page.waitForTimeout(150);
  check("The actual workflow tool reaches its first executing action", fs.existsSync(path.join(ctx.project, "checkpoint-started")));
  check("The workflow was requested by the local model from chat", model.requests.some(request => request.toolCall === "compose_workflow"));
  check(`The real run is active before ${action}`, (await api()).status === "running");
}

async function pauseRun() {
  await page.getByTestId("nav-artifacts").click();
  await page.getByRole("button", { name: "Past work", exact: true }).click();
  const row = page.locator('[data-slot="workflow-row"]').filter({ hasText: graphId });
  const pause = row.getByRole("button", { name: `${action}: ${graphId}`, exact: true });
  await pause.waitFor();
  const listed = await library();
  check("Past work retains the earlier completed turn", listed.some(run => run.prompt === "Earlier finished request" && run.status === "done"));
  check("The active turn is absent from the completed-run API", !listed.some(run => run.prompt.startsWith("Run this private checkpoint check")));
  check("The active workflow has no misleading Past work row", await page.locator('[data-slot="run-row"]').filter({ hasText: "Run this private checkpoint check" }).count() === 0);
  check("Workflow rows have no card outline", await row.evaluate(el => getComputedStyle(el).borderTopWidth === "0px"));
  await ctx.resize(800, 900);
  check("Workflow summary and actions fit the narrow window", await row.evaluate(el => el.scrollWidth <= el.clientWidth));
  await ctx.shot(`${ctx.root}/01-workflow-narrow.png`);
  await pause.focus();
  check(`${action} is reachable by keyboard`, await pause.evaluate(el => el === document.activeElement));
  await pause.press("Enter");
  await row.getByText(`${action} requested`, { exact: false }).waitFor();
  check(`The pending request is shown without claiming ${stopped}`, (await api()).status === "running" && await pause.isDisabled());
  await ctx.shot(`${ctx.root}/02-pause-requested.png`);
  await row.getByText(new RegExp(`^${stopped} ·`)).waitFor({ timeout: 35000 });
  const run = await api();
  check("The real executor stops at the next checkpoint", run.status === status && run.terminal?.state === status
    && run.terminal?.reason === (cancelling ? "operator cancellation requested" : "operator pause requested"));
  check("The first action completed once and the second never ran", run.nodes.length === 1 && run.nodes[0].id === "wait" && run.nodes[0].attempts === 1 && !fs.existsSync(path.join(ctx.project, "should-not-run.txt")));
  if (cancelling) {
    check("Cancellation does not tell the agent to retry", run.terminal?.recoveryAction === "Review completed steps before starting a new workflow.");
    check("Cancelled work has no automatic Resume action", run.controls.length === 0
      && await row.getByRole("button", { name: `Resume: ${graphId}` }).count() === 0);
    check("Cancellation is not presented as successful Done", await row.getByText(/^Done ·/).count() === 0);
    check("The first effect was neither killed nor duplicated", fs.readFileSync(path.join(ctx.project, "checkpoint-started"), "utf8") === "started\n");
  } else check("The paused state exposes the server's recovery action", await row.getByRole("button", { name: `Resume: ${graphId}` }).isVisible());
  await page.waitForFunction(async () => (await window.desktopBridge.api({ path: "/api/runs" })).some(run => run.provenance === "captured" && run.prompt.startsWith("Run this private checkpoint check")));
  await page.getByRole("button", { name: "Refresh artifacts", exact: true }).click();
  const finished = page.locator('[data-slot="run-row"]').filter({ hasText: "Run this private checkpoint check" });
  await finished.waitFor();
  check("Existing Refresh lists the chat only after its final receipt", await finished.getByText(/^Done ·/).isVisible() && (await api()).status === status);
  await ctx.resize(1440, 900);
  await ctx.shot(`${ctx.root}/03-paused-workflow.png`);
  return run;
}

async function resumeRun() {
  const row = page.locator('[data-slot="workflow-row"]').filter({ hasText: graphId });
  const resume = row.getByRole("button", { name: `Resume: ${graphId}`, exact: true });
  await resume.focus();
  await resume.press("Enter");
  await row.getByText(/^Done ·/).waitFor({ timeout: 35000 });
  const run = await api();
  check("Resume reaches a real successful terminal result", run.status === "done" && run.terminal?.state === "succeeded");
  check("Confirmed first effect is not replayed", fs.readFileSync(path.join(ctx.project, "checkpoint-started"), "utf8") === "started\n" && run.nodes.find(node => node.id === "wait")?.attempts === 1);
  check("The missing second effect executes exactly once", fs.readFileSync(path.join(ctx.project, "should-not-run.txt"), "utf8") === "Resumed at the checkpoint" && run.nodes.find(node => node.id === "write")?.attempts === 1);
  check("Done no longer offers Resume", await row.getByRole("button", { name: `Resume: ${graphId}`, exact: true }).count() === 0);
  check("Resume does not ask the model to reconstruct the graph", model.requests.length === 3);
  await ctx.shot(`${ctx.root}/04-resumed-workflow.png`);
  return run;
}

try {
  await waitForShell(page);
  await startRun();
  const run = await pauseRun();
  const resumed = cancelling ? undefined : await resumeRun();
  const report = { root: ctx.root, checks, run, resumed, modelRequests: model.requests, rendererErrors: ctx.errors };
  fs.writeFileSync(`${ctx.root}/dn22-workflow-${cancelling ? "cancel" : "pause"}.json`, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  await ctx.shot(`${ctx.root}/failure.png`).catch(() => undefined);
  process.stderr.write(`${JSON.stringify({ root: ctx.root, checks, error: String(error), log: error.log, modelRequests: model.requests })}\n`);
  throw error;
} finally {
  await ctx.close();
  await model.close();
}
