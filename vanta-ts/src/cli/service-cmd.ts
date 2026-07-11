import { join } from "node:path";
import { installService, restartService, serviceLogs, serviceStatus, stopService, uninstallService } from "../service/manager.js";
import { resolveVantaHome } from "../store/home.js";

type Action = (repoRoot: string, rest: string[]) => Promise<number>;

const actions: Record<string, Action> = {
  install: async (repoRoot) => {
    const path = await installService(repoRoot);
    console.log(`Service installed and running: ${path}`);
    console.log(`Logs: ${join(resolveVantaHome(), "gateway.log")}`);
    return 0;
  },
  restart: async () => { await restartService(); console.log("Service restarted."); return 0; },
  stop: async () => { await stopService(); console.log("Service stopped (installation preserved)."); return 0; },
  logs: async (_root, rest) => { console.log(await serviceLogs(Number(rest[1]) || 100)); return 0; },
  status: async () => {
    const status = await serviceStatus();
    console.log(`service platform ${status.platform} · installed ${status.installed ? "yes" : "no"} · running ${status.running ? "yes" : "no"} · stale ${status.stale ? "yes" : "no"}`);
    console.log(status.artifactPath ?? status.plistPath);
    if (status.detail) console.log(status.detail);
    return 0;
  },
  uninstall: async () => { await uninstallService(); console.log("Service uninstalled."); return 0; },
};
actions.up = actions.install!;

export async function runServiceCommand(repoRoot: string, rest: string[]): Promise<number> {
  const sub = rest[0] ?? "status";
  const action = actions[sub];
  if (!action) {
    console.log("Usage: vanta service install|up|restart|stop|logs [lines]|status|uninstall");
    return 1;
  }
  try {
    return await action(repoRoot, rest);
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
