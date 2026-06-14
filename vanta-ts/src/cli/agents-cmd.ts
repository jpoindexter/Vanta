import {
  advanceTask,
  appendTask,
  assignTask,
  latestTasks,
  readTasks,
  type TaskStatus,
  type WorkerTask,
} from "../team/tasks.js";
import { loadSettings } from "../settings/store.js";
import {
  serviceStatus as defaultServiceStatus,
  uninstallService as defaultUninstallService,
  type ServiceStatus,
} from "../service/manager.js";

export type AgentsCommandDeps = {
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  serviceStatus?: () => Promise<ServiceStatus>;
  uninstallService?: () => Promise<void>;
};

function visibleTasks(tasks: WorkerTask[]): WorkerTask[] {
  return latestTasks(tasks)
    .filter((task) => task.status !== "removed")
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

function formatList(tasks: WorkerTask[]): string[] {
  if (tasks.length === 0) return ["Agents — 0 sessions", "(no agent sessions)"];
  return [
    `Agents — ${tasks.length} ${plural(tasks.length, "session")}`,
    ...tasks.map((task) => `${task.id} · ${task.workerId} · ${task.status} · ${task.title}`),
  ];
}

function formatDetails(task: WorkerTask): string[] {
  return [
    `${task.id} · ${task.workerId} · ${task.status} · ${task.title}`,
    `created ${task.created}`,
    `updated ${task.updated}`,
    ...(task.result ? [`result ${task.result}`] : []),
    ...(task.blocker ? [`blocker ${task.blocker}`] : []),
  ];
}

function findVisible(tasks: WorkerTask[], id: string): WorkerTask | undefined {
  return visibleTasks(tasks).find((task) => task.id === id);
}

async function appendTransition(
  task: WorkerTask,
  toStatus: TaskStatus,
  detail: string,
  env: NodeJS.ProcessEnv,
): Promise<{ ok: true; task: WorkerTask } | { ok: false; error: string }> {
  const next = advanceTask(task, toStatus, detail);
  if (!next.ok) return { ok: false, error: next.error };
  await appendTask(next.value, env);
  return { ok: true, task: next.value };
}

function respawnId(id: string): string {
  return `${id}-respawn-${Date.now().toString(36)}`;
}

async function printDaemonStatus(log: (line: string) => void, serviceStatus: () => Promise<ServiceStatus>): Promise<number> {
  const status = await serviceStatus();
  log(`daemon platform ${status.platform}`);
  log(`installed ${status.installed ? "yes" : "no"}`);
  log(`running ${status.running ? "yes" : "no"}`);
  log(`plist ${status.plistPath}`);
  return 0;
}

async function stopDaemon(log: (line: string) => void, uninstallService: () => Promise<void>): Promise<number> {
  await uninstallService();
  log("daemon stopped");
  return 0;
}

function usage(log: (line: string) => void): number {
  log("Usage: vanta agents [list|logs|attach|stop|rm|respawn <id>|daemon status|daemon stop]");
  return 1;
}

async function agentViewDisabled(projectRoot: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const settings = await loadSettings(projectRoot, env);
  return Boolean(settings.disableAgentView || env.VANTA_DISABLE_AGENT_VIEW === "1");
}

async function handleDaemonCommand(
  action: string | undefined,
  log: (line: string) => void,
  serviceStatus: () => Promise<ServiceStatus>,
  uninstallService: () => Promise<void>,
): Promise<number> {
  if (action === "status" || !action) return printDaemonStatus(log, serviceStatus);
  if (action === "stop") return stopDaemon(log, uninstallService);
  return usage(log);
}

async function handleTaskCommand(
  cmd: string,
  id: string | undefined,
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
): Promise<number> {
  const tasks = await readTasks(env);
  if (cmd === "list") {
    for (const line of formatList(visibleTasks(tasks))) log(line);
    return 0;
  }
  if (!id) return usage(log);

  const task = findVisible(tasks, id);
  if (!task) {
    log(`agent session not found: ${id}`);
    return 1;
  }
  if (cmd === "logs" || cmd === "attach") return printTaskDetails(task, log);
  if (cmd === "stop") return stopTask(task, env, log);
  if (cmd === "rm") return removeTask(task, env, log);
  if (cmd === "respawn") return respawnTask(tasks, task, env, log);
  return usage(log);
}

function printTaskDetails(task: WorkerTask, log: (line: string) => void): number {
  for (const line of formatDetails(task)) log(line);
  return 0;
}

async function stopTask(task: WorkerTask, env: NodeJS.ProcessEnv, log: (line: string) => void): Promise<number> {
  const stopped = await appendTransition(task, "stopped", "stopped by operator", env);
  if (!stopped.ok) {
    log(stopped.error);
    return 1;
  }
  log(`${stopped.task.id} · ${stopped.task.status}`);
  return 0;
}

async function removeTask(task: WorkerTask, env: NodeJS.ProcessEnv, log: (line: string) => void): Promise<number> {
  const removed = await appendTransition(task, "removed", "removed by operator", env);
  if (!removed.ok) {
    log(removed.error);
    return 1;
  }
  log("agent session removed");
  return 0;
}

async function respawnTask(
  tasks: WorkerTask[],
  task: WorkerTask,
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
): Promise<number> {
  const assigned = assignTask(tasks, respawnId(task.id), task.workerId, task.title);
  if (!assigned.ok) {
    log(assigned.error);
    return 1;
  }
  await appendTask(assigned.value, env);
  log(`${assigned.value.id} · ${assigned.value.workerId} · assigned · ${assigned.value.title}`);
  return 0;
}

export async function runAgentsCommand(
  projectRoot: string,
  rest: string[],
  deps: AgentsCommandDeps = {},
): Promise<number> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;
  const serviceStatus = deps.serviceStatus ?? defaultServiceStatus;
  const uninstallService = deps.uninstallService ?? defaultUninstallService;
  if (await agentViewDisabled(projectRoot, env)) {
    log("agent view disabled");
    return 1;
  }

  const [cmd = "list", id] = rest;
  if (cmd === "daemon") {
    return handleDaemonCommand(id, log, serviceStatus, uninstallService);
  }
  return handleTaskCommand(cmd, id, env, log);
}
