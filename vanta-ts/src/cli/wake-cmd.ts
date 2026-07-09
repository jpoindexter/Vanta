import { enableWakeService, disableWakeService, managedWakeEnabled, wakeServiceStatus } from "../voice/wake-service.js";
import { assertWakeReady } from "../voice/wake-readiness.js";

function formatStatus(status: Awaited<ReturnType<typeof wakeServiceStatus>>): string {
  return [
    `wake word: ${status.enabled ? "enabled" : "disabled"} · listener ${status.running ? "running" : "stopped"}`,
    `phrase: ${process.env.VANTA_WAKE_PHRASE?.trim() || "Hey Vanta"} · detection: local Whisper`,
    `logs: ${status.logPath}`,
  ].join("\n");
}

export async function runWakeCommand(repoRoot: string, rest: string[], log: (line: string) => void = console.log): Promise<void> {
  const sub = rest[0] ?? "status";
  if (sub === "status") return void log(formatStatus(await wakeServiceStatus()));
  if (sub === "off" || sub === "disable") {
    log(formatStatus(await disableWakeService()));
    return;
  }
  if (sub === "on" || sub === "enable") {
    await enableManagedWake(repoRoot, log);
    return;
  }
  if (sub === "listen") {
    await listenForWake(repoRoot);
    return;
  }
  log("Usage: vanta voice wake on | off | status | listen");
}

async function enableManagedWake(repoRoot: string, log: (line: string) => void): Promise<void> {
  if (process.platform !== "darwin") throw new Error("Managed wake word is currently supported on macOS; use `vanta voice wake listen` in the foreground elsewhere.");
  await assertWakeReady();
  log(formatStatus(await enableWakeService(repoRoot)));
}

async function listenForWake(repoRoot: string): Promise<void> {
  await assertWakeReady();
  const { prepareRun } = await import("../session.js");
  const { runWakeVoiceLoop } = await import("../voice/wake-loop.js");
  const setup = await prepareRun(repoRoot, "wake word voice session");
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const instance = process.env.VANTA_WAKE_INSTANCE ?? "";
  try {
    await runWakeVoiceLoop({
      provider: setup.provider, safety: setup.safety, registry: setup.registry,
      root: repoRoot, systemPrompt: setup.systemPrompt,
      phrase: process.env.VANTA_WAKE_PHRASE,
      windowSec: Number(process.env.VANTA_WAKE_WINDOW_SEC) || undefined,
      turnSec: Number(process.env.VANTA_VOICE_DURATION) || undefined,
      model: process.env.VANTA_WAKE_MODEL, signal: controller.signal,
      shouldContinue: process.env.VANTA_WAKE_MANAGED === "1" ? () => managedWakeEnabled(instance) : undefined,
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
