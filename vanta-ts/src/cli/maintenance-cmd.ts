import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { formatDocRouterHealth, readDocRouterHealth } from "../context/router-health.js";
import { formatMaintenanceBudget, listWorkTurns, summarizeMaintenanceBudget } from "../maintenance/budget.js";
import { listTickets, setInbox, setStatus, type TicketDeps } from "../tickets/store.js";

function value(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function needsHumanQueue(tickets: Awaited<ReturnType<typeof listTickets>>) {
  return tickets.filter((ticket) =>
    ticket.labels.includes("needs-human") && (ticket.status === "open" || ticket.status === "in_progress"));
}

function formatQueue(tickets: ReturnType<typeof needsHumanQueue>): string {
  if (!tickets.length) return "Needs-human queue\n  (clear)";
  return [
    `Needs-human queue · ${tickets.length} active`,
    ...tickets.map((ticket) => {
      const latest = ticket.comments.at(-1)?.text.split("\n").find((line) => line.startsWith("Next action:"));
      return `  ${ticket.id} [${ticket.inbox}] ${ticket.title}${latest ? `\n    ${latest}` : ""}`;
    }),
  ].join("\n");
}

function ticketDeps(): TicketDeps {
  return { now: () => new Date(), id: () => `tkt-${randomUUID().slice(0, 8)}` };
}

async function docsReport(repoRoot: string, dataDir: string, args: string[]) {
  const staleDays = Number(value(args, "--stale-days") ?? 90);
  return readDocRouterHealth(repoRoot, dataDir, {
    staleAfterMs: (Number.isFinite(staleDays) ? Math.max(0, staleDays) : 90) * 86_400_000,
  });
}

async function budgetReport(dataDir: string, args: string[]) {
  let rows = await listWorkTurns(dataDir);
  const since = value(args, "--since");
  if (since) {
    const cutoff = Date.parse(since);
    if (Number.isNaN(cutoff)) throw new Error(`invalid --since date: ${since}`);
    rows = rows.filter((row) => (Date.parse(row.ts) || 0) >= cutoff);
  }
  const thresholdPct = Number(value(args, "--threshold") ?? process.env.VANTA_MAINTENANCE_WARN_PCT ?? 60);
  const minTurns = Number(value(args, "--min-turns") ?? 5);
  return summarizeMaintenanceBudget(rows, {
    threshold: Number.isFinite(thresholdPct) ? thresholdPct / 100 : 0.6,
    minTurns: Number.isFinite(minTurns) ? minTurns : 5,
  });
}

type Handler = (repoRoot: string, dataDir: string, args: string[]) => Promise<number>;

const resolveTicket: Handler = async (_repoRoot, dataDir, args) => {
  const id = args[1];
  if (!id) { console.error("usage: vanta maintenance resolve <ticket-id>"); return 1; }
  const deps = ticketDeps();
  const updated = await setStatus(dataDir, id, "done", deps);
  if (!updated) { console.error(`no ticket "${id}"`); return 1; }
  await setInbox(dataDir, id, "archived", deps);
  console.log(`resolved ${id}`);
  return 0;
};

const showQueue: Handler = async (_repoRoot, dataDir, args) => {
  const queue = needsHumanQueue(await listTickets(dataDir));
  console.log(args.includes("--json") ? JSON.stringify(queue, null, 2) : formatQueue(queue));
  return 0;
};

const showDocs: Handler = async (repoRoot, dataDir, args) => {
  const report = await docsReport(repoRoot, dataDir, args);
  console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : formatDocRouterHealth(report));
  return 0;
};

const showBudget: Handler = async (_repoRoot, dataDir, args) => {
  try {
    const report = await budgetReport(dataDir, args);
    console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : formatMaintenanceBudget(report));
    return report.dominating && args.includes("--require-within-budget") ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

const showStatus: Handler = async (repoRoot, dataDir, args) => {
  const queue = needsHumanQueue(await listTickets(dataDir));
  const [docs, budget] = await Promise.all([docsReport(repoRoot, dataDir, args), budgetReport(dataDir, args)]);
  console.log([formatQueue(queue), formatDocRouterHealth(docs), formatMaintenanceBudget(budget)].join("\n\n"));
  return 0;
};

const HANDLERS: Record<string, Handler> = {
  status: showStatus,
  queue: showQueue,
  resolve: resolveTicket,
  docs: showDocs,
  budget: showBudget,
};

export async function runMaintenanceCommand(repoRoot: string, args: string[] = []): Promise<number> {
  const sub = args[0] ?? "status";
  const handler = HANDLERS[sub];
  if (handler) return handler(repoRoot, join(repoRoot, ".vanta"), args);
  console.error("usage: vanta maintenance [status|queue [--json]|resolve <ticket-id>|docs [--json] [--stale-days N]|budget [--json] [--since ISO] [--threshold PCT] [--min-turns N] [--require-within-budget]]");
  return 1;
}
