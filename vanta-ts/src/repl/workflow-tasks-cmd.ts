import { listWorkflowTasks, formatWorkflowTasks } from "../workflow/task-store.js";
import type { SlashHandler } from "./types.js";

// /wftasks — the LocalWorkflowTask list: every compose_workflow run, its
// progress (running → done/failed), and the captured outcome. Separate from the
// operator task stack (/tasks) and the team ledger.
export const wftasks: SlashHandler = async (_arg, ctx) => {
  const tasks = await listWorkflowTasks(ctx.dataDir);
  return { output: formatWorkflowTasks(tasks) };
};
