// Records real company payloads: boots the real desktop server in-process over a temp VANTA_HOME,
// drives hires, tickets, runs, reviews and a budget stop through the real routes (only the worker
// runtime is a stub), then writes every GET response and a few SSE frames as JSON fixtures.
//
//   cd vanta-ts && npx tsx ../desktop-next/tools/record-company-fixtures.ts [outDir]
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { addDepartment, writeDepartments } from "../../vanta-ts/src/cofounder/department.js";
import { resetCompanyPorts, setCompanyPorts, type WorkerRunRequest } from "../../vanta-ts/src/desktop/company-ports.js";
import { settleRuns } from "../../vanta-ts/src/desktop/company-run-state.js";
import { COMPANY_SID, startCompanyHarness, type CompanyHarness } from "../../vanta-ts/src/desktop/__fixtures__/company-harness.js";
import { postWithApproval, stubRuntime } from "../../vanta-ts/src/desktop/__fixtures__/company-helpers.js";
import { openSse, type SseFrameJson } from "../../vanta-ts/src/desktop/__fixtures__/sse-harness.js";

const OUT = resolve(process.argv[2] ?? join(import.meta.dirname, "../apps/desktop/src/app/vanta/company/fixtures/recorded"));
const P = "/api/company";
const START = Date.parse("2026-10-13T08:00:00.000Z");
const STEP_MS = 97_000;

let tick = 0;
let counter = 0;
const clock = () => new Date(START + STEP_MS * tick++);
const ids = () => `r${String(++counter).padStart(4, "0")}`;

let release: () => void = () => undefined;
const held = new Promise<void>((done) => { release = done; });

/** One stub runtime whose behaviour follows the ticket title, so the board has every state. */
function runtimeFor(request: WorkerRunRequest) {
  const title = request.task.title;
  if (title.includes("[hold]")) return stubRuntime({ gate: () => held }).run(request);
  if (title.includes("[block]")) return stubRuntime({ result: { ok: false, error: "need the brand colour for the checkout buttons" } }).run(request);
  const reported = title.includes("[reported]");
  return stubRuntime({
    result: reported
      ? { cost: { usd: 0.42, basis: "reported" }, model: "claude-sonnet-5-5", provider: "anthropic" }
      : title.includes("[free]") ? { cost: undefined } : {},
  }).run(request);
}

async function hire(h: CompanyHarness, body: Record<string, unknown>) {
  const reply = await postWithApproval(h, `${P}/workers/hire`, { adapter: "openai", ...body });
  if (reply.status !== 200) throw new Error(`hire ${JSON.stringify(body)} failed: ${JSON.stringify(reply.body)}`);
}

async function ticket(h: CompanyHarness, title: string, worker?: string, extra: Record<string, unknown> = {}) {
  const made = await h.post(`${P}/tickets/create`, { title, ...extra });
  const id = made.body.ticket.id as string;
  if (worker) await h.post(`${P}/tickets/assign`, { ticketId: id, workerId: worker });
  return id;
}

async function scenario(h: CompanyHarness): Promise<void> {
  await hire(h, { role: "Engineer", title: "Head of engineering", budgetUsd: 5 });
  await hire(h, { role: "Designer", managerId: "engineer", budgetUsd: 0.1 });
  await hire(h, { role: "Analyst", managerId: "engineer", budgetUsd: 2 });
  await hire(h, { role: "Researcher", managerId: "analyst", budgetUsd: 3 });
  await hire(h, { role: "Support", managerId: "engineer", budgetUsd: 1 });
  const dept = addDepartment([], { name: "Product", workerIds: ["engineer", "designer", "analyst"], goalIds: [1] });
  if (!dept.ok) throw new Error(dept.error);
  await writeDepartments([dept.value]);

  await ticket(h, "Migrate invoices to the new ledger [reported]", "engineer", { requireReview: false });
  await settleRuns();
  await ticket(h, "Redesign the pricing page [free]", "designer", { requireReview: false });
  await settleRuns();
  await ticket(h, "Write the launch plan", "engineer", { expectedOutput: "report", description: "Keep it to one page. Include dates." });
  await settleRuns();
  await ticket(h, "Fix the checkout buttons [block]", "researcher", { requireReview: false });
  await settleRuns();
  await ticket(h, "Audit the onboarding emails");
  await ticket(h, "Polish the empty states", "designer", { requireReview: false });
  await ticket(h, "Rebuild the search index [hold]", "analyst", { requireReview: false });
  await h.post(`${P}/tickets/comment`, { ticketId: "T-3", text: "Please keep the tone plain. No exclamation marks." });
  await h.post(`${P}/workers/pause`, { workerId: "support", reason: "on leave until Monday" });
}

async function dump(out: string, name: string, h: CompanyHarness, path: string) {
  const reply = await h.get(path);
  if (reply.status !== 200) throw new Error(`${path} answered ${reply.status}: ${JSON.stringify(reply.body)}`);
  await writeFile(join(out, `${name}.json`), `${JSON.stringify(reply.body, null, 2)}\n`);
  return reply.body;
}

async function recordApprovals(h: CompanyHarness, out: string) {
  const read = async (path: string, body: unknown, file: string) => {
    const pending = h.post(path, body);
    let payload: unknown = null;
    for (let i = 0; i < 300 && !payload; i++) { payload = (await h.get("/api/approval")).body; if (!payload) await new Promise((r) => setTimeout(r, 10)); }
    await writeFile(join(out, file), `${JSON.stringify(payload, null, 2)}\n`);
    await h.post("/api/approval", { decision: "deny", id: (payload as { id: string }).id });
    await pending;
  };
  await read(`${P}/workers/hire`, { role: "Copywriter", adapter: "openai", budgetUsd: 1.5 }, "approval-hire.json");
  await read(`${P}/budgets/raise`, { scope: "agent:designer", limitUsd: 0.5 }, "approval-raise.json");
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const h = await startCompanyHarness();
  setCompanyPorts({ runtime: () => ({ id: "vanta-native", run: runtimeFor }), now: clock, newId: ids });
  const probe = await openSse(h.server.port, COMPANY_SID);
  try {
    await scenario(h);
    await dump(OUT, "company", h, "/api/company");
    const list = await dump(OUT, "tickets", h, "/api/tickets?limit=200");
    for (const t of list.tickets as Array<{ id: string }>) await dump(OUT, `ticket-${t.id}`, h, `/api/tickets/${t.id}`);
    await dump(OUT, "budgets", h, "/api/budgets");
    await dump(OUT, "activity", h, "/api/activity?limit=100");
    await dump(OUT, "activity-page1", h, "/api/activity?limit=5");
    await dump(OUT, "okrs", h, "/api/okrs");
    await dump(OUT, "work-products", h, "/api/work-products");
    await dump(OUT, "heartbeats", h, "/api/heartbeats");
    await dump(OUT, "runtimes", h, "/api/company/runtimes");
    await recordApprovals(h, OUT);
    const frames = probe.frames.filter((f): f is SseFrameJson => Boolean(f.typed));
    await writeFile(join(OUT, "events.json"), `${JSON.stringify(frames.slice(-40), null, 2)}\n`);
    console.log(`recorded ${list.tickets.length} tickets, ${frames.length} typed frames into ${OUT}`);
  } finally {
    release();
    probe.close();
    await settleRuns().catch(() => undefined);
    resetCompanyPorts();
    await h.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
