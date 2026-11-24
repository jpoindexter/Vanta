import { readDepartments, type Department } from "../cofounder/department.js";
import { readRevisions, type RevisionRecord } from "../cofounder/outcome-approval.js";
import { readWorkProducts, type WorkProduct } from "../cofounder/work-products.js";
import { latestWorkers, readTeam, type Worker } from "../team/store.js";
import { latestTasks, readTasks, type WorkerTask } from "../team/tasks.js";
import { listTickets, type Ticket } from "../tickets/store.js";
import type { CompanyCtx } from "./company-context.js";
import { readRuns } from "./company-runs.js";
import type { RunRecord } from "./company-schemas.js";

/** One consistent read of every store the company views are built from. */
export type CompanySnapshot = {
  now: Date;
  home: string;
  workers: Worker[];
  tasks: WorkerTask[];
  tickets: Ticket[];
  products: WorkProduct[];
  revisions: RevisionRecord[];
  runs: RunRecord[];
  departments: Department[];
};

export async function loadSnapshot(ctx: CompanyCtx): Promise<CompanySnapshot> {
  const [team, tasks, tickets, products, revisions, runs, departments] = await Promise.all([
    readTeam(ctx.env),
    readTasks(ctx.env),
    listTickets(ctx.dataDir),
    readWorkProducts(ctx.env),
    readRevisions(ctx.env),
    readRuns(ctx.home),
    readDepartments(ctx.env),
  ]);
  return {
    now: ctx.ports.now(),
    home: ctx.home,
    workers: latestWorkers(team),
    tasks: latestTasks(tasks),
    tickets,
    products,
    revisions,
    runs,
    departments,
  };
}
