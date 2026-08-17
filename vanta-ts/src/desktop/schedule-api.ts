import type http from "node:http";
import { dataDirFor } from "../cli/ops.js";
import { loadCron } from "../schedule/cron.js";
import { sendJson, type DesktopState } from "./handlers.js";

export async function handleDesktopSchedules(state: DesktopState, res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await loadCron(dataDirFor(state.root)));
}
