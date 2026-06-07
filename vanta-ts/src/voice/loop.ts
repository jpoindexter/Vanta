import { createInterface } from "node:readline/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { recordAudio, detectRecorder } from "./recorder.js";
import type { LLMProvider } from "../providers/interface.js";
import type { SafetyClient } from "../safety-client.js";
import type { ToolRegistry } from "../tools/registry.js";
import { runAgent, createConversation } from "../agent.js";

const execAsync = promisify(execFile);

type VoiceDeps = {
  provider: LLMProvider;
  safety: SafetyClient;
  registry: ToolRegistry;
  root: string;
  systemPrompt: string;
  durationSec?: number;
  log?: (msg: string) => void;
};

type Recorder = NonNullable<Awaited<ReturnType<typeof detectRecorder>>>;

/** One voice turn: record → transcribe → agent → speak. Returns to let the loop continue. */
async function handleVoiceTurn(
  convo: ReturnType<typeof createConversation>,
  recorder: Recorder,
  deps: VoiceDeps,
  log: (msg: string) => void,
): Promise<void> {
  const duration = deps.durationSec ?? 5;
  log("\n[Recording…]");
  const rec = await recordAudio(duration, recorder).catch((err: unknown) => {
    log(`Recording failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  });
  if (!rec) { await new Promise((r) => setTimeout(r, 1000)); return; }

  log("[Transcribing…]");
  const { transcribeTool } = await import("../tools/transcribe.js");
  const xResult = await transcribeTool.execute({ path: rec.path }, {
    root: deps.root,
    safety: deps.safety,
    requestApproval: async () => false,
  });
  await rec.cleanup();

  if (!xResult.ok || !xResult.output.trim()) {
    log("[nothing heard]");
    return;
  }
  const text = xResult.output.trim();
  log(`You: ${text}`);

  const outcome = await convo.send(text);
  if (outcome.finalText.trim()) {
    // Speak the response via macOS `say`
    await execAsync("say", [outcome.finalText.slice(0, 500)]).catch(() => {});
  }
}

/**
 * Run the voice conversational loop: record → transcribe → agent → speak.
 * Loops until SIGINT (Ctrl+C). Degrades gracefully when mic/STT is unavailable.
 */
export async function runVoiceLoop(deps: VoiceDeps): Promise<void> {
  const log = deps.log ?? console.log;
  const duration = deps.durationSec ?? 5;

  const recorder = await detectRecorder();
  if (!recorder) {
    log("Voice mode requires sox or ffmpeg. Install one and retry.\n  brew install sox");
    return;
  }

  const convo = createConversation(deps.systemPrompt, {
    provider: deps.provider,
    safety: deps.safety,
    registry: deps.registry,
    root: deps.root,
    requestApproval: async () => false, // voice mode auto-denies risky ops
    onText: (text) => log(`Vanta: ${text}`),
  });

  log(`Voice mode active — ${duration}s per turn, Ctrl+C to exit.`);
  let running = true;
  const onSigint = () => { running = false; };
  process.once("SIGINT", onSigint);

  try {
    while (running) {
      await handleVoiceTurn(convo, recorder, deps, log);
    }
  } finally {
    process.removeListener("SIGINT", onSigint);
    log("Voice mode ended.");
  }
}
