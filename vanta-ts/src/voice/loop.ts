import { recordAudio, detectRecorder } from "./recorder.js";
import type { LLMProvider } from "../providers/interface.js";
import type { KernelClient } from "../kernel/client.js";
import type { ToolRegistry } from "../tools/registry.js";
import { createConversation } from "../agent.js";
import { createVoiceTurnSpeaker, type VoiceTurnSpeaker } from "../tts/streaming.js";
import { randomUUID } from "node:crypto";
import { executeToolEffect } from "../effects/tool-effect-gateway.js";

type VoiceDeps = {
  provider: LLMProvider;
  safety: KernelClient;
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
  speaker: VoiceTurnSpeaker,
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
  const xResult = await executeToolEffect("transcribe", { path: rec.path }, transcribeTool, {
    root: deps.root,
    effectCallId: `voice-transcribe:${randomUUID()}`,
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

  const { speech } = await speaker.run(() => convo.send(text));
  if (speech.error) {
    log(`[speech unavailable: ${speech.error}]`);
  } else if (speech.mode === "streaming" && speech.firstClauseMs !== undefined) {
    log(`[speech started after first clause · ${speech.firstClauseMs}ms]`);
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

  const speaker = createVoiceTurnSpeaker(process.env);
  const convo = createConversation(deps.systemPrompt, {
    provider: deps.provider,
    safety: deps.safety,
    registry: deps.registry,
    root: deps.root,
    requestApproval: async () => false, // voice mode auto-denies risky ops
    onText: (text) => log(`Vanta: ${text}`),
    ...speaker.callbacks,
  });

  log(`Voice mode active — ${duration}s per turn, Ctrl+C to exit.`);
  let running = true;
  const onSigint = () => { running = false; };
  process.once("SIGINT", onSigint);

  try {
    while (running) {
      await handleVoiceTurn(convo, recorder, deps, log, speaker);
    }
  } finally {
    process.removeListener("SIGINT", onSigint);
    log("Voice mode ended.");
  }
}
