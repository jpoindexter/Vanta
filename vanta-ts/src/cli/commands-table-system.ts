import { createKernelClient } from "../kernel/client.js";
import { resolvePermissionMode } from "../modes/permission-mode.js";
import { runScheduleCommand, runCron } from "../schedule/commands.js";
import { runSetup } from "../setup.js";
import { runFullSetup } from "../setup-full.js";
import { runMessagingSetup } from "../setup-messaging.js";
import { commandExists, detectPlatform, formatPreflight, PREFLIGHT_TOOLS, runPreflight } from "../setup/preflight.js";
import { runTtsSetup } from "../setup-tts.js";
import { runStatus } from "../status.js";
import { usage } from "./commands.js";
import { buildCronRunTask, dataDirFor } from "./ops.js";
import { runServiceCommand } from "./service-cmd.js";

export async function runSetupCommand(root: string, rest: string[]): Promise<void> {
  if (rest[0] === "messaging") {
    await runMessagingSetup(root, undefined, { platformId: rest[1] });
  } else if (rest[0] === "tts") {
    await runTtsSetup(root);
  } else if (rest[0] === "model") {
    await runSetup(root);
  } else {
    await runFullSetup(root);
  }
}

export async function runCombinedStatus(root: string, rest: string[]): Promise<number | void> {
  const serviceCode = await runServiceCommand(root, ["status"]);
  const healthCode = await runStatus(process.env, rest);
  return serviceCode || healthCode;
}

export function runPreflightCommand(): number {
  const platform = detectPlatform();
  const result = runPreflight(commandExists, PREFLIGHT_TOOLS, platform);
  console.log(formatPreflight(result, platform));
  return result.ok ? 0 : 1;
}

export async function runScheduledCommand(root: string, rest: string[]): Promise<number> {
  const code = await runScheduleCommand(dataDirFor(root), rest);
  if (code !== 0) usage();
  return code;
}

export function runCronCommand(root: string): ReturnType<typeof runCron> {
  return runCron(dataDirFor(root), new Date(), buildCronRunTask(root), {
    kernel: createKernelClient(process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788", root),
    projectRoot: root,
    sessionId: `cron:${process.pid}`,
    permissionMode: resolvePermissionMode(process.env),
  });
}
