import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createConversation } from "../agent.js";
import type { LLMProvider } from "../providers/interface.js";
import type { KernelClient } from "../kernel/client.js";
import type { ToolRegistry } from "../tools/registry.js";
import { detectRecorder, recordAudio, type RecorderResult } from "./recorder.js";
import { transcribeAudio, type TranscribeResult } from "./whisper-stt.js";
import { detectWakePhrase } from "./wake-detector.js";

const execAsync = promisify(execFile);

export type WakeLoopResult = { windows: number; wakes: number; turns: number };

export type WakeLoopDeps = {
  phrase?: string;
  windowSec?: number;
  turnSec?: number;
  model?: string;
  signal?: AbortSignal;
  maxWindows?: number;
  log?: (message: string) => void;
  shouldContinue?: () => boolean | Promise<boolean>;
  capture?: (seconds: number) => Promise<RecorderResult>;
  transcribe?: (path: string, model: string) => TranscribeResult | Promise<TranscribeResult>;
  chime?: () => Promise<void>;
  onTurn: (text: string) => Promise<void>;
};

type WakeWindow = { woke: false } | { woke: true; command: string | null };
type WakeRuntime = { phrase: string; windowSec: number; turnSec: number; model: string };

async function localClip(deps: WakeLoopDeps, seconds: number, model: string): Promise<TranscribeResult> {
  const capture = deps.capture ?? ((duration) => recordAudio(duration));
  const clip = await capture(seconds);
  try {
    return await (deps.transcribe ?? ((path, selected) => transcribeAudio(path, { model: selected })))(clip.path, model);
  } finally {
    await clip.cleanup();
  }
}

async function defaultChime(): Promise<void> {
  if (process.platform !== "darwin") return;
  await execAsync("afplay", ["/System/Library/Sounds/Tink.aiff"]).catch(() => {});
}

async function safeLocalClip(deps: WakeLoopDeps, seconds: number, model: string): Promise<TranscribeResult> {
  try {
    return await localClip(deps, seconds, model);
  } catch (error) {
    (deps.log ?? console.log)(`Wake listener capture failed: ${error instanceof Error ? error.message : String(error)}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return { ok: false, error: "capture failed" };
  }
}

async function resolveWakeWindow(deps: WakeLoopDeps, heard: TranscribeResult, runtime: WakeRuntime): Promise<WakeWindow> {
  if (!heard.ok) return { woke: false };
  const wake = detectWakePhrase(heard.text, runtime.phrase);
  if (!wake.matched) return { woke: false };
  const log = deps.log ?? console.log;
  log("[Hey Vanta heard · listening]");
  await (deps.chime ?? defaultChime)();
  if (wake.command) return { woke: true, command: wake.command };
  const turn = await safeLocalClip(deps, runtime.turnSec, runtime.model);
  if (!turn.ok || !turn.text.trim()) {
    log("[nothing heard after wake]");
    return { woke: true, command: null };
  }
  return { woke: true, command: turn.text.trim() };
}

function withinWindowLimit(windows: number, maxWindows?: number): boolean {
  return maxWindows === undefined || windows < maxWindows;
}

function resolveWakeRuntime(deps: WakeLoopDeps): WakeRuntime {
  return {
    phrase: deps.phrase?.trim() || "hey vanta",
    windowSec: Math.min(6, Math.max(2, deps.windowSec ?? 3)),
    turnSec: Math.min(30, Math.max(3, deps.turnSec ?? 6)),
    model: deps.model?.trim() || "tiny.en",
  };
}

async function shouldRunWindow(deps: WakeLoopDeps, windows: number): Promise<boolean> {
  if (deps.signal?.aborted) return false;
  if (!withinWindowLimit(windows, deps.maxWindows)) return false;
  return deps.shouldContinue ? deps.shouldContinue() : true;
}

/** Continuously detect locally; only call `onTurn` after the wake phrase fires. */
export async function runWakeLoop(deps: WakeLoopDeps): Promise<WakeLoopResult> {
  const runtime = resolveWakeRuntime(deps);
  const log = deps.log ?? console.log;
  const result: WakeLoopResult = { windows: 0, wakes: 0, turns: 0 };

  while (await shouldRunWindow(deps, result.windows)) {
    const heard = await safeLocalClip(deps, runtime.windowSec, runtime.model);
    result.windows += 1;
    const window = await resolveWakeWindow(deps, heard, runtime);
    if (!window.woke) continue;
    result.wakes += 1;
    if (!window.command) continue;
    log(`You: ${window.command}`);
    await deps.onTurn(window.command);
    result.turns += 1;
  }
  return result;
}

export type WakeVoiceDeps = {
  provider: LLMProvider;
  safety: KernelClient;
  registry: ToolRegistry;
  root: string;
  systemPrompt: string;
  phrase?: string;
  windowSec?: number;
  turnSec?: number;
  model?: string;
  signal?: AbortSignal;
  shouldContinue?: () => boolean | Promise<boolean>;
  log?: (message: string) => void;
};

/** Production wake listener: local wake gate, then the existing Vanta conversation. */
export async function runWakeVoiceLoop(deps: WakeVoiceDeps): Promise<WakeLoopResult> {
  const log = deps.log ?? console.log;
  const recorder = await detectRecorder();
  if (!recorder) throw new Error("Wake word needs ffmpeg or sox (brew install ffmpeg)");
  const convo = createConversation(deps.systemPrompt, {
    provider: deps.provider,
    safety: deps.safety,
    registry: deps.registry,
    root: deps.root,
    requestApproval: async () => false,
    onText: (text) => log(`Vanta: ${text}`),
  });
  log(`Wake word active · say “${deps.phrase ?? "Hey Vanta"}” · local detection · Ctrl+C to stop`);
  return runWakeLoop({
    ...deps,
    capture: (seconds) => recordAudio(seconds, recorder),
    onTurn: async (text) => {
      const outcome = await convo.send(text);
      if (outcome.finalText.trim() && process.platform === "darwin") {
        await execAsync("say", [outcome.finalText.slice(0, 500)]).catch(() => {});
      }
    },
  });
}
