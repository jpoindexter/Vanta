import type http from "node:http";
import { dataDirFor } from "../cli/ops.js";
import { loadCron } from "../schedule/cron.js";
import { lastRunByJob } from "../schedule/run-log.js";
import { sendJson, type DesktopState } from "./handlers.js";

/** The schedule list; an entry that has run carries `lastRun` (when, success, short summary). */
export async function handleDesktopSchedules(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const dataDir = dataDirFor(state.root);
  const [entries, runs] = await Promise.all([loadCron(dataDir), lastRunByJob(dataDir)]);
  sendJson(res, 200, entries.map((entry) => {
    const run = runs.get(entry.id);
    return run ? { ...entry, lastRun: { at: run.at, ok: run.ok, summary: run.summary.slice(0, 300) } } : entry;
  }));
}
